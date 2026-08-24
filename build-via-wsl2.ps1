# Canteen Smart System - Linux Package Builder via WSL2
# Usage: Run after setup-wsl2.ps1 completes environment setup
# Description: Auto-copy project to WSL2 Ubuntu, build, copy results back to Windows Desktop

Write-Host ""
Write-Host "=============================================="
Write-Host "  Canteen Smart System - WSL2 Linux Packager"
Write-Host "=============================================="
Write-Host ""

$projectPath = (Get-Location).Path
$projectName = Split-Path $projectPath -Leaf

Write-Host "> Project path: $projectPath"
Write-Host "> Project name: $projectName"
Write-Host ""

Write-Host "> Checking WSL2 + Ubuntu..."

$hasUbuntu = $false
try {
    $distros = wsl --list --quiet 2>$null
    foreach ($d in $distros) {
        if ($d -match "Ubuntu") { $hasUbuntu = $true; break }
    }
} catch {}

if (-not $hasUbuntu) {
    Write-Host ""
    Write-Host "[X] WSL2 Ubuntu not installed"
    Write-Host ""
    Write-Host "  Please run setup-wsl2.ps1 first to install WSL2 and Ubuntu."
    Write-Host ""
    Write-Host "  Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

$ubuntuReady = $false
try {
    $testOutput = wsl -d Ubuntu -e bash -c "echo ready" 2>$null
    if ($LASTEXITCODE -eq 0 -and $testOutput -eq "ready") {
        $ubuntuReady = $true
    }
} catch {}

if (-not $ubuntuReady) {
    Write-Host ""
    Write-Host "[X] Ubuntu not started or first-time setup not done"
    Write-Host ""
    Write-Host "  Please search and start 'Ubuntu' from Start Menu,"
    Write-Host "  set username and password as prompted, then run this script again."
    Write-Host ""
    Write-Host "  Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "  [OK] WSL2 + Ubuntu ready"

Write-Host ""
Write-Host "> Cleaning old project copy in WSL2..."
wsl -d Ubuntu bash -c "rm -rf /home/wslbuild/$projectName" 2>$null
Write-Host "  [OK] Cleaned"

Write-Host ""
Write-Host "> Copying project to WSL2 Ubuntu..."
Write-Host "  (Excluding node_modules, dist-electron, out; reinstall inside WSL2)"
Write-Host "  Copying, please wait..."

$wslSrcPath = wsl -d Ubuntu wslpath -u "`"$projectPath`""

wsl -d Ubuntu bash -c "
    mkdir -p /home/wslbuild
    cp -r $wslSrcPath /home/wslbuild/$projectName
    cd /home/wslbuild/$projectName
    rm -rf node_modules dist-electron out .git
    echo 'COPY_DONE'
" 2>$null

Write-Host "  [OK] Project copied"

Write-Host ""
Write-Host "> Starting build inside WSL2 Ubuntu..."
Write-Host "  First run will install npm deps and compile better-sqlite3 native module"
Write-Host "  This may take 5~15 minutes, please be patient"
Write-Host ""
Write-Host "  -----------------------------------------------"

wsl -d Ubuntu bash -c "
    cd /home/wslbuild/$projectName
    chmod +x build-kylin.sh
    ./build-kylin.sh
"

$buildExitCode = $LASTEXITCODE

Write-Host "  -----------------------------------------------"
Write-Host ""

if ($buildExitCode -ne 0) {
    Write-Host "[X] Build failed (exit code: $buildExitCode)"
    Write-Host ""
    Write-Host "  Common causes:"
    Write-Host "  1. Network issue caused npm install to fail"
    Write-Host "  2. Missing build tools (rerun setup-wsl2.ps1)"
    Write-Host "  3. TypeScript errors in project files"
    Write-Host ""
    Write-Host "  Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "  [OK] WSL2 build completed"

Write-Host ""
Write-Host "> Copying build artifacts to Windows Desktop..."

$timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$outputDirName = "Canteen-Smart-System-Linux-$timestamp"
$desktopPath = [Environment]::GetFolderPath("Desktop")
$targetPath = Join-Path $desktopPath $outputDirName

New-Item -ItemType Directory -Force -Path $targetPath | Out-Null

$desktopWslPath = wsl -d Ubuntu wslpath -u "`"$targetPath`""

wsl -d Ubuntu bash -c "
    mkdir -p $desktopWslPath
    cp -r /home/wslbuild/$projectName/dist-electron/* $desktopWslPath/
    echo 'COPY_BACK_DONE'
" 2>$null

$files = Get-ChildItem -Path $targetPath -ErrorAction SilentlyContinue
if ($files.Count -gt 0) {
    Write-Host "  [OK] Artifacts copied"
    Write-Host ""
    Write-Host "=============================================="
    Write-Host "  Build success! Artifacts on Desktop:"
    Write-Host "=============================================="
    Write-Host ""
    Write-Host "  Folder: $outputDirName"
    Write-Host "  Full path: $targetPath"
    Write-Host ""
    
    foreach ($file in $files) {
        $sizeMB = [math]::Round($file.Length / 1MB, 1)
        Write-Host "    + $($file.Name)  (${sizeMB} MB)"
    }
    
    Write-Host ""
    Write-Host "> Usage instructions for client:"
    Write-Host ""
    Write-Host "  1. Client runs: uname -m"
    Write-Host "     - x86_64 -> use *x86_64.AppImage or *amd64.deb"
    Write-Host "     - aarch64 -> use *arm64.AppImage or *arm64.deb"
    Write-Host ""
    Write-Host "  2. AppImage (no install):"
    Write-Host "     chmod +x xxx.AppImage"
    Write-Host "     Double-click to run"
    Write-Host ""
    Write-Host "  3. deb package:"
    Write-Host "     sudo dpkg -i xxx.deb"
    Write-Host "     sudo apt-get install -f"
    Write-Host ""
} else {
    Write-Host "  [!] Artifact copy may have failed"
    Write-Host ""
    Write-Host "  Please manually copy from WSL2 path:"
    Write-Host "    \\wsl`$\Ubuntu\home\wslbuild\$projectName\dist-electron"
    Write-Host ""
}

Write-Host "  Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")