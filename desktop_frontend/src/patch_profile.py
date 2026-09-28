import re
import os

file_path = r"c:\Coding\MeeraAI---The-Ultimate-Personal-AI-Assistant\desktop_frontend\src\App.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# Replace the variables assignment with our new modal component
profile_panel_code = """
  const profileSetupPanel = (() => {
    if (localProfileSet) return null;
    return (
      <AnimatePresence>
        <motion.div className="auth-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
        <motion.div className="auth-panel" initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.25 }} role="dialog">
          <div className="auth-card">
            <div className="auth-titlebar">
              <div className="auth-titlebar-brand">
                <BrandLogo className="auth-titlebar-logo" alt="MeeraAI logo" />
                <div className="auth-titlebar-text">
                  <strong>Welcome to MeeraAI</strong>
                  <span>Let's get to know you.</span>
                </div>
              </div>
            </div>
            <div className="auth-body">
              <div className="auth-form">
                <div className="auth-fields">
                  <label>Name<input value={localNameInput} onChange={e => setLocalNameInput(e.target.value)} placeholder="Your Name" /></label>
                  <label>Bio (Optional)<input value={localBioInput} onChange={e => setLocalBioInput(e.target.value)} placeholder="A short bio" /></label>
                </div>
                <button className="auth-submit" type="button" onClick={() => {
                  localStorage.setItem("meera_local_name", localNameInput);
                  localStorage.setItem("meera_local_bio", localBioInput);
                  setLocalProfileSet(true);
                  // Refresh window to load new auth user instantly
                  window.location.reload();
                }}>Start Exploring</button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  })();

  const firebaseSetupPanel = profileSetupPanel;
  const authPanel = null;
"""

# Let's replace the firebaseSetupPanel and authPanel variables
# The easiest way is to inject our new state variables near the other useState blocks
state_injection = """
  const [localProfileSet, setLocalProfileSet] = useState(() => !!localStorage.getItem("meera_local_name"));
  const [localNameInput, setLocalNameInput] = useState(() => localStorage.getItem("meera_local_name") || "");
  const [localBioInput, setLocalBioInput] = useState(() => localStorage.getItem("meera_local_bio") || "");
"""

# Inject state variables near authMode
code = re.sub(r'const \[authMode,\s*setAuthMode\] = useState<"login" \| "signup">\("login"\);',
              r'const [authMode, setAuthMode] = useState<"login" | "signup">("login");\n' + state_injection, code)

# We will comment out the old firebaseSetupPanel definition and inject our code.
# The firebaseSetupPanel starts at 'const firebaseSetupPanel = ('
# We can use regex to replace 'const firebaseSetupPanel = (' with our code, and the old one becomes something else.
# But since there's a lot of nested parens, it's easier to just replace the rendering lines!

# Replace rendering lines:
code = code.replace('{!showWelcome && !bootBlocking && firebaseSetupPanel}', profile_panel_code + '{!showWelcome && !bootBlocking && firebaseSetupPanel}')
code = code.replace('{!showWelcome && !bootBlocking && firebaseConfigured && authPanel}', '{!showWelcome && !bootBlocking && firebaseConfigured && authPanel}')

# Wait, if we just redefine `const firebaseSetupPanel = ...` right before rendering, it will shadow the previous definition!
# Let's do that!
render_block_search = '{!showWelcome && !bootBlocking && firebaseSetupPanel}'
if render_block_search in code:
    code = code.replace(render_block_search, profile_panel_code + "\n      " + render_block_search)
    print("Render block patched!")
else:
    print("Render block not found!")

# Now for userContextPayload injection:
# Replace buildUserContextPayload to read from localStorage
user_context_patch = """
    const profile: Record<string, string | boolean> = {};
    const localName = localStorage.getItem("meera_local_name");
    if (localName) profile.display_name = localName;
    const localBio = localStorage.getItem("meera_local_bio");
    if (userContextPrefs.includeDisplayName && authUser?.displayName?.trim()) {
"""
code = code.replace('const profile: Record<string, string | boolean> = {};\n    if (userContextPrefs.includeDisplayName && authUser?.displayName?.trim()) {', user_context_patch)

# Also patch profile_notes in userContextPayload
profile_notes_patch = 'profile_notes: userContextPrefs.includeProfileNotes ? (userProfileNotes.trim() || localStorage.getItem("meera_local_bio") || "") : "",'
code = code.replace('profile_notes: userContextPrefs.includeProfileNotes ? userProfileNotes.trim() : "",', profile_notes_patch)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("Patching complete.")
