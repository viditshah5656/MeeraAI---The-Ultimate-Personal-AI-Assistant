import re

file_path = r"c:\Coding\MeeraAI---The-Ultimate-Personal-AI-Assistant\desktop_frontend\src\App.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# The block is exactly:
#   const profileSetupPanel = (() => {
# ...
#   })();
# Let's use regex to remove all of them.
pattern = re.compile(r'  const profileSetupPanel = \(\(\) => \{.*?\}\)\(\);\s*(// shadowed variable removed\s*)*', re.DOTALL)
code = pattern.sub('', code)

# Let's also ensure `{!showWelcome && !bootBlocking && firebaseSetupPanel}` is completely removed
code = code.replace('{!showWelcome && !bootBlocking && firebaseSetupPanel}', '')
code = code.replace('{!showWelcome && !bootBlocking && profileSetupPanel}', '')
code = code.replace('{!showWelcome && !bootBlocking && false && authPanel}', '')

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

# Insert it right before browserAgentPanel
render_target = '{!showWelcome && !bootBlocking && browserAgentPanel}'
if render_target in code:
    code = code.replace(render_target, profile_panel_code + "\n      {!showWelcome && !bootBlocking && profileSetupPanel}\n      " + render_target)
else:
    print("Render target not found!")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("Cleaned up profile panels.")
