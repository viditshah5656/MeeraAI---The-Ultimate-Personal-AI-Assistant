import re

file_path = r"c:\Coding\MeeraAI---The-Ultimate-Personal-AI-Assistant\desktop_frontend\src\App.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# Add the missing )} back
code = code.replace(
    '</section>\n                        <section className="settings-section settings-context">',
    '</section>\n                        )}\n                        {resolvedSettingsSection === "context" && (\n                        <section className="settings-section settings-context">'
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("Fixed syntax error.")
