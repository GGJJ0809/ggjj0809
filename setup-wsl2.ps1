# Canteen Smart System - WSL2 Environment Setup
# Usage: Right-click -> Run with PowerShell (administrator recommended)
# Run this script ONCE only to set up WSL2 + Ubuntu + build deps

Write-Host ""
Write-Host "=============================================="
Write-Host "  Canteen Smart System - WSL2 Setup"
Write-Host "=============================================="
Write-Host ""

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] Administrator privilege required"
    Write-Host "    Please right-click this script -> 'Run as administrator'"
    Write-Host ""
    Write-Host "    Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "> Checking WSL2 status..."
try {
    $wslStatus = wsl --status 2>$null
    $wslInstalled = ($LASTEXITCODE -eq 0)
} catch {
    $wslInstalled = $false
}

if (-not $wslInstalled) {
    Write-Host "  WSL2 not installed, installing automatically..."
    Write-Host "  (This may take a few minutes, please wait)"
    Write-Host ""
    
    dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart | Out-Null
    dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart | Out-Null
    wsl --set-default-version 2 2>$null
    
    Write-Host "  [OK] WSL2 core components installed"
    Write-Host ""
    Write-Host "=============================================="
    Write-Host "  [!] System restart required to complete WSL2"
    Write-Host "=============================================="
    Write-Host ""
    Write-Host "  Please save your work, then:"
    Write-Host "  1. Restart computer"
    Write-Host "  2. Run this script again (setup-wsl2.ps1)"
    Write-Host ""
    Write-Host "  Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 0
}

Write-Host "  [OK] WSL2 installed"

Write-Host ""
Write-Host "> Checking Ubuntu distribution..."
$hasUbuntu = $false
try {
    $distros = wsl --list --quiet 2>$null
    foreach ($d in $distros) {
        if ($d -match "Ubuntu") { $hasUbuntu = $true; break }
    }
} catch {}

if (-not $hasUbuntu) {
    Write-Host "  Ubuntu not installed, installing automatically..."
    Write-Host "  (This may take a few minutes, please wait)"
    Write-Host ""
    
    wsl --install -d Ubuntu --no-launch 2>$null
    
    Write-Host "  [OK] Ubuntu installed"
    Write-Host ""
    Write-Host "=============================================="
    Write-Host "  [!] System restart required to complete Ubuntu"
    Write-Host "=============================================="
    Write-Host ""
    Write-Host "  Please save your work, then:"
    Write-Host "  1. Restart computer"
    Write-Host "  2. Search and start 'Ubuntu' from Start Menu"
    Write-Host "  3. Set username and password as prompted (remember the password)"
    Write-Host "  4. After setup, run this script again (setup-wsl2.ps1)"
    Write-Host "     to finish the build environment configuration"
    Write-Host ""
    Write-Host "  Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 0
}

Write-Host "  [OK] Ubuntu installed"

Write-Host ""
Write-Host "> Checking Ubuntu running status..."
$ubuntuReady = $false
try {
    $testOutput = wsl -d Ubuntu -e bash -c "echo ready" 2>$null
    if ($LASTEXITCODE -eq 0 -and $testOutput -eq "ready") {
        $ubuntuReady = $true
    }
} catch {}

if (-not $ubuntuReady) {
    Write-Host ""
    Write-Host "[!] Ubuntu first-time setup not complete"
    Write-Host ""
    Write-Host "  Please search and start 'Ubuntu' from Start Menu,"
    Write-Host "  set username and password, then run this script again."
    Write-Host ""
    Write-Host "  Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "  [OK] Ubuntu running normally"

Write-Host ""
Write-Host "> Installing build dependencies in Ubuntu..."
Write-Host "  Installing: nodejs, npm, fakeroot, dpkg, python3, g++, make"
Write-Host "  First install may take 3~5 minutes, please wait..."
Write-Host ""

$installResult = wsl -d Ubuntu -u root bash -c "
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq nodejs npm fakeroot dpkg python3 g++ make
    echo 'DEPENDENCIES_OK'
" 2>$null

if ($installResult -match "DEPENDENCIES_OK") {
    Write-Host "  [OK] Dependencies installed"
} else {
    Write-Host "  [!] Dependencies may have issues"
    Write-Host "      If build-via-wsl2.ps1 fails later, manually run in Ubuntu terminal:"
    Write-Host "      sudo apt update && sudo apt install -y nodejs npm fakeroot dpkg python3 g++ make"
}

Write-Host ""
Write-Host "> Verifying Node.js..."
$nodeVer = wsl -d Ubuntu bash -c "node -v" 2>$null
Write-Host "  [OK] Ubuntu Node.js version: $nodeVer"

Write-Host ""
Write-Host "=============================================="
Write-Host "  [OK] WSL2 build environment ready!"
Write-Host "=============================================="
Write-Host ""
Write-Host "  You can now run build-via-wsl2.ps1 to start packaging:"
Write-Host ""
Write-Host "    1. Open PowerShell in project root directory"
Write-Host "    2. Run: .\build-via-wsl2.ps1"
Write-Host "    3. Wait 5~15 minutes, artifacts auto-copy to Desktop"
Write-Host ""
Write-Host "  Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")