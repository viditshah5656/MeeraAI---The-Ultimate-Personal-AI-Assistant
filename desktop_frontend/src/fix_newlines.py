import re

file_path = r"c:\Coding\MeeraAI---The-Ultimate-Personal-AI-Assistant\desktop_frontend\src\App.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# Fix the broken strings with literal newlines
code = code.replace('.join(" ") + "\n";', '.join(" ") + "\\n";')
code = code.replace('? prev + "\n\n" : "")', '? prev + "\\n\\n" : "")')
code = code.replace('Resume Context:\n"', 'Resume Context:\\n"')

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("Fixed newlines.")
