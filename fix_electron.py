import re

file_path = 'desktop_frontend/electron/main.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

flags = """
// Performance optimization flags for older hardware
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-hardware-overlays');
app.commandLine.appendSwitch('disable-gpu-driver-bug-workarounds');
app.commandLine.appendSwitch('disable-software-rasterizer');
"""

# Find a good place to insert this, maybe right after app.commandLine.appendSwitch('hide-scrollbars');
if "enable-gpu-rasterization" not in content:
    content = content.replace("app.commandLine.appendSwitch('hide-scrollbars');", "app.commandLine.appendSwitch('hide-scrollbars');\n" + flags)
    
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated main.ts")
