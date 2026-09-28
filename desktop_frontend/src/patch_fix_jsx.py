import re

file_path = r"c:\Coding\MeeraAI---The-Ultimate-Personal-AI-Assistant\desktop_frontend\src\App.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# Remove the broken `const profileSetupPanel = ...` from inside JSX
broken_code_pattern = re.compile(r'const profileSetupPanel = \(\(\) => \{.*?\}\)\(\);\s*', re.DOTALL)
code = broken_code_pattern.sub('', code)

# Clean up any broken rendering calls we left
code = code.replace('{!showWelcome && !bootBlocking && profileSetupPanel}', '')

# Define the variable cleanly
profile_panel_def = """
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
                  window.location.reload();
                }}>Start Exploring</button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  })();
"""

# Insert definition before `const browserAgentPanel = null;`
code = code.replace('  const browserAgentPanel = null;', profile_panel_def + '\n  const browserAgentPanel = null;')

# Insert rendering call before `{!showWelcome && !bootBlocking && browserAgentPanel}`
render_target = '{!showWelcome && !bootBlocking && browserAgentPanel}'
code = code.replace(render_target, '{!showWelcome && !bootBlocking && profileSetupPanel}\n      ' + render_target)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("Fixed JSX error.")
