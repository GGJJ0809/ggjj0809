import { app, BrowserWindow, shell, ipcMain, dialog, globalShortcut, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';
import { createHash } from 'crypto';
import { spawn, spawnSync } from 'child_process';
import net from 'net';
import os from 'os';
import { getPortConfig, savePortConfig } from './port-config.js';
// import './ipc-db.js'; // 改为动态导入，确保打包后正确加载

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

// ─── 大屏窗口引用 ──────────────────────────────────────────────────────────
let displayWindow = null;
let mainWindow = null;

// 检测是否通过 --display 参数启动纯大屏模式
const isDisplayMode = process.argv.includes('--display');
// 检测是否通过 --display-second-screen 参数启动大屏到副屏
const isDisplaySecondScreen = process.argv.includes('--display-second-screen');
// 检测是否通过 --display3 参数启动今日菜品竖屏
const isDisplay3Mode = process.argv.includes('--display3');

// ─── 乐牛菜牌本地服务器引用 ───────────────────────────────────────────────
let localServerInfo = { port: 0, server: null, mqttPort: 0, mqttServer: null };

// ─── 日志系统：所有 console 输出同时写入桌面日志文件 ────────────────────────
let logFile = null;
let logStream = null;

function setupLogging() {
  try {
    const logDir = path.join(app.getPath('desktop'), 'canteen-logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    logFile = path.join(logDir, `canteen-main-${timestamp}.log`);
    logStream = fs.createWriteStream(logFile, { flags: 'a' });

    const writeLog = (level, ...args) => {
      const line = `[${new Date().toISOString()}] [${level}] ${args.map(a => {
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      }).join(' ')}
`;
      logStream.write(line);
      process.stderr.write(line);
    };

    const originalLog = console.log.bind(console);
    const originalError = console.error.bind(console);
    const originalWarn = console.warn.bind(console);

    console.log = (...args) => { writeLog('LOG', ...args); originalLog(...args); };
    console.error = (...args) => { writeLog('ERROR', ...args); originalError(...args); };
    console.warn = (...args) => { writeLog('WARN', ...args); originalWarn(...args); };

    writeLog('INIT', '=== Logging started ===');
    writeLog('INIT', `Platform: ${process.platform} ${process.arch}`);
    writeLog('INIT', `Electron: ${process.versions.electron}`);
    writeLog('INIT', `Chrome: ${process.versions.chrome}`);
    writeLog('INIT', `Node: ${process.versions.node}`);
    writeLog('INIT', `App path: ${app.getAppPath()}`);
    writeLog('INIT', `User data: ${app.getPath('userData')}`);
    writeLog('INIT', `Desktop: ${app.getPath('desktop')}`);
    writeLog('INIT', `Log file: ${logFile}`);
    writeLog('INIT', `Argv: ${process.argv.join(' ')}`);

    process.on('uncaughtException', (err) => {
      writeLog('FATAL', `Uncaught: ${err.message}\n${err.stack}`);
      originalError('Uncaught Exception:', err);
    });

    process.on('unhandledRejection', (reason) => {
      writeLog('FATAL', `Unhandled Rejection: ${reason}`);
      originalError('Unhandled Rejection:', reason);
    });

    return writeLog;
  } catch (e) {
    console.error('[Log Setup Failed]', e.message);
    return () => {};
  }
}

// ─── 加载 .env 文件到 process.env ─────────────────────────────────────────
function loadEnvFromFile() {
  const candidates = [
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '.env'),
    path.join(app.getAppPath(), '.env'),
    path.join(process.resourcesPath, '.env'),
    path.join(process.resourcesPath, 'app', '.env'),
  ];
  console.log('[main] loadEnvFromFile candidates:', candidates);
  // 如果 resourcesPath 存在，列出其内容以便调试
  try {
    if (process.resourcesPath && fs.existsSync(process.resourcesPath)) {
      const items = fs.readdirSync(process.resourcesPath);
      console.log('[main] resourcesPath contents:', items.join(', '));
    }
  } catch (e) {
    console.warn('[main] Failed to list resourcesPath:', e.message);
  }

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf-8');
        content.split('\n').forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const eq = trimmed.indexOf('=');
          if (eq === -1) return;
          const key = trimmed.slice(0, eq).trim();
          let value = trimmed.slice(eq + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        });
        console.log('[main] Loaded .env from:', envPath);
        console.log('[main] VITE_PUBLIC_SUPABASE_URL length:', (process.env.VITE_PUBLIC_SUPABASE_URL || '').length);
        console.log('[main] VITE_PUBLIC_SUPABASE_ANON_KEY length:', (process.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '').length);
        return;
      } catch (e) {
        console.warn('[main] Failed to load .env from:', envPath, e.message);
      }
    }
  }
  console.warn('[main] No .env file found in any candidate path');
  // 回退：如果 .env 找不到，尝试从 userData 目录读取
  try {
    const userDataEnv = path.join(app.getPath('userData'), '.env');
    if (fs.existsSync(userDataEnv)) {
      const content = fs.readFileSync(userDataEnv, 'utf-8');
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eq = trimmed.indexOf('=');
        if (eq === -1) return;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      });
      console.log('[main] Fallback loaded .env from userData:', userDataEnv);
      console.log('[main] VITE_PUBLIC_SUPABASE_URL length:', (process.env.VITE_PUBLIC_SUPABASE_URL || '').length);
      console.log('[main] VITE_PUBLIC_SUPABASE_ANON_KEY length:', (process.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '').length);
    } else {
      console.warn('[main] No .env in userData either:', userDataEnv);
    }
  } catch (e) {
    console.warn('[main] Fallback .env load failed:', e.message);
  }
}

// ─── IPC 处理器 ─────────────────────────────────────────────────────────────

// ─── 海康威视 Digest Auth 截图代理 ─────────────────────────────────────────
function md5(str) {
  return createHash('md5').update(str).digest('hex');
}

function parseDigestAuthHeader(header) {
  const result = {};
  const content = header.replace(/^Digest\s+/i, '');
  const parts = content.split(',');
  for (let part of parts) {
    part = part.trim();
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.substring(0, eqIdx).trim();
    let value = part.substring(eqIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function makeDigestAuthHeader(parts, username, password, method, uri) {
  const { realm, nonce, qop, opaque, algorithm } = parts;
  const cnonce = md5(Math.random().toString()).substring(0, 16);
  const nc = '00000001';
  const HA1 = md5(`${username}:${realm}:${password}`);
  const HA2 = md5(`${method}:${uri}`);
  let response;
  if (qop) {
    response = md5(`${HA1}:${nonce}:${nc}:${cnonce}:${qop}:${HA2}`);
  } else {
    response = md5(`${HA1}:${nonce}:${HA2}`);
  }
  let header = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (algorithm) header += `, algorithm=${algorithm}`;
  if (opaque) header += `, opaque="${opaque}"`;
  if (qop) header += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  return header;
}

function fetchImageWithDigestAuth(url, username, password) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: 8000,
    };

    function makeRequest(authHeader) {
      const reqOptions = { ...options };
      if (authHeader) {
        reqOptions.headers = { Authorization: authHeader };
      }
      const req = http.request(reqOptions, (res) => {
        if (res.statusCode === 401 && !authHeader) {
          const wwwAuth = res.headers['www-authenticate'];
          if (!wwwAuth || !wwwAuth.toLowerCase().startsWith('digest')) {
            reject(new Error('Server does not support Digest auth'));
            return;
          }
          const parts = parseDigestAuthHeader(wwwAuth);
          const secondHeader = makeDigestAuthHeader(parts, username, password, 'GET', parsed.pathname + parsed.search);
          makeRequest(secondHeader);
        } else if (res.statusCode === 200) {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const base64 = buffer.toString('base64');
            resolve(`data:image/jpeg;base64,${base64}`);
          });
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    }

    makeRequest(null);
  });
}

