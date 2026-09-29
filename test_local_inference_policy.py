"""Routing regression tests without starting the desktop backend."""
import ast
from pathlib import Path
from types import SimpleNamespace as NS
import unittest

SOURCE = ast.parse(Path('Meera.py').read_text(encoding='utf-8'))

def method(name):
    node = next(n for n in ast.walk(SOURCE) if isinstance(n, ast.FunctionDef) and n.name == name)
    node.decorator_list = []
    scope = dict(Tuple=tuple, ChatCompletionRequest=object, InferenceMode=NS(CLOUD='cloud'),
                 HTTPException=lambda code, message: ValueError(message),
                 NATIVE_GGUF_RUNTIME=NS(is_loaded=lambda: True),
                 CloudInferenceEngine=NS(_strip_provider_prefix=lambda model, pid: model))
    exec(compile(ast.Module(body=[node], type_ignores=[]), '<routing>', 'exec'), scope)
    return scope[name]

class RoutingTests(unittest.TestCase):
    def setUp(self):
        self.route = method('_determine_provider')
        self.service = NS(persistence=NS(config=NS(
            inference=NS(mode='local', default_cloud_provider='paid', default_local_provider='lmstudio'),
            cloud_providers={'paid': NS(connected=True, models=['same-name'])})))
    def test_model_name_cannot_enable_cloud(self):
        self.assertEqual(self.route(self.service, NS(model='same-name', inference_mode='local', provider=None)), ('__native__', 'local'))
    def test_default_local_cannot_enable_cloud(self):
        self.assertEqual(self.route(self.service, NS(model='same-name', inference_mode=None, provider=None)), ('__native__', 'local'))
    def test_conflicting_provider_rejected(self):
        with self.assertRaises(ValueError):
            self.route(self.service, NS(model='same-name', inference_mode='local', provider='paid'))
    def test_explicit_cloud_works(self):
        self.assertEqual(self.route(self.service, NS(model='same-name', inference_mode='cloud', provider='paid')), ('paid', 'cloud'))

if __name__ == '__main__':
    unittest.main()

class SmallContextTests(unittest.TestCase):
    def test_greeting_clears_tools_after_registration(self):
        from agent_planner import is_bare_greeting
        self.assertTrue(is_bare_greeting('Hi there!'))
        node = next(n for n in ast.walk(SOURCE) if isinstance(n, ast.If)
                    and isinstance(n.test, ast.BoolOp)
                    and 'has_attached_documents' in ast.unparse(n.test)
                    and 'self._is_bare_greeting(last_user_msg)' in ast.unparse(n.test))
        for attached in (False, True):
            scope = dict(self=NS(_is_bare_greeting=is_bare_greeting), last_user_msg='Hi there!',
                         has_attached_documents=attached, tools=[{'function': {'name': 'execute_terminal'}}])
            exec(compile(ast.Module(body=[node], type_ignores=[]), '<greeting>', 'exec'), scope)
            self.assertEqual(bool(scope['tools']), attached)

    def test_4096_uses_compact_tools(self):
        assignment = next(n for n in ast.walk(SOURCE) if isinstance(n, ast.Assign)
                          and ast.unparse(n) == "is_small_context = mode == 'local' and _real_ctx <= 8192")
        scope = dict(mode='local', _real_ctx=4096)
        exec(compile(ast.Module(body=[assignment], type_ignores=[]), '<context>', 'exec'), scope)
        self.assertTrue(scope['is_small_context'])
