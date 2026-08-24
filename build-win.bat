@echo off
setlocal EnableDelayedExpansion

rem ============================================================
rem  Smart Canteen - Windows Build Script
rem  Output: Installer EXE + Portable single-file EXE
rem  ============================================================

rem ---- STEP 0: Fix UNC path (WSL \\wsl$\... paths break cmd.exe) ----
rem pushd maps UNC to a temp drive letter; if it fails, warn and stop
pushd "%~dp0" 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] Cannot switch to script directory.
    echo         You appear to be running from a WSL/UNC path.
    echo         Please copy the project to a Windows local drive first,
    echo         e.g. C:\projects\canteen-native\build-win.bat
    echo.
    pause
    exit /b 1
)

rem ---- Verify we are actually in the project root ----
if not exist "package.json" (
    echo.
    echo [ERROR] package.json not found in current directory: %CD%
    echo         Make sure build-win.bat is inside the project root folder.
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   Smart Canteen - Windows Build
echo   Output: Installer EXE + Portable single-file EXE
echo ============================================================
echo.

rem ---- China mirrors for faster Electron download ----
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"

rem ---------- Check Node.js and npm ----------
echo [STEP 1/6] Checking Node.js ...
call node -v
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install Node.js 18+ first.
    echo         https://nodejs.org/
    goto :fail
)

echo.
echo [STEP 1/6] Checking npm ...
call npm -v
if errorlevel 1 (
    echo [ERROR] npm not found. Reinstall Node.js to restore npm.
    goto :fail
)

echo   [OK] Environment ready.

rem ---------- Version management (standalone Node script, no inline JS) ----------
echo.
echo [STEP 2/6] Managing build version ...

if not exist "bump-version.cjs" (
    echo [ERROR] bump-version.cjs not found in project root.
    goto :fail
)

for /f "delims=" %%a in ('node bump-version.cjs') do set "VER_RESULT=%%a"

rem Split result into version and time
for /f "tokens=1,2 delims=|" %%a in ("%VER_RESULT%") do (
    set "NEW_VER=%%a"
    set "BUILD_TIME=%%b"
)

echo   Current version: %NEW_VER%
echo   Build time:      %BUILD_TIME%
echo   [OK] Build info written.

rem ---------- Install dependencies ----------
echo.
echo [STEP 3/6] Installing dependencies (npm install) ...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed.
    goto :fail
)
echo   [OK] Dependencies installed.

echo.
echo [STEP 3/6] Checking Electron build tools ...
set "NEED_ELECTRON=false"
if not exist "node_modules\electron" set "NEED_ELECTRON=true"
if not exist "node_modules\electron-builder" set "NEED_ELECTRON=true"

if "!NEED_ELECTRON!"=="true" (
    echo   Installing electron and electron-builder ...
    call npm install --save-dev electron electron-builder
    if errorlevel 1 (
        echo [ERROR] Failed to install electron / electron-builder.
        goto :fail
    )
    echo   [OK] Electron tools installed.
) else (
    echo   [OK] Electron tools ready.
)

rem ---------- Clean old output ----------
echo.
echo [STEP 4/6] Cleaning old build output ...
if exist "dist-electron" (
    rmdir /s /q "dist-electron"
    echo   Removed dist-electron\
)
if exist "out" (
    rmdir /s /q "out"
    echo   Removed out\
)
if exist "node_modules\.vite" (
    rmdir /s /q "node_modules\.vite"
    echo   Removed Vite cache
)
echo   [OK] Cleaned.

rem ---------- Vite build ----------
echo.
echo [STEP 5/6] Building frontend with Vite ...
set "ELECTRON=true"
call npx vite build --outDir out
if errorlevel 1 (
    echo [ERROR] Vite build failed.
    goto :fail
)
if not exist "out\index.html" (
    echo [ERROR] Build output incomplete: out\index.html missing.
    goto :fail
)
echo   [OK] Frontend build complete.

rem ---------- Electron pack ----------
echo.
echo [STEP 6/6] Packing Windows EXE (installer + portable) ...
echo   This takes 2-5 minutes, please wait ...

call npx electron-builder --win --config electron-builder.yml
set "BUILD_RESULT=%errorlevel%"

if "%BUILD_RESULT%"=="0" goto :pack_ok

echo.
echo [ERROR] Electron packing failed - code %BUILD_RESULT%.
echo   Common causes: missing build tools, low disk space,
echo   or network issues downloading Electron binaries.
goto :fail

:pack_ok
echo   [OK] Packing complete.

rem ---------- Result ----------
echo.
echo ============================================================
echo   BUILD SUCCESS
echo ============================================================
echo.
echo   Output folder: dist-electron\
echo.
if exist "dist-electron" (
    for %%f in (dist-electron\*) do (
        echo     * %%~nxf
    )
) else (
    echo   [WARN] dist-electron folder not found.
)
echo.
echo   Usage:
echo     * Installer  (name contains "Setup"): double-click to install
echo     * Portable   (name contains "portable"): double-click to run
echo.
echo ============================================================
echo   Done. Press any key to close.
echo ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo ============================================================
echo   BUILD FAILED
echo ============================================================
echo.
echo   Check the red error messages above.
echo.
echo   If the window closed too fast, run this script from
echo   Command Prompt instead of double-clicking:
echo     cd /d "%~dp0"
echo     build-win.bat
echo.
echo ============================================================
pause
exit /b 1