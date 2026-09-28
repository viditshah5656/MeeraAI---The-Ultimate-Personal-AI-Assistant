import re

file_path = r"c:\Coding\MeeraAI---The-Ultimate-Personal-AI-Assistant\desktop_frontend\src\App.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Inject state
state_injection = """
  const [localProfileSet, setLocalProfileSet] = useState(() => !!localStorage.getItem("meera_local_name"));
  const [localNameInput, setLocalNameInput] = useState(() => localStorage.getItem("meera_local_name") || "");
  const [localBioInput, setLocalBioInput] = useState(() => localStorage.getItem("meera_local_bio") || "");
  const [localRoleInput, setLocalRoleInput] = useState(() => localStorage.getItem("meera_local_role") || "");
  const [localPreferredNameInput, setLocalPreferredNameInput] = useState(() => localStorage.getItem("meera_local_preferred_name") || "");
"""
code = code.replace(
    'const [authMode, setAuthMode] = useState<"login" | "signup">("login");',
    'const [authMode, setAuthMode] = useState<"login" | "signup">("login");\n' + state_injection
)

# 2. Inject profileSetupPanel before browserAgentPanel
profile_panel_code = """
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      let fullText = "";
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
           const page = await pdf.getPage(i);
           const content = await page.getTextContent();
           fullText += content.items.map((item: any) => item.str).join(" ") + "\\n";
        }
      } else {
        fullText = await file.text();
      }

      // Smart Parsing Heuristic
      const lines = fullText.split("\\n").map((l: string) => l.trim()).filter(Boolean);
      let nameGuess = "";
      let roleGuess = "";
      
      if (lines.length > 0) {
         let clean = lines[0].replace(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,6}/g, '');
         clean = clean.replace(/\\+?\\d[\\d\\s-]{8,}\\d/g, '');
         
         const splitByDelim = clean.split(/\\||-|–|•/);
         if (splitByDelim.length > 1) {
             nameGuess = splitByDelim[0].trim();
             roleGuess = splitByDelim[1].trim();
         } else {
             const roleKeywords = ["Engineer", "Developer", "Designer", "Manager", "Student", "Director", "Consultant", "Specialist", "Analyst", "Lead", "Architect", "Scientist", "Officer", "Founder", "CEO", "CTO"];
             let foundKeyword = false;
             for (const kw of roleKeywords) {
                 const idx = clean.toLowerCase().indexOf(kw.toLowerCase());
                 if (idx > 0) {
                     const endOfName = clean.substring(0, idx).trim().lastIndexOf(" ");
                     if (endOfName > 0) {
                         nameGuess = clean.substring(0, endOfName).trim();
                         roleGuess = clean.substring(endOfName).trim();
                         foundKeyword = true;
                         break;
                     }
                 }
             }
             if (!foundKeyword) {
                 const words = clean.split(/\\s+/);
                 nameGuess = words.slice(0, 3).join(" ");
             }
         }
         nameGuess = nameGuess.replace(/^(Mr\\.|Mrs\\.|Ms\\.|Dr\\.)\\s+/i, '');
      }
      
      if (nameGuess) {
         setLocalNameInput(nameGuess);
         setLocalPreferredNameInput(nameGuess.split(" ")[0]);
      }
      if (roleGuess) {
         setLocalRoleInput(roleGuess);
      }
      
      setLocalBioInput(prev => (prev ? prev + "\\n\\n" : "") + "Resume Context:\\n" + fullText.slice(0, 1500));
    } catch (err) {
      console.error(err);
    }
  };

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
code = code.replace(
    '  const browserAgentPanel = null;',
    profile_panel_code + '\n  const browserAgentPanel = null;'
)

# 3. Modify rendering tree
code = code.replace(
    '{!showWelcome && !bootBlocking && firebaseSetupPanel}',
    '{!showWelcome && !bootBlocking && profileSetupPanel}'
)
code = code.replace(
    '{!showWelcome && !bootBlocking && firebaseConfigured && authPanel}',
    '{!showWelcome && !bootBlocking && false && authPanel}'
)

# 4. Update buildUserContextPayload
user_context_patch = """
    const profile: Record<string, string | boolean> = {};
    const localName = localStorage.getItem("meera_local_name");
    if (localName) profile.display_name = localName;
    const localPref = localStorage.getItem("meera_local_preferred_name");
    if (localPref) profile.preferred_name = localPref;
    const localRole = localStorage.getItem("meera_local_role");
    if (localRole) profile.role = localRole;
    if (userContextPrefs.includeDisplayName && authUser?.displayName?.trim()) {
"""
code = code.replace('const profile: Record<string, string | boolean> = {};\n    if (userContextPrefs.includeDisplayName && authUser?.displayName?.trim()) {', user_context_patch)

profile_notes_patch = 'profile_notes: userContextPrefs.includeProfileNotes ? (((localStorage.getItem("meera_local_preferred_name") ? "Call me: " + localStorage.getItem("meera_local_preferred_name") + "\\n" : "") + (localStorage.getItem("meera_local_role") ? "Role: " + localStorage.getItem("meera_local_role") + "\\n" : "") + (localStorage.getItem("meera_local_bio") || "")) || userProfileNotes.trim()) : "",'
code = code.replace('profile_notes: userContextPrefs.includeProfileNotes ? userProfileNotes.trim() : "",', profile_notes_patch)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("Applied fresh injection.")
