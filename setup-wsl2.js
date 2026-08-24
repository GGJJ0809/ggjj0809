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
log('  Canteen Smart System - WSL2 Environment Setup');
log('==============================================');
log('');

// Check admin
log('> Checking administrator privilege...');
let isAdmin = false;
try {
  const groups = runSilent('whoami /groups');
  isAdmin = groups.includes('S-1-16-12288');
} catch (e) {
  isAdmin = false;
}

if (!isAdmin) {
  log('[!] Administrator privilege required');
  log('    Please run this script as administrator:');
  log('    Right-click PowerShell -> Run as administrator');
  log('    Then run: node setup-wsl2.js');
  process.exit(1);
}
log('  [OK] Administrator confirmed');

// Check WSL2
log('');
log('> Checking WSL2 status...');
let wslInstalled = false;
try {
  runSilent('wsl --status');
  wslInstalled = true;
} catch (e) {
  wslInstalled = false;
}

if (!wslInstalled) {
  log('  WSL2 not installed, installing automatically...');
  log('  (This may take a few minutes)');
  log('');

  try {
    runSilent('dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart');
    runSilent('dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart');
    runSilent('wsl --set-default-version 2');
  } catch (e) {
    log('[X] WSL2 installation failed');
    log('    Please manually enable WSL2 in Windows Features');
    process.exit(1);
  }

  log('  [OK] WSL2 core components installed');
  log('');
  log('==============================================');
  log('  [!] System restart required to complete WSL2');
  log('==============================================');
  log('');
  log('  Steps after restart:');
  log('  1. Restart computer');
  log('  2. Run this script again: node setup-wsl2.js');
  log('');
  process.exit(0);
}
log('  [OK] WSL2 installed');

// Check Ubuntu
log('');
log('> Checking Ubuntu distribution...');
let hasUbuntu = false;
try {
  const distros = runSilent('wsl --list --quiet');
  if (distros.includes('Ubuntu')) hasUbuntu = true;
} catch (e) {}

if (!hasUbuntu) {
  log('  Ubuntu not installed, installing automatically...');
  log('  (This may take a few minutes)');
  log('');

  try {
    runSilent('wsl --install -d Ubuntu --no-launch');
  } catch (e) {
    log('[X] Ubuntu installation failed');
    process.exit(1);
  }

  log('  [OK] Ubuntu installed');
  log('');
  log('==============================================');
  log('  [!] System restart required to complete Ubuntu');
  log('==============================================');
  log('');
  log('  Steps after restart:');
  log('  1. Restart computer');
  log('  2. Search and start Ubuntu from Start Menu');
  log('  3. Set username and password when prompted');
  log('  4. After setup, run this script again: node setup-wsl2.js');
  log('');
  process.exit(0);
}
log('  [OK] Ubuntu installed');

// Check Ubuntu running status
log('');
log('> Checking Ubuntu running status...');
let ubuntuReady = false;
try {
  const test = runSilent('wsl -d Ubuntu -e bash -c "echo ready"');
  if (test.trim() === 'ready') ubuntuReady = true;
} catch (e) {}

if (!ubuntuReady) {
  log('');
  log('[!] Ubuntu first-time setup not complete');
  log('');
  log('  Please search and start Ubuntu from Start Menu,');
  log('  set username and password, then run this script again.');
  log('');
  process.exit(1);
}
log('  [OK] Ubuntu running normally');

// Install dependencies in Ubuntu
log('');
log('> Installing build dependencies in Ubuntu...');
log('  Installing: nodejs, npm, fakeroot, dpkg, python3, g++, make');
log('  First install may take 3~5 minutes, please wait...');
log('');

let depsOk = false;
try {
  const result = runSilent('wsl -d Ubuntu -u root bash -c "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq nodejs npm fakeroot dpkg python3 g++ make && echo DEPENDENCIES_OK"');
  if (result.includes('DEPENDENCIES_OK')) depsOk = true;
} catch (e) {}

if (depsOk) {
  log('  [OK] Dependencies installed');
} else {
  log('  [!] Dependencies may have issues');
  log('      If build-wsl2.js fails later, manually run in Ubuntu terminal:');
  log('      sudo apt update && sudo apt install -y nodejs npm fakeroot dpkg python3 g++ make');
}

// Verify Node.js
log('');
log('> Verifying Node.js...');
try {
  const nodeVer = runSilent('wsl -d Ubuntu bash -c "node -v"').trim();
  log(`  [OK] Ubuntu Node.js version: ${nodeVer}`);
} catch (e) {
  log('  [!] Could not verify Node.js version');
}

// Done
log('');
log('==============================================');
log('  [OK] WSL2 build environment ready!');
log('==============================================');
log('');
log('  You can now run build-wsl2.js to start packaging:');
log('');
log('    1. Open terminal in project root directory');
log('    2. Run: node build-wsl2.js');
log('    3. Wait 5~15 minutes, artifacts auto-copy to Desktop');
log('');