# Electron Linux Dependencies Setup

## Issue
When running `npm run dev` on Linux, you may encounter:
```
libatk-1.0.so.0: cannot open shared object file: No such file or directory
```

This occurs because Electron requires several system libraries that aren't available in minimal Linux environments (including dev containers).

## Solution

### Option 1: Automatic Installation (Recommended)
Run the setup script from the desktop_frontend directory:
```bash
cd source/main-app/desktop_frontend
npm run setup-deps
```

This will automatically install all required system libraries.

### Option 2: Manual Installation
If the automatic script doesn't work, run these commands manually:

```bash
# Update package lists
sudo apt-get update

# Install all required Electron dependencies
sudo apt-get install -y \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libgbm1 \
  libnss3 \
  libx11-xcb1 \
  libxss1 \
  libxrandr2 \
  libxinerama1 \
  libxcursor1 \
  libxtst6 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0
```

### Step 3: Run Development Environment
After installing dependencies, start the dev server:
```bash
cd source/main-app/desktop_frontend
npm run dev
```

## Required Libraries

| Library | Purpose |
|---------|---------|
| `libatk1.0-0` | GNOME Accessibility Toolkit (the main missing library) |
| `libatk-bridge2.0-0` | Accessibility bridge for GTK |
| `libgbm1` | Generic Buffer Management for graphics |
| `libnss3` | Network Security Services |
| `libx11-xcb1`, `libxss1`, `libxrandr2` | X11 protocol support |
| `libxinerama1`, `libxcursor1`, `libxtst6` | X11 input/display utilities |
| `libxcomposite1`, `libxdamage1`, `libxfixes3` | X11 compositing support |
| `libxkbcommon0` | Keyboard handling |

## Troubleshooting

### Verify Installation
To confirm the libraries are installed correctly:
```bash
ldd /workspaces/MeeraAI-Installer/source/main-app/desktop_frontend/node_modules/electron/dist/electron | grep libatk
```

You should see output like:
```
libatk-1.0.so.0 => /lib/x86_64-linux-gnu/libatk-1.0.so.0
```

### Still Getting Errors?
If you still get library errors, run `ldd` on the electron executable to see all required libraries:
```bash
ldd /workspaces/MeeraAI-Installer/source/main-app/desktop_frontend/node_modules/electron/dist/electron
```

Missing libraries will show as `not found`. Install them with:
```bash
sudo apt-get install -y <library-package-name>
```

### Running Without System Libraries (Alternative)
If you cannot install system libraries, you can run the backend separately:
```bash
# Terminal 1: Start the frontend dev server only
cd source/main-app/desktop_frontend
npx vite --host

# Terminal 2: Start the backend
cd source/main-app
python Meera.py --api --port 8000
```

Then open `http://localhost:5173` in your browser to access the UI.
