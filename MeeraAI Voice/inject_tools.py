import sys

def inject_tools():
    with open('C:\\MeeraAI\\meera_runtime\\supervisor.py', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Add register calls
    register_code = '''
        self.tools.register(ToolDefinition(
            "system.see_screen", "Read the screen headlessly to understand what the user is looking at.",
            {"type": "object", "properties": {}, "additionalProperties": False},
            PermissionClass.READ_ONLY, 10, self._see_screen,
        ))
        self.tools.register(ToolDefinition(
            "system.search_files", "Search files deeply on the user's computer using a glob pattern.",
            {"type": "object", "properties": {"pattern": {"type": "string"}, "root": {"type": "string", "default": "C:\\\\"}}, "required": ["pattern"], "additionalProperties": False},
            PermissionClass.READ_ONLY, 30, self._search_files,
        ))
        self.tools.register(ToolDefinition(
            "system.open_app_universal", "Open any app by name on the user's computer.",
            {"type": "object", "properties": {"app_name": {"type": "string"}}, "required": ["app_name"], "additionalProperties": False},
            PermissionClass.REVERSIBLE_WRITE, 10, self._open_app_universal,
        ))
'''
    content = content.replace('        self.tools.register(ToolDefinition(\n            "system.open_app"', register_code + '        self.tools.register(ToolDefinition(\n            "system.open_app"')
    
    # 2. Add methods
    methods_code = '''
    def _search_files(self, arguments: dict, token: CancellationToken) -> ToolResult:
        import os
        import glob
        pattern = arguments.get("pattern", "*")
        root = arguments.get("root", "C:\\\\")
        try:
            results = []
            for path in glob.glob(os.path.join(root, "**", pattern), recursive=True):
                token.raise_if_cancelled()
                if len(results) >= 100:
                    results.append("...(truncated)")
                    break
                results.append(path)
            return ToolResult(True, "Search complete", {"matches": results})
        except Exception as e:
            return ToolResult(False, str(e))

    def _open_app_universal(self, arguments: dict, token: CancellationToken) -> ToolResult:
        app_name = arguments.get("app_name", "")
        if not app_name:
            return ToolResult(False, "App name missing")
        try:
            import subprocess
            subprocess.Popen(["powershell", "-Command", f"Start-Process '{app_name}'"], shell=True)
            return ToolResult(True, f"Started {app_name}")
        except Exception as e:
            return ToolResult(False, str(e))

    def _see_screen(self, arguments: dict, token: CancellationToken) -> ToolResult:
        try:
            import uiautomation as auto
            root = auto.GetRootControl()
            text_lines = []
            def walk(control, depth=0):
                if depth > 5 or len(text_lines) > 100:
                    return
                token.raise_if_cancelled()
                if control.Name:
                    text_lines.append(f"{'  '*depth}- {control.ControlTypeName}: {control.Name}")
                for child in control.GetChildren():
                    walk(child, depth + 1)
            walk(root)
            return ToolResult(True, "Read screen UI tree.", {"ui_text": "\\n".join(text_lines)})
        except Exception as e:
            return ToolResult(False, str(e))
'''
    content = content.replace('    def _open_app(', methods_code + '\n    def _open_app(')
    
    with open('C:\\MeeraAI\\meera_runtime\\supervisor.py', 'w', encoding='utf-8') as f:
        f.write(content)

inject_tools()
