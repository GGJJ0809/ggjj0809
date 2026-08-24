const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function log(msg) {
  console.log(msg);
}

function run(cmd, opts = {}) {
  log(`> ${cmd}`);
  return execSync(cmd, { encoding: 'utf8', stdio: 'inherit', ...opts });
}

function runSilent(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts });
}

log('');
log('==============================================');
log('  Canteen Smart System - WSL2 Linux Packager');
log('==============================================');
log('');

const projectPath = process.cwd();
const projectName = path.basename(projectPath);

log(`> Project path: ${projectPath}`);
log(`> Project name: ${projectName}`);
log('');

// Check WSL2 + Ubuntu
log('> Checking WSL2 + Ubuntu...');
let hasUbuntu = false;
try {
  const distros = runSilent('wsl --list --quiet');
  if (distros.includes('Ubuntu')) hasUbuntu = true;
} catch (e) {}

if (!hasUbuntu) {
  log('');
  log('[X] WSL2 Ubuntu not installed');
  log('  Please run setup-wsl2.js first to install WSL2 and Ubuntu.');
  log('');
  process.exit(1);
}

let ubuntuReady = false;
try {
  const test = runSilent('wsl -d Ubuntu -e bash -c "echo ready"');
  if (test.trim() === 'ready') ubuntuReady = true;
} catch (e) {}

if (!ubuntuReady) {
  log('');
  log('[X] Ubuntu not started or first-time setup not done');
  log('  Please search and start Ubuntu from Start Menu,');
  log('  set username and password, then run this script again.');
  log('');
  process.exit(1);
}
log('  [OK] WSL2 + Ubuntu ready');

// Clean old copy
log('');
log('> Cleaning old project copy in WSL2...');
try {
  runSilent(`wsl -d Ubuntu bash -c "rm -rf /home/wslbuild/${projectName}"`);
} catch (e) {}
log('  [OK] Cleaned');

// Copy project to WSL2
log('');
log('> Copying project to WSL2 Ubuntu...');
log('  (Excluding node_modules, dist-electron, out; reinstall inside WSL2)');
log('  Copying, please wait...');

let wslPath = '';
try {
  wslPath = runSilent(`wsl -d Ubuntu wslpath -u "${projectPath}"`).trim();
} catch (e) {
  log('[X] Failed to convert Windows path to WSL path');
  process.exit(1);
}

try {
  runSilent(`wsl -d Ubuntu bash -c "mkdir -p /home/wslbuild && cp -r ${wslPath} /home/wslbuild/${projectName} && cd /home/wslbuild/${projectName} && rm -rf node_modules dist-electron out .git && echo COPY_DONE"`);
} catch (e) {
  log('[X] Failed to copy project to WSL2');
  process.exit(1);
}
log('  [OK] Project copied');

// Build in WSL2
log('');
log('> Starting build inside WSL2 Ubuntu...');
log('  First run will install npm deps and compile better-sqlite3 native module');
log('  This may take 5~15 minutes, please be patient');
log('');
log('  -----------------------------------------------');

let buildExitCode = 0;
try {
  run(`wsl -d Ubuntu bash -c "cd /home/wslbuild/${projectName} && chmod +x build-kylin.sh && ./build-kylin.sh"`);
} catch (e) {
  buildExitCode = e.status || 1;
}

log('  -----------------------------------------------');
log('');

if (buildExitCode !== 0) {
  log('[X] Build failed');
  log('');
  log('  Common causes:');
  log('  1. Network issue caused npm install to fail');
  log('  2. Missing build tools (rerun setup-wsl2.js)');
  log('  3. TypeScript errors in project files');
  log('');
  process.exit(1);
}

log('  [OK] WSL2 build completed');

// Copy artifacts back to Desktop
log('');
log('> Copying build artifacts to Windows Desktop...');

const now = new Date();
const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
const outputDirName = `Canteen-Linux-${timestamp}`;
const desktopPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', 'Desktop');
const targetPath = path.join(desktopPath, outputDirName);

fs.mkdirSync(targetPath, { recursive: true });

let wslDesktop = '';
try {
  wslDesktop = runSilent(`wsl -d Ubuntu wslpath -u "${desktopPath}"`).trim();
} catch (e) {
  log('[X] Failed to convert Desktop path to WSL path');
  process.exit(1);
}

try {
  runSilent(`wsl -d Ubuntu bash -c "mkdir -p ${wslDesktop}/${outputDirName} && cp -r /home/wslbuild/${projectName}/dist-electron/* ${wslDesktop}/${outputDirName}/ && echo COPY_BACK_DONE"`);
} catch (e) {
  log('[X] Failed to copy artifacts back to Desktop');
  process.exit(1);
}

// Show results
const files = fs.readdirSync(targetPath);
if (files.length > 0) {
  log('  [OK] Artifacts copied');
  log('');
  log('==============================================');
  log('  Build success! Artifacts on Desktop:');
  log('==============================================');
  log('');
  log(`  Folder: ${outputDirName}`);
  log(`  Full path: ${targetPath}`);
  log('');

  files.forEach(f => {
    try {
      const stats = fs.statSync(path.join(targetPath, f));
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
      log(`    + ${f}  (${sizeMB} MB)`);
    } catch (e) {
      log(`    + ${f}`);
    }
  });

  log('');
  log('> Usage instructions for client:');
  log('');
  log('  1. Client runs: uname -m');
  log('     - x86_64 -> use *x86_64.AppImage or *amd64.deb');
  log('     - aarch64 -> use *arm64.AppImage or *arm64.deb');
  log('');
  log('  2. AppImage (no install):');
  log('     chmod +x xxx.AppImage');
  log('     Double-click to run');
  log('');
  log('  3. deb package:');
  log('     sudo dpkg -i xxx.deb');
  log('     sudo apt-get install -f');
  log('');
} else {
  log('  [!] Artifact copy may have failed');
  log('');
  log('  Please manually copy from WSL2 path:');
  log(`    \\\\wsl$\\Ubuntu\\home\\wslbuild\\${projectName}\\dist-electron`);
  log('');
}