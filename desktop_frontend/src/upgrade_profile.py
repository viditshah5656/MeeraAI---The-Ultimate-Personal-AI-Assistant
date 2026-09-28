import re

file_path = r"c:\Coding\MeeraAI---The-Ultimate-Personal-AI-Assistant\desktop_frontend\src\App.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# Add localRoleInput to the state if it doesn't exist
if 'const [localRoleInput' not in code:
    code = code.replace(
        'const [localBioInput, setLocalBioInput] = useState(() => localStorage.getItem("meera_local_bio") || "");',
        'const [localBioInput, setLocalBioInput] = useState(() => localStorage.getItem("meera_local_bio") || "");\n  const [localRoleInput, setLocalRoleInput] = useState(() => localStorage.getItem("meera_local_role") || "");'
    )

# The new advanced profile panel
new_profile_panel = """
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
                  <span>Let's get to know you for a personalized experience.</span>
                </div>
              </div>
            </div>
            <div className="auth-body">
              <div className="auth-form">
                <div className="auth-fields">
                  <label>Full Name
                    <input value={localNameInput} onChange={e => setLocalNameInput(e.target.value)} placeholder="e.g. Meera User" />
                  </label>
                  <label>Occupation / Role
                    <input value={localRoleInput} onChange={e => setLocalRoleInput(e.target.value)} placeholder="e.g. Developer, Student, Designer" />
                  </label>
                  <label>Custom Instructions & Bio (Optional)
                    <textarea value={localBioInput} onChange={e => setLocalBioInput(e.target.value)} placeholder="Tell the AI how you want it to respond, what your interests are, or any specific rules." style={{ minHeight: '80px', resize: 'vertical' }} />
                  </label>
                  
                  <div className="auth-terms">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'normal', fontSize: '13px' }}>
                      <input type="checkbox" checked={termsAccepted} onChange={handleTermsToggle} style={{ margin: 0, width: 'auto' }} />
                      <span>I agree to the Terms & Conditions</span>
                    </label>
                    <button type="button" className="auth-terms-link" onClick={() => openTerms("signup")} style={{ fontSize: '13px', marginLeft: 'auto' }}>
                      Read terms
                    </button>
                  </div>
                </div>
                
                <button 
                  className="auth-submit" 
                  type="button" 
                  disabled={!termsAccepted || !localNameInput.trim()}
                  onClick={() => {
                    localStorage.setItem("meera_local_name", localNameInput);
                    localStorage.setItem("meera_local_role", localRoleInput);
                    localStorage.setItem("meera_local_bio", localBioInput);
                    setLocalProfileSet(true);
                    window.location.reload();
                  }}>
                  {termsAccepted ? "Start Exploring" : "Accept Terms to Continue"}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  })();
"""

# Replace the old profileSetupPanel
pattern = re.compile(r'  const profileSetupPanel = \(\(\) => \{.*?\}\)\(\);\s*', re.DOTALL)
code = pattern.sub(new_profile_panel + '\n', code)

# Update buildUserContextPayload to include the role in profile_notes
# Let's search for the old patch we did:
# const localBio = localStorage.getItem("meera_local_bio");
code = code.replace(
    'const localBio = localStorage.getItem("meera_local_bio");',
    'const localBio = localStorage.getItem("meera_local_bio");\n    const localRole = localStorage.getItem("meera_local_role");\n    if (localRole) profile.role = localRole;'
)

# And in the profile_notes patch, let's include the role in the bio fallback if it's there
code = code.replace(
    'localStorage.getItem("meera_local_bio") || ""',
    '((localStorage.getItem("meera_local_role") ? "Role: " + localStorage.getItem("meera_local_role") + "\\n" : "") + (localStorage.getItem("meera_local_bio") || "")) || ""'
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("Upgraded profile panel successfully.")
