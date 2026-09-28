import re

file_path = r"c:\Coding\MeeraAI---The-Ultimate-Personal-AI-Assistant\desktop_frontend\src\App.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# Replace authUser state
new_auth_user = """
  const [authUser, setAuthUser] = useState<any | null>(() => ({
    uid: "local-user",
    email: "",
    displayName: localStorage.getItem("meera_local_name") || "Meera User",
    phoneNumber: "",
    photoURL: "",
    emailVerified: true,
  }));
"""
code = re.sub(
    r'  const \[authUser, setAuthUser\] = useState<AuthUserState \| null>\(null\);',
    new_auth_user.strip(),
    code,
    count=1
)

# Nullify onAuthStateChanged effect
code = re.sub(
    r'    const unsubscribe = onAuthStateChanged\(auth, async \(user\) => \{.*?(?=  \}, \[auth, authLoading, authError\]\);)',
    '    const unsubscribe = () => {};\n    setAuthReady(true);\n',
    code,
    flags=re.DOTALL
)

# Remove the reset firebase config button from Settings entirely
code = re.sub(
    r'                            <div className="settings-info-card">\s*<strong>\{renderSettingsQueryHighlights\("Firebase configuration"\)\}</strong>\s*<span>\{renderSettingsQueryHighlights\("Stored locally on this device."\)\}</span>\s*</div>\s*<div className="settings-action-inline">\s*<button[^>]*>\s*Reset Firebase Config\s*</button>\s*</div>\s*<div className="settings-divider" />',
    '',
    code,
    flags=re.DOTALL
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("Patched authUser.")
