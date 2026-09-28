import re
import os

file_path = r"c:\Coding\MeeraAI---The-Ultimate-Personal-AI-Assistant\desktop_frontend\src\App.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# Replace the shadowed variable declaration with something else
code = code.replace('  const firebaseSetupPanel = profileSetupPanel;', '  // shadowed variable removed')
code = code.replace('  const authPanel = null;', '  // shadowed variable removed')

# Find the render block and replace the variables natively
render_old_1 = '{!showWelcome && !bootBlocking && firebaseSetupPanel}'
render_new_1 = '{!showWelcome && !bootBlocking && profileSetupPanel}'
code = code.replace(render_old_1, render_new_1)

render_old_2 = '{!showWelcome && !bootBlocking && firebaseConfigured && authPanel}'
render_new_2 = '{!showWelcome && !bootBlocking && false && authPanel}'
code = code.replace(render_old_2, render_new_2)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("Fix applied.")
