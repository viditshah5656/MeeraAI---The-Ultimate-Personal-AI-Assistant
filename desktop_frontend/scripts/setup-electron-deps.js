#!/usr/bin/env node
/**
 * Setup script to verify and install required system dependencies for Electron on Linux
 */

const { execSync } = require('child_process');

const requiredLibs = [
  'libatk1.0-0',
  'libatk-bridge2.0-0',
  'libgbm1',
  'libnss3',
  'libx11-xcb1',
  'libxss1',
  'libxrandr2',
  'libxinerama1',
  'libxcursor1',
  'libxtst6',
  'libxcomposite1',
  'libxdamage1',
  'libxfixes3',
  'libxkbcommon0'
];

console.log('🔍 Checking for required Electron dependencies...\n');

try {
  // Check if running on Linux
  if (process.platform !== 'linux') {
    console.log('ℹ️  Skipping - not running on Linux');
    process.exit(0);
  }

  console.log('📦 Installing required system libraries for Electron...');
  console.log('This may require root/sudo access.\n');

  // Attempt to update and install
  try {
    execSync('apt-get update', { stdio: 'inherit' });
    execSync(`apt-get install -y ${requiredLibs.join(' ')}`, { stdio: 'inherit' });
    console.log('\n✅ Successfully installed all required dependencies!');
    console.log('You can now run: npm run dev\n');
  } catch (error) {
    console.error('\n❌ Installation failed. You may need to run with sudo:');
    console.error(`sudo apt-get update && sudo apt-get install -y ${requiredLibs.join(' ')}\n`);
    process.exit(1);
  }
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