ipcMain.handle('hikvision:snapshot', async (_event, { ip, port, username, password, channelNo }) => {
  try {
    const channelId = `${String(channelNo).padStart(3, '0')}01`;
    const url = `http://${ip}:${port || 80}/ISAPI/Streaming/channels/${channelId}/picture`;
    const dataUrl = await fetchImageWithDigestAuth(url, username, password);
    return { success: true, data: dataUrl };
  } catch (err) {
    console.error('[Hikvision Snapshot Error]', err.message, '| IP:', ip, 'CH:', channelNo);
    let code = 'unknown';
    let detail = err.message;
    const msg = err.message || '';
    if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ETIME')) {
      code = 'timeout';
      detail = '连接超时：请检查 IP 地址和端口是否正确，设备是否在线';
    } else if (msg.includes('ECONNREFUSED')) {
      code = 'refused';
      detail = '连接被拒绝：端口未开放或服务未启动';
    } else if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN')) {
      code = 'dns';
      detail = '无法解析 IP 地址';
    } else if (msg.includes('401') || msg.includes('Unauthorized')) {
      code = 'auth';
      detail = '认证失败：用户名或密码错误';
    } else if (msg.includes('404') || msg.includes('Not Found')) {
      code = 'notfound';
      detail = '通道不存在：请检查通道号是否正确';
    } else if (msg.includes('Digest') || msg.includes('digest')) {
      code = 'auth';
      detail = '认证失败：设备不支持 Digest 认证或账号密码错误';
    }
    return { success: false, error: err.message, code, detail };
  }
});

// ─── 海康威视设备信息查询（ISAPI deviceInfo）─────────────────────────────
function fetchTextWithDigestAuth(url, username, password) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname + (parsed.search || ''),
      method: 'GET',
      timeout: 8000,
    };

    function makeRequest(authHeader) {
      const reqOptions = { ...options };
      if (authHeader) {
        reqOptions.headers = { Authorization: authHeader };
      }
      const req = http.request(reqOptions, (res) => {
        if (res.statusCode === 401 && !authHeader) {
          const wwwAuth = res.headers['www-authenticate'];
          if (!wwwAuth || !wwwAuth.toLowerCase().startsWith('digest')) {
            reject(new Error('Server does not support Digest auth'));
            return;
          }
          const parts = parseDigestAuthHeader(wwwAuth);
          const secondHeader = makeDigestAuthHeader(parts, username, password, 'GET', parsed.pathname + (parsed.search || ''));
          makeRequest(secondHeader);
        } else if (res.statusCode === 200) {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8');
            resolve(body);
          });
        } else if (res.statusCode === 401) {
          reject(new Error('401 Unauthorized'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    }

    makeRequest(null);
  });
}

ipcMain.handle('hikvision:deviceInfo', async (_event, { ip, port, username, password }) => {
  try {
    const url = `http://${ip}:${port || 80}/ISAPI/System/deviceInfo`;
    const xmlText = await fetchTextWithDigestAuth(url, username, password);
    return { success: true, data: xmlText };
  } catch (err) {
    console.error('[Hikvision DeviceInfo Error]', err.message, '| IP:', ip);
    let code = 'unknown';
    let detail = err.message;
    const msg = err.message || '';
    if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ETIME')) {
      code = 'timeout';
      detail = '连接超时：请检查 IP 地址和端口是否正确，设备是否在线';
    } else if (msg.includes('ECONNREFUSED')) {
      code = 'refused';
      detail = '连接被拒绝：端口未开放或服务未启动';
    } else if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN')) {
      code = 'dns';
      detail = '无法解析 IP 地址';
    } else if (msg.includes('401') || msg.includes('Unauthorized')) {
      code = 'auth';
      detail = '认证失败：用户名或密码错误';
    } else if (msg.includes('Digest') || msg.includes('digest')) {
      code = 'auth';
      detail = '认证失败：设备不支持 Digest 认证或账号密码错误';
    }
    return { success: false, error: err.message, code, detail };
  }
});

// ─── RTSP 转 HLS 引擎 ───────────────────────────────────────────────────────
const rtspStreams = new Map();

let hlsHttpServer = null;
let hlsHttpPort = 0;

// ─── 启动 HLS 文件 HTTP 服务器 ─────────────────────────────────────────────
async function ensureHlsHttpServer() {
  if (hlsHttpServer) return hlsHttpPort;

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = reqUrl.pathname;

    if (!pathname.startsWith('/hls/')) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const parts = pathname.split('/');
    if (parts.length < 4) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const streamId = parts[2];
    const fileName = parts[3];
    const hlsDir = path.join(os.tmpdir(), 'canteen-hls', streamId);
    const filePath = path.join(hlsDir, fileName);

    // 安全校验：防止目录穿越
    if (!filePath.startsWith(hlsDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const mime = fileName.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
      res.writeHead(200, {
        'Content-Type': mime,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        hlsHttpPort = addr.port;
        console.log(`[HLS] HTTP 文件服务器已启动: http://127.0.0.1:${hlsHttpPort}`);
        resolve();
      } else {
        reject(new Error('无法获取 HLS HTTP 服务器端口'));
      }
    });
    server.on('error', reject);
  });

  hlsHttpServer = server;
  return hlsHttpPort;
}

// ─── 解析 ffmpeg 路径（优先使用打包内置的静态编译版本）────────────────────
function isElfBinary(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46;
  } catch {
    return false;
  }
}

function getFfmpegPath() {
  if (isDev) return 'ffmpeg';
  if (process.platform === 'linux') {
    try {
      const { status } = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 5000 });
      if (status === 0) {
        console.log('[RTSP] 系统 ffmpeg 可用，优先使用系统版本');
        return 'ffmpeg';
      }
    } catch { /* ignore */ }
    const bundledPath = path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg');
    if (fs.existsSync(bundledPath)) {
      if (process.platform === 'linux' && !isElfBinary(bundledPath)) {
        console.warn('[RTSP] 内置 ffmpeg 不是有效的 Linux ELF 二进制，跳过:', bundledPath);
      } else {
        console.log('[RTSP] 使用内置 ffmpeg:', bundledPath);
        return bundledPath;
      }
    }
    console.log('[RTSP] 内置 ffmpeg 未找到或格式不对，回退到系统 ffmpeg');
    return 'ffmpeg';
  }
  const bundledPath = path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg');
  if (fs.existsSync(bundledPath)) {
    console.log('[RTSP] 使用内置 ffmpeg:', bundledPath);
    return bundledPath;
  }
  console.log('[RTSP] 内置 ffmpeg 未找到，回退到系统 ffmpeg');
  return 'ffmpeg';
}

function checkFfmpegExists(ffmpegPath) {
  return new Promise((resolve) => {
    if (ffmpegPath === 'ffmpeg') {
      const probe = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
      probe.on('close', (code) => resolve(code === 0));
      probe.on('error', () => resolve(false));
    } else {
      resolve(fs.existsSync(ffmpegPath));
    }
  });
}

function makeStreamId(rtspUrl) {
  return createHash('sha256').update(rtspUrl).digest('hex').slice(0, 16);
}

function getHlsDir(streamId) {
  return path.join(os.tmpdir(), 'canteen-hls', streamId);
}

function ensureHlsDir(streamId) {
  const dir = getHlsDir(streamId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function cleanHlsDir(streamId) {
  const dir = getHlsDir(streamId);
  try {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        fs.unlinkSync(path.join(dir, f));
      }
      fs.rmdirSync(dir);
    }
  } catch (e) {
    console.warn(`[HLS] 清理目录失败: ${dir}`, e.message);
  }
}

