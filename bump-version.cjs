// bump-version.cjs - bumps patch version, writes build info, prints result
// Called by build-win.bat. Keep this file CommonJS (cjs) because package.json
// has "type": "module", and require() is not available in .js files.
const fs = require('fs');
const path = require('path');

const root = __dirname;
const verFile = path.join(root, '.build-version');
const buildInfoFile = path.join(root, 'src', 'buildInfo.ts');

// 1. Read current version (default 1.0.0)
let ver = '1.0.0';
if (fs.existsSync(verFile)) {
  ver = fs.readFileSync(verFile, 'utf8').trim();
}

// 2. Bump the patch version
const parts = ver.split('.');
parts[2] = String(parseInt(parts[2] || '0', 10) + 1);
const newVer = parts.join('.');
fs.writeFileSync(verFile, newVer, 'utf8');

// 3. ASCII timestamp (YYYY-MM-DD HH:MM:SS)
const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const time =
  d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
  ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());

// 4. Write src/buildInfo.ts
const content =
  '// 自动生成，每次打包时更新 - 请勿手动修改\n' +
  "export const buildInfo = { version: '" + newVer + "', buildTime: '" + time + "' };\n";
fs.writeFileSync(buildInfoFile, content, 'utf8');

// 5. Update package.json version so electron-builder picks it up automatically
const pkgFile = path.join(root, 'package.json');
if (fs.existsSync(pkgFile)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    pkg.version = newVer;
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  } catch (e) {
    console.warn('[bump-version] Failed to update package.json version:', e.message);
  }
}

// 6. Print "version|time" for build-win.bat to capture
console.log(newVer + '|' + time);