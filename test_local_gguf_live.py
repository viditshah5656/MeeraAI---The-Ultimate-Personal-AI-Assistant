"""Opt-in real GGUF/Meera HTTP smoke test; no cloud credentials or network."""
import asyncio, json, os, tempfile
from pathlib import Path

async def main():
    with tempfile.TemporaryDirectory(prefix='meera-local-smoke-') as data:
        os.environ['MEERA_DATA_DIR'] = data
        import Meera as m
        import httpx
        m.logger.setLevel('WARNING')
        calls = []
        async def deny_cloud(*args, **kwargs):
            calls.append('cloud')
            raise AssertionError('Cloud inference attempted')
        m.CloudInferenceEngine.chat_completion = deny_cloud
        persistence = m.PersistenceManager()
        persistence.config.inference.mode = m.InferenceMode.LOCAL
        cloud = m.CloudInferenceEngine(persistence)
        local = m.LocalInferenceEngine(persistence)
        mcp = m.MCPManager(persistence)
        rag = m.PageIndexingRAG(persistence, cloud, local)
        images = m.ImageSearchService(persistence)
        models = m.GGUFModelManager(persistence, local, cloud)
        params = m.ParameterResolver(persistence.config.parameters)
        service = m.ChatService(persistence, cloud, local, mcp, rag, images, models, params)
        app = m.FastAPI()
        app.include_router(m.create_router(persistence, cloud, local, mcp, rag, images, models, params, service))
        entry = m.lookup_local_model('Qwen3.5-0.8B-GGUF')
        assert entry, 'Nano GGUF missing'
        runtime = m.NATIVE_GGUF_RUNTIME
        await runtime.load_model(entry, {'context_length':4096, 'gpu_layers_mode':'cpu', 'evaluation_batch_size':256,
            'physical_batch_size':128, 'k_cache_quantization_type':'f16','v_cache_quantization_type':'f16',
            'flash_attention':False, 'cpu_thread_pool_size':4}, '')
        await runtime._load_task
        assert runtime.is_loaded(), m.MODEL_LOAD_STATE
        print('LOADED', runtime._model_path, flush=True)
        direct = await local.chat_completion('__native__', entry['id'], [{'role':'system','content':'You are a helpful assistant.'}, {'role':'user','content':'Hi there!'}], {'max_tokens':80,'temperature':0.7}, stream=False)
        print('DIRECT', json.dumps(direct, ensure_ascii=True), flush=True)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test', timeout=180) as client:
            for prompt in ['Hi there!', 'What is 2 + 2? Answer briefly.']:
                body = {'model':entry['id'], 'message':prompt, 'inference_mode':'local','provider':'__native__',
                        'max_tokens':128,'temperature':0.7,'use_web_grounding':False,'use_rag':False,
                        'use_mcp':False,'enable_image_search':False,'enable_file_tools':False,'skip_terminal_autoexec':True}
                response = await client.post('/api/chat/stream', json=body)
                events = []
                for block in response.text.split('\n\n'):
                    for line in block.splitlines():
                        if line.startswith('data: '):
                            try: events.append(json.loads(line[6:]))
                            except ValueError: pass
                done = [e for e in events if 'reply' in e]
                result = done[-1] if done else {'error':response.text[:500]}
                print('API', prompt, json.dumps(result, ensure_ascii=True), flush=True)
                assert not result.get('error'), result
                reply = result.get('reply','')
                assert reply.strip() and 'No external' not in reply and len(reply) < 1600, reply
                if '2 + 2' in prompt: assert '4' in reply, reply
        assert not calls, calls
        print('PASS: real local HTTP streaming; zero cloud calls', flush=True)
        runtime.unload()
        await cloud.close(); await local.close(); await images.close()

if __name__ == '__main__':
    asyncio.run(main())