// ─── 启动单个 RTSP 转 HLS 流，支持自动降级参数模式 ────────────────────────────
function getFfmpegArgs(rtspUrl, m3u8Path, mode) {
  const baseArgs = [
    '-rtsp_transport', 'tcp',
    '-fflags', 'nobuffer',
    '-flags', 'low_delay',
    '-max_delay', '500000',
    '-i', rtspUrl,
  ];
  const hlsArgs = [
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '5',
    '-hls_flags', 'delete_segments+append_list',
    '-an',
    '-muxdelay', '0',
    '-y',
    m3u8Path,
  ];

  if (mode === 'copy') {
    return [
      ...baseArgs,
      '-c:v', 'copy',
      '-pix_fmt', 'yuv420p',
      ...hlsArgs,
    ];
  }

  if (mode === 'libx264-lite') {
    return [
      ...baseArgs,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-g', '30',
      '-sc_threshold', '0',
      '-pix_fmt', 'yuv420p',
      ...hlsArgs,
    ];
  }

  // mode === 'libx264-full' (default)
  return [
    ...baseArgs,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-profile:v', 'baseline',
    '-level', '3.0',
    '-crf', '28',
    '-g', '30',
    '-sc_threshold', '0',
    '-pix_fmt', 'yuv420p',
    '-flush_packets', '1',
    ...hlsArgs,
  ];
}

async function trySpawnRtspStream(rtspUrl, ffmpegPath, mode) {
  const key = rtspUrl;
  const streamId = makeStreamId(rtspUrl);
  const hlsDir = ensureHlsDir(streamId);
  const m3u8Path = path.join(hlsDir, 'live.m3u8');

  const port = await ensureHlsHttpServer();
  const hlsUrl = `http://127.0.0.1:${port}/hls/${streamId}/live.m3u8`;
  const ffmpegArgs = getFfmpegArgs(rtspUrl, m3u8Path, mode);

  console.log(`[RTSP] 尝试启动 HLS 流: ${key} mode=${mode} streamId=${streamId}`);
  console.log(`[RTSP] ffmpeg 命令: ${ffmpegPath} ${ffmpegArgs.join(' ')}`);

  let ffmpegStarted = false;
  const stderrBuffer = [];
  const MAX_STDERR_LINES = 200;

  const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  ffmpeg.stderr.on('data', (data) => {
    const msg = data.toString();
    stderrBuffer.push(msg);
    if (stderrBuffer.length > MAX_STDERR_LINES) stderrBuffer.shift();

    if (msg.includes('frame=') && !ffmpegStarted) {
      ffmpegStarted = true;
      console.log(`[RTSP] ffmpeg 已开始编码: ${key} mode=${mode}`);
    }
    if (msg.includes('Stream mapping') || msg.includes('Press [q]') || msg.includes('Output #0')) {
      if (!ffmpegStarted) {
        ffmpegStarted = true;
        console.log(`[RTSP] ffmpeg 输出流已建立: ${key} mode=${mode}`);
      }
    }
    if (msg.includes('Error') || msg.includes('error') || msg.includes('failed') || msg.includes('Invalid') || msg.includes('not found') || msg.includes('Connection refused') || msg.includes('does not support') || msg.includes('Unrecognized') || msg.includes('unknown')) {
      console.error(`[RTSP] ffmpeg stderr: ${key} | ${msg.trim()}`);
    }
  });

  const startupResult = await new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (ffmpegStarted && fs.existsSync(m3u8Path)) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        resolve({ ok: true });
        return;
      }
      if (ffmpeg.exitCode !== null) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        const lastErr = stderrBuffer.join('').trim();
        resolve({ ok: false, code: ffmpeg.exitCode, signal: ffmpeg.signalCode, stderr: lastErr });
      }
    }, 200);

    const timeout = setTimeout(() => {
      if (ffmpegStarted && fs.existsSync(m3u8Path)) {
        clearInterval(checkInterval);
        resolve({ ok: true });
        return;
      }
      clearInterval(checkInterval);
      const lastErr = stderrBuffer.join('').trim();
      resolve({ ok: false, timeout: true, stderr: lastErr });
    }, 15000);

    ffmpeg.on('error', (err) => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
      resolve({ ok: false, spawnError: err.message, code: err.code });
    });
  });

  if (!startupResult.ok) {
    try { ffmpeg.kill('SIGKILL'); } catch { /* ignore */ }
    cleanHlsDir(streamId);
    return { ok: false, ...startupResult, mode };
  }

  ffmpeg.on('error', (err) => {
    console.error(`[RTSP] ffmpeg 进程错误: ${key}`, err.message);
    rtspStreams.delete(key);
    cleanHlsDir(streamId);
  });

  ffmpeg.on('close', (code, signal) => {
    console.log(`[RTSP] ffmpeg 退出 code=${code} signal=${signal}: ${key}`);
    rtspStreams.delete(key);
    cleanHlsDir(streamId);
  });

  const stream = { ffmpeg, clients: 1, streamId, hlsUrl, m3u8Path };
  rtspStreams.set(key, stream);

  return { ok: true, hlsUrl, streamId, mode };
}

async function spawnRtspStream(rtspUrl, ffmpegPath) {
  const modes = ['libx264-full', 'libx264-lite', 'copy'];
  let lastError = null;

  for (const mode of modes) {
    const result = await trySpawnRtspStream(rtspUrl, ffmpegPath, mode);
    if (result.ok) {
      console.log(`[RTSP] ffmpeg 启动成功: mode=${mode} hlsUrl=${result.hlsUrl}`);
      return result;
    }
    lastError = result;
    console.warn(`[RTSP] mode=${mode} 启动失败，尝试降级…`);
  }

  // 全部模式都失败
  return { ok: false, ...lastError };
}

ipcMain.handle('rtsp:start', async (_event, { rtspUrl }) => {
  if (!rtspUrl || !rtspUrl.startsWith('rtsp://')) {
    return { success: false, error: '无效的 RTSP 地址，必须以 rtsp:// 开头' };
  }

  const key = rtspUrl;
  if (rtspStreams.has(key)) {
    const stream = rtspStreams.get(key);
    stream.clients += 1;
    console.log(`[RTSP] 复用已有流: ${key} clients=${stream.clients} hlsUrl=${stream.hlsUrl}`);
    return { success: true, hlsUrl: stream.hlsUrl };
  }

  const ffmpegPath = getFfmpegPath();
  const ffmpegExists = await checkFfmpegExists(ffmpegPath);
  if (!ffmpegExists) {
    const errMsg = ffmpegPath === 'ffmpeg'
      ? '系统未找到 ffmpeg 命令，请安装 ffmpeg 或将静态二进制文件放入 resources/ffmpeg/ 目录'
      : `内置 ffmpeg 路径不存在: ${ffmpegPath}`;
    console.error(`[RTSP] ffmpeg 不可用: ${errMsg}`);
    return { success: false, error: errMsg };
  }

  try {
    const result = await spawnRtspStream(rtspUrl, ffmpegPath);

    if (!result.ok) {
      let detail = '';
      if (result.spawnError) {
        detail = `ffmpeg 启动失败: ${result.spawnError}`;
        if (result.code === 'ENOENT') {
          detail = 'ffmpeg 未安装或不在 PATH 中，请执行 apt install ffmpeg 或提供静态二进制文件';
        }
      } else if (result.timeout) {
        detail = 'ffmpeg 启动超时（15秒），可能原因：RTSP 地址不可达、摄像头离线、网络不通。';
        if (result.stderr) {
          detail += ` ffmpeg 输出: ${result.stderr.substring(0, 500)}`;
        }
      } else {
        detail = `ffmpeg 进程退出，码=${result.code}`;
        if (result.signal) detail += ` 信号=${result.signal}`;
        if (result.mode) detail += ` [模式=${result.mode}]`;
        if (result.stderr) {
          detail += `。输出: ${result.stderr.substring(0, 500)}`;
        }
      }
      console.error(`[RTSP] 启动失败: ${key} | ${detail}`);
      return { success: false, error: detail };
    }

    console.log(`[RTSP] ffmpeg 确认启动成功: ${key} hlsUrl=${result.hlsUrl}`);
    return { success: true, hlsUrl: result.hlsUrl };
  } catch (err) {
    console.error(`[RTSP] 启动异常: ${key}`, err.message);
    return { success: false, error: err.message || '启动 RTSP 流失败' };
  }
});

