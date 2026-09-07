const fs = require('fs');
const path = require('path');

// Prefer repository-local public/logo.png inside desktop_frontend
const publicLogo = path.join(__dirname, '..', 'public', 'logo.png');
const buildLogo = path.join(__dirname, '..', 'build', 'logo.png');
// Fallback source (installer assets) if public/logo.png isn't present
const installerLogo = path.join(__dirname, '..', '..', 'installer', 'app', 'assets', 'logo.png');

try {
  // If build logo already exists, nothing to do
  if (fs.existsSync(buildLogo)) {
    console.log(`[sync-logo] build logo already exists at ${buildLogo}. No action needed.`);
    process.exit(0);
  }

  // If public logo exists, copy it into build
  if (fs.existsSync(publicLogo)) {
    fs.mkdirSync(path.dirname(buildLogo), { recursive: true });
    fs.copyFileSync(publicLogo, buildLogo);
    console.log(`[sync-logo] Copied ${publicLogo} -> ${buildLogo}`);
    process.exit(0);
  }

  // Fallback: use installer asset if available, and populate public + build
  if (fs.existsSync(installerLogo)) {
    fs.mkdirSync(path.dirname(publicLogo), { recursive: true });
    fs.copyFileSync(installerLogo, publicLogo);
    console.log(`[sync-logo] Created ${publicLogo} from ${installerLogo}`);

    fs.mkdirSync(path.dirname(buildLogo), { recursive: true });
    fs.copyFileSync(installerLogo, buildLogo);
    console.log(`[sync-logo] Created ${buildLogo} from ${installerLogo}`);
    process.exit(0);
  }

  console.warn(`[sync-logo] No logo found. Checked: ${publicLogo}, ${installerLogo}. Nothing to do.`);
  process.exit(0);
} catch (err) {
  console.error('[sync-logo] Failed to sync logo:', err);
  process.exit(1);
}
