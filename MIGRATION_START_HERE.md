# MeeraAI — actual startup rewrite

This package is tailored to the current `desktop_frontend` layout.

Expected project layout:

```text
C:\Coding\MeeraAI---The-Ultimate-Personal-AI-Assistant\
├── backend\
│   ├── app.py
│   └── ...
├── desktop_frontend\
│   ├── package.json
│   ├── electron\
│   │   └── main.ts
│   └── ...
├── models\
└── Meera.py              # old backend; NOT launched by this rewrite
```

## What changed

- Electron `main.ts` no longer searches for or launches `Meera.py`.
- Electron launches the Python package with:
  `python -m backend.app --host 127.0.0.1 --port 8000`
- Backend health is checked at:
  `http://127.0.0.1:8000/api/v1/health`
- The backend working directory is the project root so `backend.*` relative imports work.
- `package.json` standalone backend script points to `backend.app`.
- Windows/macOS packaging includes the `backend/` directory instead of `Meera.py`.

Keep the old `Meera.py` as a rollback/reference until the new backend is fully feature-complete.