ipcMain.handle('rtsp:stop', async (_event, { rtspUrl }) => {
  const key = rtspUrl;
  const stream = rtspStreams.get(key);
  if (!stream) return { success: true };

  stream.clients -= 1;
  console.log(`[RTSP] 停止引用: ${key} clients=${stream.clients}`);

  if (stream.clients <= 0) {
    console.log(`[RTSP] 销毁流: ${key}`);
    try { stream.ffmpeg.kill('SIGTERM'); } catch { /* ignore */ }
    setTimeout(() => {
      try { stream.ffmpeg.kill('SIGKILL'); } catch { /* ignore */ }
    }, 3000);
    rtspStreams.delete(key);
    cleanHlsDir(stream.streamId);
  }

  return { success: true };
});

// ─── 窗口管理 ───────────────────────────────────────────────────────────────
function resolveIndexPath() {
  const candidates = [
    path.join(__dirname, '../out/index.html'),
    path.join(app.getAppPath(), 'out/index.html'),
    path.join(__dirname, 'index.html'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  console.error('[Electron] index.html not found! Searched:', candidates);
  return candidates[0];
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: '食堂智慧管理系统',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools();
  } else {
    const indexPath = resolveIndexPath();
    console.log('[Electron] Loading index from:', indexPath, '| exists:', fs.existsSync(indexPath));
    win.loadFile(indexPath);
  }

  // ═══ DevTools 调试：全部操作都打日志 ═══════════════════════════════════
  const devtoolsLog = (msg) => {
    const state = {
      isDevToolsOpened: win.webContents.isDevToolsOpened(),
      isDestroyed: win.isDestroyed(),
      isFocused: win.isFocused(),
      isVisible: win.isVisible(),
    };
    console.log(`[DevTools] ${msg} | state:`, JSON.stringify(state));
  };

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      devtoolsLog('F12 via before-input-event');
      try {
        win.webContents.toggleDevTools();
        devtoolsLog('toggleDevTools called, result=' + win.webContents.isDevToolsOpened());
      } catch (e) {
        console.error('[DevTools] toggleDevTools error:', e.message, e.stack);
      }
    }
  });

  const ret = globalShortcut.register('F12', () => {
    devtoolsLog('F12 via globalShortcut');
    try {
      win.webContents.toggleDevTools();
      devtoolsLog('globalShortcut toggleDevTools result=' + win.webContents.isDevToolsOpened());
    } catch (e) {
      console.error('[DevTools] globalShortcut toggleDevTools error:', e.message, e.stack);
    }
  });
  console.log('[DevTools] globalShortcut F12 registered:', ret);
  if (!ret) {
    console.warn('[DevTools] globalShortcut F12 注册失败');
  }

  win.webContents.once('did-finish-load', () => {
    devtoolsLog('did-finish-load');
    // Auto-open DevTools disabled — use F12 to open manually when needed
  });

  win.webContents.on('dom-ready', () => {
    // Auto-open DevTools disabled — use F12 to open manually when needed
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Electron] Failed to load:', validatedURL, 'code:', errorCode, 'desc:', errorDescription);
  });
  // ══════════════════════════════════════════════════════════════════════

  win.webContents.on('console-message', (_event, level, message) => {
    console.log(`[Renderer:${level}] ${message}`);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow = win;
  return win;
}

// ─── 创建大屏展示窗口 ──────────────────────────────────────────────────────
function createDisplayWindow(screenId = '') {
  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.focus();
    return displayWindow;
  }

  // 获取副屏（如果有的话）
  const displays = screen.getAllDisplays();
  const targetDisplay = isDisplaySecondScreen && displays.length > 1
    ? displays[1] // 副屏
    : displays[0]; // 主屏

  const displayWin = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    fullscreen: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      additionalArguments: ['--display-mode'],
    },
  });

  // 构建 URL，支持 screenId 参数
  let url = 'http://localhost:3000';
  if (!isDev) {
    url = 'file://' + resolveIndexPath();
  }
  if (screenId) {
    url += (url.includes('?') ? '&' : '?') + 'screenId=' + encodeURIComponent(screenId);
  }

  if (isDev) {
    displayWin.loadURL(url);
  } else {
    // 对于 file:// 协议，使用 HashRouter 来支持 screenId
    const indexPath = resolveIndexPath();
    const hashPath = screenId ? '#/display/' + screenId : '#/display';
    displayWin.loadFile(indexPath, { hash: hashPath });
  }

  // 大屏窗口不自动打开 DevTools
  displayWin.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Display] Failed to load:', validatedURL, 'code:', errorCode, 'desc:', errorDescription);
  });

  displayWin.webContents.on('console-message', (_event, level, message) => {
    console.log(`[Display:${level}] ${message}`);
  });

  displayWin.on('closed', () => {
    console.log('[Display] 大屏窗口已关闭');
    displayWindow = null;
  });

  // 注册全局快捷键：ESC 退出全屏（非 kiosk 模式可用）
  displayWin.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      console.log('[Display] ESC pressed, exiting fullscreen');
      displayWin.setFullScreen(false);
    }
    if (input.type === 'keyDown' && input.key === 'F11') {
      displayWin.setFullScreen(!displayWin.isFullScreen());
    }
  });

  displayWindow = displayWin;
  console.log(`[Display] 大屏窗口已启动，分辨率: ${targetDisplay.bounds.width}x${targetDisplay.bounds.height}`);
  return displayWin;
}

