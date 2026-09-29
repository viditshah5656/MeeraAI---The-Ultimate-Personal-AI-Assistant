from llama_cpp import Llama
import numpy as np
m=Llama(model_path='models/Qwen3.5-0.8B-GGUF/Qwen3.5-0.8B-BF16.gguf', n_ctx=512, n_batch=128,n_ubatch=128,n_gpu_layers=0, n_threads=4, offload_kqv=False, op_offload=False, verbose=False)
print('ARCH',m.metadata.get('general.architecture'),'FORMAT',m.chat_format,flush=True)
print('TEMPLATE_END',m.metadata.get('tokenizer.chat_template','')[-550:],flush=True)
prompt='<|im_start|>user\nHi there!<|im_end|>\n<|im_start|>assistant\n'
tokens=m.tokenize(prompt.encode(),special=True)
for i in range(5):
    m.eval(tokens)
    scores=np.ctypeslib.as_array(m._ctx.get_logits(),shape=(m.n_vocab(),)).copy()
    tok=int(scores.argmax())
    print(i,'top',tok,m.detokenize([tok]),'score',float(scores[tok]),'ith',int(np.ctypeslib.as_array(m._ctx.get_logits_ith(-1),shape=(m.n_vocab(),)).argmax()),'n',m.n_tokens,flush=True)
    tokens=[tok]
import ctypes, types, llama_cpp
old_init=m._init_sampler
def init_sampler(**kwargs):
    sampler=old_init(**kwargs)
    def sample(self,ctx,idx=-1):
        logits=np.ctypeslib.as_array(ctx.get_logits_ith(idx),shape=(m.n_vocab(),))
        buf=np.empty(m.n_vocab(), dtype=[('id',np.int32),('logit',np.float32),('p',np.float32)])
        buf['id']=np.arange(m.n_vocab());buf['logit']=logits;buf['p']=0
        arr=llama_cpp.llama_token_data_array(buf.ctypes.data_as(ctypes.POINTER(llama_cpp.llama_token_data)),m.n_vocab(),-1,False)
        llama_cpp.llama_sampler_apply(self.sampler,ctypes.byref(arr))
        token=arr.data[arr.selected].id
        self.accept(token)
        return token
    sampler.sample=types.MethodType(sample,sampler)
    return sampler
m._init_sampler=init_sampler
print('CHAT',m.create_chat_completion(messages=[{'role':'system','content':'You are Meera, a helpful assistant.'},{'role':'user','content':'Hi there!'}],max_tokens=40,temperature=0.7)['choices'],flush=True)
m.close()
