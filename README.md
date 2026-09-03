# MeeraAI - The Ultimate Personal Assistant

MeeraAI is a personal AI assistant built around a Python FastAPI backend and a desktop Electron/React frontend. The current app includes chat, local and remote model plumbing, document workflows, browser/search tooling, MCP integration, installer assets, and desktop packaging work for Windows and macOS.

## Project Layout

- `Meera.py` - main Python backend and API server.
- `desktop_frontend/` - Electron + Vite + React desktop app.
- `desktop_frontend/electron/` - Electron main/preload process code.
- `desktop_frontend/scripts/` - packaging and backend install helpers, including macOS build scripts.
- `MCP/` - MCP server packages used by the assistant.
- `config/` - checked-in configuration templates and manifests.
- `Icons/` and `Backgrounds/` - app visual assets.

Runtime state, uploaded files, local databases, downloaded models, build outputs, virtual environments, `node_modules`, and secrets are intentionally ignored by Git.

## macOS Development

Install these first on the Mac:

- macOS with Xcode Command Line Tools: `xcode-select --install`
- Node.js 20 or newer
- Python 3.10 or newer
- Git

Clone the repo and install the desktop dependencies:

```bash
git clone <your-github-repo-url>
cd MeeraAI
cd desktop_frontend
npm install
```

Install backend dependencies for the remote/API backend:

```bash
./scripts/install-backend-mac.sh "$(pwd)" "$HOME/Library/Application Support/MeeraAI/backend"
```

Run the backend and frontend during development:

```bash
# Terminal 1, from the repository root
python3 Meera.py --api --port 8000

# Terminal 2, from desktop_frontend
npm run dev
```

## macOS Packaging

From `desktop_frontend/`:

```bash
npm run package:mac
```

Architecture-specific builds are also available:

```bash
npm run package:mac:intel
npm run package:mac:silicon
npm run package:mac:universal
```

The mac build currently sets Electron Builder signing identity to `null`, so generated builds are unsigned local development artifacts. For public distribution, add an Apple Developer certificate, enable hardened runtime/signing, and notarize the release.

## Windows Development

The current Windows-oriented flow remains available:

```powershell
python Meera.py --api --port 8000

cd desktop_frontend
npm install
npm run dev
```

Windows packaging:

```powershell
cd desktop_frontend
npm run package
```

## GitHub Setup

Initialize and publish from the repository root:

```bash
git init
git add .
git commit -m "Initial MeeraAI project import"
git branch -M main
git remote add origin https://github.com/<your-user-or-org>/MeeraAI.git
git push -u origin main
```

If you use GitHub CLI and are signed in:

```bash
gh repo create MeeraAI --public --source=. --remote=origin --push
```

## Notes

- Keep `.env` local and create a separate `.env.example` before sharing required environment variable names.
- Use `config/huggingface.example.json` and `mcp_servers.example.json` as templates for local credentials and machine-specific paths.
- Keep large model files outside Git. Use download scripts, release assets, or external model storage for `.gguf`, `.safetensors`, `.onnx`, and similar files.
- Do not commit runtime folders such as `data/`, uploaded documents, local conversation databases, or generated screenshots.