// ─── IPC：大屏窗口控制 ───────────────────────────────────────────────────
ipcMain.handle('display:open', (_event, { screenId } = {}) => {
  try {
    const win = createDisplayWindow(screenId);
    return { success: true };
  } catch (err) {
    console.error('[Display] 启动大屏失败:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('display:close', () => {
  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.close();
    displayWindow = null;
  }
  return { success: true };
});

ipcMain.handle('display:status', () => {
  return {
    open: displayWindow !== null && !displayWindow.isDestroyed(),
    fullscreen: displayWindow ? displayWindow.isFullScreen() : false,
  };
});
app.commandLine.appendSwitch('v', '1');

// ─── 数据库 IPC 模块 fallback 注册 ─────────────────────────────────────────
function registerFallbackDbHandlers() {
  ipcMain.handle('db:run', async () => ({
    error: 'Database IPC module not loaded. Please restart the application.',
    lastInsertRowid: 0,
    changes: 0,
  }));
  ipcMain.handle('db:query', async () => ({
    data: [],
    error: 'Database IPC module not loaded. Please restart the application.',
    count: 0,
  }));
  ipcMain.handle('db:exec', async () => ({
    error: 'Database IPC module not loaded. Please restart the application.',
  }));
  ipcMain.handle('db:backup', async () => ({
    success: false,
    message: 'Database IPC module not loaded. Please restart the application.',
  }));
  ipcMain.handle('db:restore', async () => ({
    success: false,
    message: 'Database IPC module not loaded. Please restart the application.',
  }));
  ipcMain.handle('db:info', async () => ({
    path: '',
    size: 0,
    modifiedAt: null,
    error: 'Database IPC module not loaded. Please restart the application.',
    connected: false,
  }));
  console.log('[main] Fallback database IPC handlers registered');
}

// ─── 静态版菜品查询（供 MQTT 推送 IPC 使用）───────────────────────────

// ═══ 智能 station 解析（与 local-server.js 一致）═══
function resolveStationProductId(dbQuery, stationId) {
  if (!dbQuery || !stationId) return { bindMode: 'all', bindValue: '', dishName: '' };
  try {
    const stationRows = dbQuery(
      'SELECT id, name, product_item_id, dish_name FROM tray_stations WHERE id = ?',
      [stationId]
    );
    if (!stationRows || stationRows.length === 0) {
      console.log(`[Main-StationResolve] station_id=${stationId} 不存在，回退 all`);
      return { bindMode: 'all', bindValue: '', dishName: '' };
    }
    const station = stationRows[0];
    const pid = station.product_item_id;
    const dishName = station.dish_name || '';
    if (pid) {
      const productRows = dbQuery('SELECT id, name FROM product_items WHERE id = ?', [pid]);
      if (productRows && productRows.length > 0) {
        console.log(`[Main-StationResolve] ✅ ID匹配: ${pid} → ${productRows[0].name}`);
        return { bindMode: 'single', bindValue: String(pid), dishName: productRows[0].name };
      }
    }
    if (dishName) {
      const productRows = dbQuery('SELECT id, name FROM product_items WHERE name = ?', [dishName]);
      if (productRows && productRows.length > 0) {
        console.log(`[Main-StationResolve] ✅ 菜名精确匹配: ${dishName} → id=${productRows[0].id}`);
        return { bindMode: 'single', bindValue: String(productRows[0].id), dishName };
      }
      const likeRows = dbQuery("SELECT id, name FROM product_items WHERE name LIKE ? LIMIT 1", [`%${dishName}%`]);
      if (likeRows && likeRows.length > 0) {
        console.log(`[Main-StationResolve] ✅ 模糊匹配: ${dishName} → ${likeRows[0].name}`);
        return { bindMode: 'single', bindValue: String(likeRows[0].id), dishName };
      }
    }
    // ★ v2 修复：无法匹配时，改为 all 模式（返回全部 product_items），避免「无效菜品」
    console.log(`[Main-StationResolve] ❌ station_id=${stationId} 无法匹配，回退 all 模式`);
    return { bindMode: 'all', bindValue: '', dishName: '' };
  } catch (err) {
    console.error('[Main-StationResolve] 失败:', err.message);
    return { bindMode: 'all', bindValue: '', dishName: '' };
  }
}

function fetchTodayDishNutritionStatic(dbQuery, mealTypeFilter = null) {
  if (!dbQuery) return null;
  try {
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    const todayStr = d.toISOString().slice(0, 10);
    let sql = 'SELECT * FROM dish_nutrition WHERE menu_date = ?';
    const params = [todayStr];
    if (mealTypeFilter !== null && mealTypeFilter !== undefined) {
      sql += ' AND meal_type = ?';
      params.push(Number(mealTypeFilter));
    }
    sql += ' ORDER BY meal_type, id';
    const rows = dbQuery(sql, params);
    if (!rows || rows.length === 0) return null;
    const mealLabel = mealTypeFilter !== null && mealTypeFilter !== undefined
      ? `(${['早餐','午餐','晚餐'][Number(mealTypeFilter)] || '未知'})`
      : '';
    console.log(`[fetchTodayDishNutritionStatic] 今日菜品${mealLabel}: ${rows.length} 道, date=${todayStr}`);
    return rows.map((row) => {
      const calories = Number(row.calories_per_100g) || 0;
      const protein = Number(row.protein_per_100g) || 0;
      const fat = Number(row.fat_per_100g) || 0;
      const carbs = Number(row.carbs_per_100g) || 0;
      const imageUrl = row.img || '';
      const catName = row.category || '';
      const mealType = Number(row.meal_type) || 1;
      return {
        dishId: String(row.id),
        name: row.dish_name || '',
        price: 0,
        unit: '份',
        imageUrl,
        nutrition: { calories, protein, fat, carbs },
        tags: catName ? [catName] : [],
        id: String(row.id),
        productName: row.dish_name || '',
        dishName: row.dish_name || '',
        imgUrl: imageUrl,
        foodImage: imageUrl,
        calories,
        protein,
        fat,
        carbohydrate: carbs,
        fiber: 0,
        category: catName,
        typeName: catName,
        mealType,
        dishesId: Number(row.id),
        originalPrice: 0,
        prefPrice: 0,
        salePrice: 0,
        salesMode: 2,
        salseMode: 2,
        unitPrice: 0,
        weight: 150.0,
      };
    });
  } catch (e) {
    console.warn('[fetchTodayDishNutritionStatic] 失败:', e.message);
    return null;
  }
}

function fetchLocalProductItemsStatic(dbQuery, bindMode = 'all', bindValue = '') {
  if (!dbQuery) return [];
  try {
    // 先统计总数
    const totalRes = dbQuery('SELECT COUNT(*) as cnt FROM product_items', []);
    const totalCount = totalRes?.[0]?.cnt || 0;
    if (totalCount === 0) {
      console.log('[fetchLocalProductItemsStatic] product_items table is completely empty');
      return [];
    }

    // 优先查 active，如果 active 为空则查全部状态
    let sql = "SELECT * FROM product_items WHERE status = 'active'";
    const params = [];
    if (bindMode === 'category' && bindValue) {
      sql += ' AND category_id = ?';
      params.push(bindValue);
    } else if (bindMode === 'single' && bindValue) {
      sql += ' AND id = ?';
      params.push(bindValue);
    } else if (bindMode === 'dishes' && bindValue) {
      const ids = bindValue.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        sql += ' AND id IN (' + ids.map(() => '?').join(',') + ')';
        params.push(...ids);
      }
    }
    let rows = dbQuery(sql, params);
    console.log('[fetchLocalProductItemsStatic] active rows:', rows?.length || 0);

    // 如果 active 为空，兜底查全部状态
    if (!rows || rows.length === 0) {
      console.log('[fetchLocalProductItemsStatic] no active items, falling back to ALL status');
      const allSql = 'SELECT * FROM product_items';
      const allParams = [];
      let allWhere = '';
      if (bindMode === 'category' && bindValue) {
        allWhere = ' WHERE category_id = ?';
        allParams.push(bindValue);
      } else if (bindMode === 'single' && bindValue) {
        allWhere = ' WHERE id = ?';
        allParams.push(bindValue);
      } else if (bindMode === 'dishes' && bindValue) {
        const ids = bindValue.split(',').map((s) => s.trim()).filter(Boolean);
        if (ids.length > 0) {
          allWhere = ' WHERE id IN (' + ids.map(() => '?').join(',') + ')';
          allParams.push(...ids);
        }
      }
      rows = dbQuery(allSql + allWhere, allParams);
      console.log('[fetchLocalProductItemsStatic] all-status rows:', rows?.length || 0);
    }

    if (!rows || rows.length === 0) return [];
    console.log('[fetchLocalProductItemsStatic] returning', rows.length, 'items, sample:', rows.slice(0, 3).map(r => `${r.name}(id=${r.id}, status=${r.status})`).join(', '));

    let fields = [];
    try { fields = dbQuery('SELECT id, name FROM product_custom_fields', []); } catch { /* ignore */ }
    const fieldMap = {};
    fields.forEach((f) => { fieldMap[f.id] = f.name; });
    const productIds = rows.map((r) => r.id);
    let categories = [];
    try { categories = dbQuery('SELECT id, name FROM product_categories', []); } catch { /* ignore */ }
    const categoryMap = {};
    categories.forEach((c) => { categoryMap[c.id] = c.name; });
    let customValues = [];
    if (productIds.length > 0) {
      try {
        const idsStr = productIds.join(',');
        customValues = dbQuery('SELECT product_id, field_id, value FROM product_custom_values WHERE product_id IN (' + idsStr + ')', []);
      } catch { /* ignore */ }
    }
    return rows.map((item) => {
      const cv = customValues.filter((v) => v.product_id === item.id);
      const vals = {};
      cv.forEach((v) => { const fn = fieldMap[v.field_id]; if (fn) vals[fn] = v.value; });
      let media = [];
      try { media = JSON.parse(item.media || '[]'); } catch { media = []; }
      const catName = categoryMap[item.category_id] || '';
      const imageUrl = media[0]?.url || '';
      const calories = Number(vals.calories) || 0;
      const protein = Number(vals.protein) || 0;
      const fat = Number(vals.fat) || 0;
      const carbs = Number(vals.carbs) || 0;
      const fiber = Number(vals.fiber) || 0;
      return {
        dishId: String(item.id),
        name: item.name,
        price: Number(item.price) || 0,
        unit: '份',
        imageUrl,
        nutrition: { calories, protein, fat, carbs },
        tags: catName ? [catName] : [],
        id: String(item.id),
        productName: item.name,
        dishName: item.name,
        imgUrl: imageUrl,
        foodImage: imageUrl,
        calories,
        protein,
        fat,
        carbohydrate: carbs,
        fiber,
        category: catName,
        typeName: catName,
        dishesId: Number(item.id),
        originalPrice: Math.round((Number(item.price) || 0) * 100),
        prefPrice: Math.round((Number(item.price) || 0) * 100),
        salePrice: Math.round((Number(item.price) || 0) * 100),
        salesMode: 2,
        salseMode: 2,
        unitPrice: 0,
        weight: 150.0,
      };
    });
  } catch (err) {
    console.error('[fetchLocalProductItemsStatic] error:', err.message);
    return [];
  }
}

