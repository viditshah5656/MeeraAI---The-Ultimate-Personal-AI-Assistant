import re

file_path = 'Meera.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace:
# cpu_threads = int(settings.get("cpu_thread_pool_size") or os.cpu_count() or 4)
# with:
# cpu_count = os.cpu_count() or 4
# cpu_threads = int(settings.get("cpu_thread_pool_size") or (cpu_count - 1 if cpu_count <= 4 else cpu_count - 2))

old_line = 'cpu_threads = int(settings.get("cpu_thread_pool_size") or os.cpu_count() or 4)'
new_line = '''cpu_count = os.cpu_count() or 4
        # Leave some cores for UI/OS on low-end systems
        default_threads = max(1, cpu_count - 1) if cpu_count <= 4 else max(1, cpu_count - 2)
        cpu_threads = int(settings.get("cpu_thread_pool_size") or default_threads)'''

if old_line in content:
    content = content.replace(old_line, new_line)
    
# Let's also check default context length. 8192 is huge for a 2016 mac running llama.cpp!
# context_length = int(settings.get("context_length") or 8192)
# Change to 4096 default
if 'context_length = int(settings.get("context_length") or 8192)' in content:
    content = content.replace('context_length = int(settings.get("context_length") or 8192)', 'context_length = int(settings.get("context_length") or 4096)')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated Meera.py")
