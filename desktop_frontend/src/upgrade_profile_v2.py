import re

file_path = r"c:\Coding\MeeraAI---The-Ultimate-Personal-AI-Assistant\desktop_frontend\src\App.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# Add new states
if 'const [localPreferredNameInput' not in code:
    code = code.replace(
        'const [localRoleInput, setLocalRoleInput] = useState(() => localStorage.getItem("meera_local_role") || "");',
        'const [localRoleInput, setLocalRoleInput] = useState(() => localStorage.getItem("meera_local_role") || "");\n  const [localPreferredNameInput, setLocalPreferredNameInput] = useState(() => localStorage.getItem("meera_local_preferred_name") || "");'
    )

new_profile_panel = """
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        let fullText = "";
        for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
           const page = await pdf.getPage(i);
           const content = await page.getTextContent();
           fullText += content.items.map((item: any) => item.str).join(" ") + "\\n";
        }
        setLocalBioInput(prev => (prev ? prev + "\\n\\n" : "") + "Resume Context:\\n" + fullText.slice(0, 1500));
      } else {
        const text = await file.text();
        setLocalBioInput(prev => (prev ? prev + "\\n\\n" : "") + "Resume Context:\\n" + text.slice(0, 1500));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const profileSetupPanel = (() => {
    if (localProfileSet) return null;
    return (
      <AnimatePresence>
        <motion.div className="auth-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
        <motion.div className="auth-panel" initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.25 }} role="dialog" style={{ maxWidth: '500px' }}>
          <div className="auth-card">
            <div className="auth-titlebar">
              <div className="auth-titlebar-brand">
                <BrandLogo className="auth-titlebar-logo" alt="MeeraAI logo" />
                <div className="auth-titlebar-text">
                  <strong>Welcome to MeeraAI</strong>
                  <span>Let's personalize your AI experience.</span>
                </div>
              </div>
            </div>
            <div className="auth-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              <div className="auth-form">
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                   <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Profile Details</span>
                   <label className="auth-terms-link" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                      <UiIcon name="upload.svg" />
                      Import from Resume
                      <input type="file" accept=".txt,.md,.pdf" style={{ display: 'none' }} onChange={handleResumeUpload} />
                   </label>
                </div>

                <div className="auth-fields">
                  <label>Full Name
                    <input value={localNameInput} onChange={e => setLocalNameInput(e.target.value)} placeholder="e.g. Meera User" />
                  </label>
                  <label>What should I call you?
                    <input value={localPreferredNameInput} onChange={e => setLocalPreferredNameInput(e.target.value)} placeholder="e.g. Boss, Master, or your first name" />
                  </label>
                  <label>Occupation / Role
                    <input value={localRoleInput} onChange={e => setLocalRoleInput(e.target.value)} placeholder="e.g. Senior Software Engineer" />
                  </label>
                  <label>Custom Instructions & Bio
                    <textarea value={localBioInput} onChange={e => setLocalBioInput(e.target.value)} placeholder="Tell the AI how you want it to respond, what your interests are, or paste your background." style={{ minHeight: '90px', resize: 'vertical' }} />
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
                    localStorage.setItem("meera_local_preferred_name", localPreferredNameInput);
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

# Update buildUserContextPayload for preferred name
code = code.replace(
    'const localName = localStorage.getItem("meera_local_name");',
    'const localName = localStorage.getItem("meera_local_name");\n    const localPref = localStorage.getItem("meera_local_preferred_name");\n    if (localPref) profile.preferred_name = localPref;'
)

# And in the profile_notes patch, let's include the preferred name in the bio fallback if it's there
# Actually we already patched profile_notes to include the role. Let's patch it again to include preferred_name
code = code.replace(
    '((localStorage.getItem("meera_local_role") ? "Role: " + localStorage.getItem("meera_local_role") + "\\n" : "") + (localStorage.getItem("meera_local_bio") || "")) || ""',
    '((localStorage.getItem("meera_local_preferred_name") ? "Call me: " + localStorage.getItem("meera_local_preferred_name") + "\\n" : "") + (localStorage.getItem("meera_local_role") ? "Role: " + localStorage.getItem("meera_local_role") + "\\n" : "") + (localStorage.getItem("meera_local_bio") || "")) || ""'
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("Upgraded profile panel v2 successfully.")