app.whenReady().then(async () => {
  setupLogging();
  loadEnvFromFile();

  // 加载数据库 IPC 模块
  let ipcDbModule = null;
  try {
    ipcDbModule = await import('./ipc-db.js');
    console.log('[main] ipc-db.js loaded successfully');
    // 先初始化数据库，确保 db 被赋值后再启动本地服务器
    if (ipcDbModule && ipcDbModule.initDb) {
      await ipcDbModule.initDb();
      console.log('[main] Database initialized successfully');
    }
  } catch (err) {
    console.error('[main] Failed to load ipc-db.js:', err);
    registerFallbackDbHandlers();
  }

  // 启动乐牛菜牌本地服务器
  try {
    const { startLocalServer } = await import('./local-server.js');
    const supabaseUrl = (process.env.VITE_PUBLIC_SUPABASE_URL || '').replace(/\/+$/g, '');
    const supabaseAnonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';
    console.log('[main] startLocalServer supabaseUrl:', supabaseUrl ? `${supabaseUrl.slice(0, 20)}...` : '(empty)');
    console.log('[main] startLocalServer supabaseAnonKey:', supabaseAnonKey ? `${supabaseAnonKey.slice(0, 8)}...` : '(empty)');

    // 读取端口配置
    const portConfig = getPortConfig(app.getPath('userData'));
    console.log('[main] Port config loaded:', JSON.stringify(portConfig));

    // 构建 dbQuery 函数，让本地服务器能查询 tray_display_devices 表
    let dbQuery = () => [];
    if (ipcDbModule && ipcDbModule.db) {
      const { db, execQuery } = ipcDbModule;
      dbQuery = (sql, params) => {
        try {
          const trimmed = sql.trim().toLowerCase();
          // 写操作：INSERT / UPDATE / DELETE 用 db.run（支持参数化）
          if (trimmed.startsWith('insert') || trimmed.startsWith('update') || trimmed.startsWith('delete')) {
            const result = db.run(sql, params);
            const changes = db.getRowsModified();
            let lastInsertRowid = 0;
            if (changes > 0 && trimmed.startsWith('insert')) {
              try {
                const lr = db.exec('SELECT last_insert_rowid()');
                if (lr && lr.length > 0 && lr[0].values && lr[0].values.length > 0) {
                  lastInsertRowid = lr[0].values[0][0] || 0;
                }
              } catch {
                // ignore
              }
            }
            // ★ 诊断：tray_display_devices 写操作日志
            if (sql.toLowerCase().includes('tray_display_devices')) {
              console.log('[main-dbQuery:WRITE] ═══ tray_display_devices 直写 ═══');
              console.log('[main-dbQuery:WRITE] SQL: ' + sql.substring(0, 300));
              console.log('[main-dbQuery:WRITE] changes: ' + changes);
            }
            return [{ changes, lastInsertRowid }];
          }
          // 读操作：SELECT
          // ★ 诊断：tray_display_devices 读操作日志（精简版，只打关键信息）
          if (sql.toLowerCase().includes('tray_display_devices') && sql.toLowerCase().includes('select')) {
            console.log('[main-dbQuery:SELECT] ═══ tray_display_devices 查询 ═══');
            console.log('[main-dbQuery:SELECT] SQL: ' + sql.substring(0, 300));
            console.log('[main-dbQuery:SELECT] params: ' + JSON.stringify(params));
          }
          const rows = execQuery(db, sql, params);
          if (sql.toLowerCase().includes('tray_display_devices') && sql.toLowerCase().includes('select')) {
            console.log('[main-dbQuery:SELECT] 返回 ' + (rows ? rows.length : 0) + ' 行');
            if (rows && rows.length > 0) {
              console.log('[main-dbQuery:SELECT] 第一行 keys: ' + JSON.stringify(Object.keys(rows[0])));
              console.log('[main-dbQuery:SELECT] ui_template=' + rows[0].ui_template + ' (type=' + typeof rows[0].ui_template + ')');
            }
          }
          return rows;
        } catch (err) {
          const msg = err.message || String(err);
          console.error('[main] dbQuery error:', msg, '| SQL:', sql.slice(0, 200));
          // 返回空数组而不是抛异常，防止本地服务器崩溃
          return [];
        }
      };
    }

    // 构建 trayWeightCallback：MQTT 重量变化后通过 IPC 推送给前端
    const trayWeightCallback = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('tray-data-changed', data);
          console.log('[IPC] tray-data-changed 已推送到前端:', JSON.stringify(data).slice(0, 200));
        } catch (e) {
          console.warn('[IPC] tray-data-changed 推送失败:', e.message);
        }
      }
    };

    const result = await startLocalServer(app.getPath('userData'), dbQuery, supabaseUrl, supabaseAnonKey, portConfig.httpPort, portConfig.mqttPort, portConfig.fixedHttpPort, trayWeightCallback);
    localServerInfo = { port: result.port, server: result.server, mqttPort: result.mqttPort, mqttServer: result.mqttServer, aedes: result.aedes, tokenMap: result.tokenMap };
    console.log(`[LocalServer] 启动成功: HTTP=${result.port}, MQTT=${result.mqttPort}`);

    // ── MQTT 推送 IPC：管理端修改设备配置后实时推送给硬件设备 ──
    ipcMain.handle('mqtt:push-device-config', async (_event, { sn, mealType: forceMealType }) => {
      if (!sn) return { success: false, error: '缺少设备 SN' };
      const aedes = localServerInfo.aedes;
      if (!aedes) return { success: false, error: 'MQTT Broker 未启动' };

      // 读取设备最新配置
      const deviceRows = dbQuery(
        `SELECT ui_template, bind_plate_before_take, weigh_alarm_model, min_settlement_weight, stable_difference, alarm_below_grams, max_weight_dish, max_price_temp_dish, interval_price_temp_dish, min_price_temp_dish, bind_mode, bind_value, station_id, meal_type FROM tray_display_devices WHERE sn = ?`,
        [sn]
      );
      const dbDevice = deviceRows[0] || {};

      const deviceConfig = {
        MaxPriceListForTemporaryDishes: String(dbDevice.max_price_temp_dish ?? 100),
        IntervalPriceListForTemporaryDishes: String(dbDevice.interval_price_temp_dish ?? 0.5),
        MixPriceListForTemporaryDishes: String(dbDevice.min_price_temp_dish ?? 0),
        ifBindplatebeforetakefood: String(dbDevice.bind_plate_before_take ?? 1),
        deviceUITemplate: String(dbDevice.ui_template ?? 1),
        weighAlarmModel: String(dbDevice.weigh_alarm_model ?? 1),
        minimumsettlementweight: String(dbDevice.min_settlement_weight ?? 10),
        stabledifference: String(dbDevice.stable_difference ?? 2),
        alarmBelowHowGrams: String(dbDevice.alarm_below_grams ?? -1000),
        maxWeightDish: String(dbDevice.max_weight_dish ?? 5000),
        maxPriceDish: '160',
        totalMaxWeightDish: '5000',
        totalMaxPriceDish: '160',
        ifUseQuota: '是',
        quotaAmountConfig: '',
        amountNotify: '30',
        allowBindplatemaxnum: '3',
        weighingValidTimeOnline: '30',
        waitingPayTime: '30',
        ifcareblance: '1',
        ifblancealarm: '1',
        alarmblance: '',
        weighIfSpoonWeight: '2',
        tempDishesPriceUnit: '1',
        ifOffLinePay: '是',
        offlineCheckBalance: '开启',
        weighingValidTime: '30',
        alarmTime: '15',
      };

      let bindMode = dbDevice.bind_mode || 'all';
      let bindValue = dbDevice.bind_value || '';
      if (bindMode === 'station' && dbDevice.station_id) {
        const resolved = resolveStationProductId(dbQuery, dbDevice.station_id);
        bindMode = resolved.bindMode;
        bindValue = resolved.bindValue;
      }

      // 确定餐次：强制参数优先，其次是设备配置的 meal_type
      const deviceMealType = dbDevice.meal_type !== null && dbDevice.meal_type !== undefined
        ? Number(dbDevice.meal_type)
        : null;
      const effectiveMealType = forceMealType !== undefined ? Number(forceMealType) : deviceMealType;

      // 优先推送今日菜单（dish_nutrition），今日为空时推送空数组，不回退到 product_items
      let dishes = fetchTodayDishNutritionStatic(dbQuery, effectiveMealType);
      if (!dishes) {
        console.log(`[MQTT-PUSH] ${sn} 今日无 dish_nutrition 数据，推送空菜品列表（不再回退到 product_items）`);
        dishes = [];
      }
      const mealLabel = effectiveMealType !== null && effectiveMealType !== undefined
        ? `(${['早餐','午餐','晚餐'][effectiveMealType] || '未知'}${dishes.length}道)`
        : `(${dishes.length}道)`;
      console.log(`[MQTT-PUSH] 推送菜品到 ${sn}${mealLabel}`);

      aedes.publish({
        cmd: 'publish',
        topic: `device/${sn}/menu`,
        payload: Buffer.from(JSON.stringify({ code: 0, msg: 'config_update', data: { dishes, deviceConfig } })),
        qos: 1,
        retain: true,
      }, () => {});
      console.log(`[MQTT-PUSH] 已推送配置更新到设备 ${sn}，UI模板=${deviceConfig.deviceUITemplate}`);
      return { success: true };
    });

    // ── MQTT 推送 IPC：菜品数据变更后推送给所有在线设备 ──
    ipcMain.handle('mqtt:push-dishes-update', async (_event, opts) => {
      const aedes = localServerInfo.aedes;
      if (!aedes) return { success: false, error: 'MQTT Broker 未启动' };
      const forceMealType = opts?.mealType !== undefined ? Number(opts.mealType) : undefined;

      const deviceRows = dbQuery(
        `SELECT sn, bind_mode, bind_value, station_id, meal_type, ui_template, bind_plate_before_take, weigh_alarm_model, min_settlement_weight, stable_difference, alarm_below_grams, max_weight_dish, max_price_temp_dish, interval_price_temp_dish, min_price_temp_dish FROM tray_display_devices WHERE status = 'online'`,
        []
      );
      let pushedCount = 0;
      for (const device of deviceRows) {
        const sn = device.sn;
        let bindMode = device.bind_mode || 'all';
        let bindValue = device.bind_value || '';
        // station 模式：用智能解析器
        if (bindMode === 'station' && device.station_id) {
          const resolved = resolveStationProductId(dbQuery, device.station_id);
          bindMode = resolved.bindMode;
          bindValue = resolved.bindValue;
        }
        // 确定餐次：强制参数优先，其次设备自身 meal_type
        const deviceMealType = device.meal_type !== null && device.meal_type !== undefined
          ? Number(device.meal_type)
          : null;
        const effectiveMealType = forceMealType !== undefined ? forceMealType : deviceMealType;

        // 优先推送今日菜单，今日为空时推送空数组，不回退到 product_items
        let dishes = fetchTodayDishNutritionStatic(dbQuery, effectiveMealType);
        if (!dishes) {
          console.log(`[MQTT-PUSH] ${sn} 今日无 dish_nutrition 数据，推送空菜品列表（不再回退到 product_items）`);
          dishes = [];
        }
        const deviceConfig = {
          MaxPriceListForTemporaryDishes: String(device.max_price_temp_dish ?? 100),
          IntervalPriceListForTemporaryDishes: String(device.interval_price_temp_dish ?? 0.5),
          MixPriceListForTemporaryDishes: String(device.min_price_temp_dish ?? 0),
          ifBindplatebeforetakefood: String(device.bind_plate_before_take ?? 1),
          deviceUITemplate: String(device.ui_template ?? 1),
          weighAlarmModel: String(device.weigh_alarm_model ?? 1),
          minimumsettlementweight: String(device.min_settlement_weight ?? 10),
          stabledifference: String(device.stable_difference ?? 2),
          alarmBelowHowGrams: String(device.alarm_below_grams ?? -1000),
          maxWeightDish: String(device.max_weight_dish ?? 5000),
          maxPriceDish: '160',
          totalMaxWeightDish: '5000',
          totalMaxPriceDish: '160',
          ifUseQuota: '是',
          quotaAmountConfig: '',
          amountNotify: '30',
          allowBindplatemaxnum: '3',
          weighingValidTimeOnline: '30',
          waitingPayTime: '30',
          ifcareblance: '1',
          ifblancealarm: '1',
          alarmblance: '',
          weighIfSpoonWeight: '2',
          tempDishesPriceUnit: '1',
          ifOffLinePay: '是',
          offlineCheckBalance: '开启',
          weighingValidTime: '30',
          alarmTime: '15',
        };
        aedes.publish({
          cmd: 'publish',
          topic: `device/${sn}/menu`,
          payload: Buffer.from(JSON.stringify({ code: 0, msg: 'dishes_update', data: { dishes, deviceConfig } })),
          qos: 1,
          retain: true,
        }, () => {});
        pushedCount++;
      }
      console.log(`[MQTT-PUSH] 已推送菜品更新到 ${pushedCount} 个在线设备`);
      return { success: true, pushedCount };
    });

    // 只保留 getPort IPC
    ipcMain.handle('local-server:getPort', () => ({
      port: localServerInfo.port,
      httpPort: localServerInfo.port,
      mqttPort: localServerInfo.mqttPort,
    }));
    // 本地服务器状态查询（前端用于判断是否显示 MQTT 推送按钮）
    ipcMain.handle('local-server:status', () => ({
      running: true,
      httpPort: localServerInfo.port,
      mqttPort: localServerInfo.mqttPort,
      mqttRunning: (localServerInfo.mqttPort || 0) > 0,
    }));
    // 获取局域网 IP 地址（智能选择：优先物理网卡，跳过 Docker/虚拟接口）
    ipcMain.handle('local-server:getLanIp', () => {
      const nets = os.networkInterfaces();
      const candidates = [];
      for (const name of Object.keys(nets)) {
        const nameLower = name.toLowerCase();
        // 跳过虚拟/Docker/桥接接口
        const isVirtual =
          nameLower.startsWith('docker') ||
          nameLower.startsWith('veth') ||
          nameLower.startsWith('br-') ||
          nameLower.startsWith('vmnet') ||
          nameLower.startsWith('vboxnet') ||
          nameLower.includes('virtual') ||
          nameLower === 'lo' ||
          (nameLower.startsWith('v') && nameLower.includes('ethernet'));
        for (const net of nets[name]) {
          if ((net.family === 'IPv4' || net.family === 4) && !net.internal) {
            // 跳过链路本地地址 169.254.x.x
            if (net.address.startsWith('169.254.')) continue;
            // 跳过回环
            if (net.address === '127.0.0.1') continue;
            candidates.push({ name, address: net.address, isVirtual });
          }
        }
      }
      // 优先物理网卡
      const physical = candidates.find((c) => !c.isVirtual);
      if (physical) {
        console.log(`[getLanIp] 选中物理网卡: ${physical.name} → ${physical.address}`);
        return physical.address;
      }
      // 没有物理网卡，返回第一个可用（记录警告）
      if (candidates.length > 0) {
        console.warn(`[getLanIp] ⚠️ 无物理网卡，回退到虚拟接口: ${candidates[0].name} → ${candidates[0].address}`);
        return candidates[0].address;
      }
      console.warn('[getLanIp] ❌ 未找到任何局域网 IPv4 地址');
      return '';
    });
    // 端口配置 IPC
    ipcMain.handle('port-config:get', () => {
      return getPortConfig(app.getPath('userData'));
    });
    ipcMain.handle('port-config:set', (_event, config) => {
      const success = savePortConfig(app.getPath('userData'), config);
      return { success, config: getPortConfig(app.getPath('userData')) };
    });
  } catch (err) {
    console.error('[LocalServer] 启动失败!');
    console.error('[LocalServer] Error type:', typeof err, 'Error constructor:', err?.constructor?.name || 'N/A');
    console.error('[LocalServer] Error code:', err?.code ?? 'undefined', 'errno:', err?.errno ?? 'undefined');
    console.error('[LocalServer] Error message:', err?.message ?? String(err));
    console.error('[LocalServer] Error syscall:', err?.syscall ?? 'undefined');
    console.error('[LocalServer] Error stack:', err?.stack ?? 'no stack');
    // 尝试打印所有可枚举属性
    if (err && typeof err === 'object') {
      try {
        const keys = Object.keys(err).map(k => `${k}=${JSON.stringify(err[k])}`).join(', ');
        console.error('[LocalServer] Error properties:', keys || '(none)');
      } catch { /* ignore */ }
    }
    // 注册 fallback IPC
    ipcMain.handle('local-server:getPort', () => ({ port: 0, httpPort: 0, mqttPort: 0 }));
    ipcMain.handle('local-server:getLanIp', () => '');
    // MQTT 推送 fallback（本地服务器未启动时给前端友好错误提示）
    ipcMain.handle('mqtt:push-device-config', async () => ({ success: false, error: '本地推送服务未启动，请重启应用程序' }));
    ipcMain.handle('mqtt:push-dishes-update', async () => ({ success: false, error: '本地推送服务未启动，请重启应用程序' }));
    // 本地服务器状态查询 fallback（前端用于判断是否显示 MQTT 推送按钮）
    ipcMain.handle('local-server:status', () => ({ running: false, error: '本地服务器未启动' }));
  }

  // 纯大屏模式：只启动大屏窗口，不启动主窗口
  if (isDisplayMode || isDisplaySecondScreen) {
    console.log('[App] 大屏模式启动');
    // 解析 --display-screen=xxx 参数
    const screenArg = process.argv.find((a) => a.startsWith('--display-screen='));
    const screenId = screenArg ? screenArg.split('=')[1] : '';
    createDisplayWindow(screenId);
    return;
  }

  // 今日菜品竖屏模式：只启动 display3 全屏窗口
  if (isDisplay3Mode) {
    console.log('[App] 今日菜品竖屏模式启动');
    const indexPath = resolveIndexPath();
    const displayWin = new BrowserWindow({
      width: 1080,
      height: 1920,
      fullscreen: true,
      frame: false,
      alwaysOnTop: false,
      skipTaskbar: false,
      title: '食堂今日菜品',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
        additionalArguments: ['--display3-mode'],
      },
    });

    displayWin.loadFile(indexPath, { hash: '#/display3' });

    displayWin.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error('[Display3] Failed to load:', validatedURL, 'code:', errorCode, 'desc:', errorDescription);
    });

    displayWin.webContents.on('console-message', (_event, level, message) => {
      console.log(`[Display3:${level}] ${message}`);
    });

    displayWin.on('closed', () => {
      console.log('[Display3] 竖屏窗口已关闭');
    });

    displayWin.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        displayWin.setFullScreen(false);
      }
    });

    return;
  }

  // 正常模式：启动主窗口
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ─── 调试 IPC：让前端可以获取日志路径和触发 DevTools ──────────────────────
ipcMain.handle('debug:logPath', () => {
  return logFile || '(not set)';
});

