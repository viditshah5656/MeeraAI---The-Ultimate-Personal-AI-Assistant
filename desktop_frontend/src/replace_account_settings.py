import re

file_path = r"c:\Coding\MeeraAI---The-Ultimate-Personal-AI-Assistant\desktop_frontend\src\App.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# I will replace the whole <section className="settings-section settings-account">
# with a new local profile editor

new_account_section = """
                          <section className="settings-section settings-account">
                            <div className="settings-section-head">
                              <h3>{renderSettingsQueryHighlights("Local Profile")}</h3>
                              <span>{renderSettingsQueryHighlights("Your personalized AI context")}</span>
                            </div>
                            <div className="settings-account-body">
                                <div className="settings-info-card">
                                  <strong>{renderSettingsQueryHighlights(localStorage.getItem("meera_local_name") || "Meera User")}</strong>
                                  <span>{renderSettingsQueryHighlights("Your data is stored locally and used to personalize responses.")}</span>
                                </div>
                                
                                <div className="settings-form-grid">
                                  <label>
                                    Full Name
                                    <input
                                      value={localNameInput}
                                      onChange={(event) => setLocalNameInput(event.target.value)}
                                      placeholder="Your full name"
                                    />
                                  </label>
                                  <label>
                                    Preferred Name
                                    <input
                                      value={localPreferredNameInput}
                                      onChange={(event) => setLocalPreferredNameInput(event.target.value)}
                                      placeholder="What should I call you?"
                                    />
                                  </label>
                                  <label>
                                    Occupation / Role
                                    <input
                                      value={localRoleInput}
                                      onChange={(event) => setLocalRoleInput(event.target.value)}
                                      placeholder="e.g. Senior Software Engineer"
                                    />
                                  </label>
                                </div>
                                
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px', fontSize: '12px', fontWeight: 600 }}>
                                    Custom Instructions & Bio
                                    <textarea
                                      value={localBioInput}
                                      onChange={(event) => setLocalBioInput(event.target.value)}
                                      placeholder="Tell the AI how you want it to respond, what your interests are, or paste your background."
                                      style={{ minHeight: '120px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', resize: 'vertical' }}
                                    />
                                </label>
                                
                                <div className="settings-action-inline" style={{ marginTop: '24px' }}>
                                  <button
                                    className="settings-primary-btn"
                                    type="button"
                                    onClick={() => {
                                      localStorage.setItem("meera_local_name", localNameInput);
                                      localStorage.setItem("meera_local_preferred_name", localPreferredNameInput);
                                      localStorage.setItem("meera_local_role", localRoleInput);
                                      localStorage.setItem("meera_local_bio", localBioInput);
                                      window.location.reload();
                                    }}
                                  >
                                    Save and Reload
                                  </button>
                                </div>
                            </div>
                          </section>
"""

code = re.sub(
    r'<section className="settings-section settings-account">.*?(?=<section className="settings-section settings-context">)',
    new_account_section.strip() + '\n                        ',
    code,
    flags=re.DOTALL
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("Replaced settings-account section.")