ipcMain.handle('debug:devtools', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win && win.webContents) {
    console.log('[DevTools] IPC toggleDevTools requested');
    try {
      win.webContents.toggleDevTools();
      return { opened: win.webContents.isDevToolsOpened() };
    } catch (e) {
      return { error: e.message };
    }
  }
  return { error: 'no window' };
});

ipcMain.handle('debug:env', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    logFile,
    appPath: app.getAppPath(),
    userData: app.getPath('userData'),
    desktop: app.getPath('desktop'),
  };
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  // 清理所有 RTSP 流和 HLS 目录
  for (const [key, stream] of rtspStreams) {
    console.log(`[RTSP] 退出清理: ${key}`);
    try { stream.ffmpeg.kill('SIGKILL'); } catch { /* ignore */ }
    cleanHlsDir(stream.streamId);
  }
  rtspStreams.clear();
  if (hlsHttpServer) {
    try { hlsHttpServer.close(); } catch { /* ignore */ }
  }
  // 清理全局 HLS 根目录
  const hlsRoot = path.join(os.tmpdir(), 'canteen-hls');
  try {
    if (fs.existsSync(hlsRoot)) {
      const dirs = fs.readdirSync(hlsRoot);
      for (const d of dirs) {
        const dirPath = path.join(hlsRoot, d);
        const files = fs.readdirSync(dirPath);
        for (const f of files) fs.unlinkSync(path.join(dirPath, f));
        fs.rmdirSync(dirPath);
      }
      fs.rmdirSync(hlsRoot);
    }
  } catch (e) {
    console.warn('[HLS] 退出清理目录失败:', e.message);
  }
  // 关闭乐牛本地服务器
  if (localServerInfo.mqttServer) {
    try { localServerInfo.mqttServer.close(); } catch { /* ignore */ }
  }
  if (localServerInfo.deviceProxyServer) {
    try { localServerInfo.deviceProxyServer.close(); } catch { /* ignore */ }
  }
  if (localServerInfo.server) {
    try { localServerInfo.server.close(); } catch { /* ignore */ }
  }
  if (logStream) {
    logStream.write(`[${new Date().toISOString()}] [INIT] === App quitting ===\n`);
    logStream.end();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});