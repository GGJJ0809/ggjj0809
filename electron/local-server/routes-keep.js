import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { keepDeviceConfig, getKeepCredentials, saveKeepCredentials, getKeepTimeoutMs, getCurrentMealType, getMealNameByType,
         keepUserTokens, keepDeviceIdTokens, keepTokenExpiry, keepDeviceTokenExpiry, keepDeviceLogs,
         findKeepUserByToken, generateToken, saveKeepTokens, pushKeepLog, getKeepLogs, tokenMap } from './config-store.js';
import { updateDeviceStatus, safeFetch } from './utils.js';
import { fetchActiveProductItems, fetchTodayDishNutrition, buildMealListFromProducts, buildRecipeDateList, buildRecipeDateListFromDishNutrition } from './product-data.js';
import { resolveStationProductId } from './product-data.js';

export function createKeepRoutes(app, dbQuery, state, port, userDataPath, supabaseUrl, supabaseAnonKey, preferredMqttPort) {
  const mealMap = { 0: '早餐', 1: '午餐', 2: '晚餐' };
  const keepUploadDir = path.join(userDataPath || '/tmp', 'keep-uploads');
  if (!fs.existsSync(keepUploadDir)) fs.mkdirSync(keepUploadDir, { recursive: true });
  const keepMulterStorage = multer.memoryStorage();
  const fixMultipartContentType = (req, res, next) => { const ct = req.headers['content-type'] || ''; if (ct && !ct.startsWith('multipart/form-data') && (ct.includes('multipart') || ct.includes('form-data'))) { const bm = ct.match(/bound(a)?ry=([^;\\s]+)/i); if (bm) { req.headers['content-type'] = 'multipart/form-data; boundary=' + bm[2]; } else { req.headers['content-type'] = ct.replace(/^(application\/)?multipart\/form-data/i, 'multipart/form-data'); } } next(); };
  const parseMultipartAny = multer({ storage: keepMulterStorage, limits: { fileSize: 10 * 1024 * 1024 } }).any();
  const parseMultipartWithFix = [fixMultipartContentType, parseMultipartAny];

  function extractPicFromRequest(req) {
    if (req.files && req.files.length > 0) {
      const pf = req.files.find(f => f.buffer && f.buffer.length > 100);
      if (pf) { return 'data:' + (pf.mimetype || 'image/png') + ';base64,' + pf.buffer.toString('base64'); }
    }
    const b = req.body || {}; const q = req.query || {};
    return b.pic || q.pic || b.image || q.image || b.file || q.file || '';
  }

  function saveBase64ToFile(picData) {
    if (!picData || picData.length < 100) return picData || '';
    if (picData.startsWith('/keep-uploads/')) return picData;
    if (picData.startsWith('http://') || picData.startsWith('https://')) {
      const ki = picData.indexOf('/keep-uploads/');
      if (ki !== -1) return picData.slice(ki);
      return picData;
    }
    try {
      const uploadDir = path.join(userDataPath || '/tmp', 'keep-uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      let ext = 'png'; let bd = picData;
      if (picData.startsWith('data:image/jpeg') || picData.startsWith('data:image/jpg')) { ext = 'jpg'; bd = picData.replace(/^data:image\/(jpeg|jpg);base64,/, ''); }
      else if (picData.startsWith('data:image/png')) { bd = picData.replace(/^data:image\/png;base64,/, ''); }
      else if (picData.startsWith('data:image/webp')) { ext = 'webp'; bd = picData.replace(/^data:image\/webp;base64,/, ''); }
      const fn = 'keep_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      fs.writeFileSync(path.join(uploadDir, fn), bd, 'base64');
      return '/keep-uploads/' + fn;
    } catch (e) { return picData; }
  }

  async function keepWriteToSupabase(table, row) {
    if (dbQuery) {
      try {
        const cols = Object.keys(row).join(', ');
        const vals = Object.values(row);
        const sql = table === 'keep_door_records' ? `INSERT INTO ${table} (${cols}) VALUES (${vals.map(() => '?').join(',')})` : `INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${vals.map(() => '?').join(',')})`;
        dbQuery(sql, vals);
      } catch (e) { }
    }
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const baseUrl = supabaseUrl.replace(/\/+$/, '');
        const headers = { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
        const tp = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
        const fp = safeFetch(`${baseUrl}/rest/v1/${table}`, { method: 'POST', headers, body: JSON.stringify(row) });
        await Promise.race([fp, tp]);
      } catch (e) { }
    }
  }

  // ★ 兼容设备端把 token 放在名为 Token 的 header（而非 Authorization）的情况
  app.use((req, res, next) => {
    const rawToken = req.headers.token || req.headers['x-token'] || req.headers['access-token'];
    if (rawToken && !req.headers.authorization) {
      req.headers.authorization = 'Bearer ' + String(rawToken).trim();
    }
    next();
  });

  // ★ 统一补全接口文档要求的 message 字段（部分老接口只返回了 msg）
  app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (body && typeof body === 'object' && body.msg !== undefined && body.message === undefined) {
        body.message = body.msg;
      }
      return originalJson(body);
    };
    next();
  });

  // ═══ 设备登录 — /user/login ═══
  app.all('/user/login', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const loginName = b.loginName || q.loginName || b.appId || q.appId || '';
    const password = b.password || q.password || '';
    const deviceId = b.deviceId || q.deviceId || '';
    if (!loginName || !password) return res.json({ code: 0, msg: '账号或密码不能为空', result: null });
    const creds = getKeepCredentials(userDataPath);
    let loginOk = !!(creds[loginName] && creds[loginName] === password);
    let dbNick = ''; let dbAdmin = 0;
    if (!loginOk && dbQuery) {
      try { const du = dbQuery('SELECT id, login_name, password, nick_name, is_admin FROM keep_users WHERE login_name = ?', [loginName]); if (du && du.length > 0 && du[0].password === password) { loginOk = true; dbNick = du[0].nick_name || ''; dbAdmin = du[0].is_admin || 0; } } catch (e) { }
    }
    if (loginOk && dbQuery && !dbNick) {
      try { const du = dbQuery('SELECT nick_name, is_admin FROM keep_users WHERE login_name = ?', [loginName]); if (du && du.length > 0) { dbNick = du[0].nick_name || ''; dbAdmin = du[0].is_admin || 0; } } catch (e) { }
    }
    if (!loginOk) return res.json({ code: 0, msg: '账号或密码错误', result: null });
    const token = generateToken(); keepUserTokens.set(loginName, token);
    const exp = Date.now() + 8 * 3600 * 1000; keepTokenExpiry.set(loginName, exp);
    if (deviceId) { keepDeviceIdTokens.set(String(deviceId), token); keepDeviceTokenExpiry.set(String(deviceId), exp); }
    try { saveKeepTokens(); } catch (e) { }
    if (deviceId && dbQuery) {
      try {
        const now = new Date().toISOString();
        const md = dbQuery('SELECT id FROM keep_devices WHERE device_sn = ?', ['MS-LYG-40OEZJ']);
        if (md && md.length > 0) { dbQuery('UPDATE keep_devices SET status = ?, last_heartbeat = ?, updated_at = ? WHERE id = ?', ['online', now, now, md[0].id]); }
        else { const ex = dbQuery('SELECT id FROM keep_devices WHERE id = ? OR device_sn = ?', [deviceId, String(deviceId)]); if (ex && ex.length > 0) { dbQuery('UPDATE keep_devices SET device_sn = ?, model = ?, status = ?, last_heartbeat = ?, updated_at = ? WHERE id = ?', ['MS-LYG-40OEZJ', 'MS-LYG-40OEZJ', 'online', now, now, ex[0].id]); } else { dbQuery('INSERT INTO keep_devices (name, device_sn, model, status, cabinet_count, last_heartbeat, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', ['智能留样柜', 'MS-LYG-40OEZJ', 'MS-LYG-40OEZJ', 'online', 12, now, now, now]); } }
      } catch (e) { }
    }
    return res.json({ code: 1, msg: 'success', result: { token, userName: loginName, username: loginName, name: dbNick || loginName, nickName: dbNick || loginName, isAdmin: dbAdmin } });
  });

  // ═══ 用户增删改查（设备端）═══
  function handleUserSave(req, res) {
    const b = req.body || {}; const q = req.query || {};
    // ★ 解析 content 字段（设备端常把参数包在 JSON content 里）
    let contentParsed = {};
    const rawContent = b.content || q.content || '';
    if (rawContent && typeof rawContent === 'string') {
      try { contentParsed = JSON.parse(rawContent); } catch (e) { }
    }
    const merged = { ...contentParsed, ...b };
    const token = merged.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = merged.deviceId || q.deviceId || '';
    const deviceSn = merged.deviceSn || q.deviceSn || '';
    if (!findKeepUserByToken(token, deviceId)) return res.json({ code: 0, msg: '请先登录', result: null });
    // ★ 兼容设备端多种字段命名：loginName / login_name / userName / username / appId / app_id / name
    const nl = (merged.loginName || q.loginName || merged.login_name || q.login_name || merged.userName || q.userName || merged.username || q.username || merged.appId || q.appId || merged.app_id || q.app_id || merged.name || q.name || '').trim();
    if (!nl) {
      console.log('[Keep-UserSave] 登录名为空，收到的字段:', JSON.stringify({ bodyKeys: Object.keys(b), queryKeys: Object.keys(q), contentKeys: Object.keys(contentParsed), ct: req.headers['content-type'] || '' }));
      return res.json({ code: 0, msg: '登录名不能为空', result: null });
    }
    if (!dbQuery) return res.json({ code: 0, msg: '数据库未就绪', result: null });
    try {
      const dup = dbQuery('SELECT id FROM keep_users WHERE login_name = ?', [nl]);
      if (dup && dup.length > 0) return res.json({ code: 0, msg: `登录名「${nl}」已存在`, result: null });
      const pw = merged.password || q.password || '123456';
      const nn = merged.nickName || q.nickName || merged.nick_name || q.nick_name || merged.realName || q.realName || merged.name || q.name || '';
      const ia = parseInt(merged.isAdmin || q.isAdmin || merged.is_admin || q.is_admin || '0', 10);
      const pic = extractPicFromRequest(req);
      const pos = merged.position || q.position || merged.title || q.title || '';
      const num = merged.num || q.num || merged.workNo || q.workNo || merged.employeeNo || q.employeeNo || merged.code || q.code || '';
      const ft = merged.faceToken || q.faceToken || merged.face_token || q.face_token || '';
      const now = new Date().toISOString();
      const savedUrl = pic ? saveBase64ToFile(pic) : '';
      dbQuery('INSERT INTO keep_users (login_name, password, nick_name, is_admin, image, position, num, face_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [nl, String(pw).trim(), String(nn).trim(), ia ? 1 : 0, savedUrl || String(pic).trim(), String(pos).trim(), String(num).trim(), String(ft).trim(), now, now]);
      const sr = dbQuery('SELECT id FROM keep_users WHERE login_name = ?', [nl]);
      pushKeepLog(deviceSn, '设备端添加人员', `loginName:${nl}, id:${sr?.[0]?.id || ''}`);
      return res.json({ code: 1, msg: 'success', result: { id: sr?.[0]?.id || '' } });
    } catch (e) { return res.json({ code: 0, msg: e.message, result: null }); }
  }
  app.all('/user/save', parseMultipartWithFix, handleUserSave);
  app.all('/user/add', parseMultipartWithFix, handleUserSave);

  function handleUserList(req, res) {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    if (!findKeepUserByToken(token, b.deviceId || q.deviceId || '')) return res.json({ code: 0, message: '请先登录', result: { list: [], total: 0 } });
    if (!dbQuery) return res.json({ code: 0, msg: '数据库未就绪', result: { list: [], total: 0 } });
    try {
      const kw = (b.loginName || q.loginName || b.keyword || q.keyword || '').trim();
      const cp = Math.max(1, parseInt(b.currentPage || q.currentPage || b.page || q.page || '1', 10) || 1);
      const ps = Math.max(1, parseInt(b.pageSize || q.pageSize || b.limit || q.limit || '10', 10) || 10);
      let rows; let cnt;
      if (kw) {
        const p = `%${kw}%`;
        rows = dbQuery('SELECT id, login_name, nick_name, is_admin, image, position, num, face_token, created_at, updated_at FROM keep_users WHERE login_name LIKE ? OR nick_name LIKE ? OR position LIKE ? OR num LIKE ? ORDER BY id', [p, p, p, p]);
        cnt = dbQuery('SELECT COUNT(*) as cnt FROM keep_users WHERE login_name LIKE ? OR nick_name LIKE ? OR position LIKE ? OR num LIKE ?', [p, p, p, p]);
      } else {
        rows = dbQuery('SELECT id, login_name, nick_name, is_admin, image, position, num, face_token, created_at, updated_at FROM keep_users ORDER BY id', []);
        cnt = dbQuery('SELECT COUNT(*) as cnt FROM keep_users', []);
      }
      const total = cnt?.[0]?.cnt || (rows || []).length;
      const list = (rows || []).map(r => ({ id: r.id, loginName: r.login_name, login_name: r.login_name, nickName: r.nick_name, nick_name: r.nick_name, isAdmin: r.is_admin, is_admin: r.is_admin, name: r.nick_name || r.login_name, userName: r.login_name, userId: r.id, image: r.image || '', position: r.position || '', num: r.num || '', faceToken: r.face_token || '', face_token: r.face_token || '', created_at: r.created_at || '', updated_at: r.updated_at || '' }));
      const si = (cp - 1) * ps;
      return res.json({ code: 1, msg: 'success', message: 'success', result: { list: list.slice(si, si + ps), total } });
    } catch (e) { return res.json({ code: 0, msg: e.message, result: { list: [], total: 0 } }); }
  }
  app.all('/user/list', parseMultipartWithFix, handleUserList);
  app.all('/user/query_list', parseMultipartWithFix, handleUserList);

  app.all('/user/update', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || '';
    const uid = b.id || q.id || b.uid || q.uid || '';
    if (!findKeepUserByToken(token, deviceId)) return res.json({ code: 0, msg: '请先登录', result: null });
    if (!uid || !dbQuery) return res.json({ code: 0, msg: !uid ? '缺少用户id' : '数据库未就绪', result: null });
    try {
      const ex = dbQuery('SELECT id, login_name FROM keep_users WHERE id = ?', [uid]);
      if (!ex || ex.length === 0) return res.json({ code: 0, msg: '用户不存在', result: null });
      const oln = ex[0].login_name;
      const fields = ['updated_at = ?']; const vals = [new Date().toISOString()];
      const nlu = b.loginName || q.loginName || b.userName || q.userName || b.username || q.username || '';
      if (nlu && nlu.trim() && nlu.trim() !== oln) {
        const dup = dbQuery('SELECT id FROM keep_users WHERE login_name = ?', [nlu.trim()]);
        if (dup && dup.length > 0) return res.json({ code: 0, msg: `登录名「${nlu.trim()}」已存在`, result: null });
        fields.push('login_name = ?'); vals.push(nlu.trim());
      }
      if (b.password !== undefined || q.password !== undefined) { fields.push('password = ?'); vals.push(String(b.password || q.password || '').trim()); }
      const nnv = b.nickName || q.nickName || b.nick_name || q.nick_name || '';
      if (nnv !== undefined && nnv !== '') { fields.push('nick_name = ?'); vals.push(String(nnv).trim()); }
      if (b.isAdmin !== undefined || q.isAdmin !== undefined) { fields.push('is_admin = ?'); vals.push(parseInt(b.isAdmin || q.isAdmin || '0', 10) ? 1 : 0); }
      if (b.position !== undefined || q.position !== undefined) { fields.push('position = ?'); vals.push(String(b.position || q.position || '').trim()); }
      const numv = b.num || q.num || b.workNo || q.workNo || '';
      if (numv !== undefined && numv !== '') { fields.push('num = ?'); vals.push(String(numv).trim()); }
      if (b.image !== undefined || q.image !== undefined) { fields.push('image = ?'); vals.push(String(b.image || q.image || '').trim()); }
      dbQuery(`UPDATE keep_users SET ${fields.join(', ')} WHERE id = ?`, [...vals, uid]);
      return res.json({ code: 1, msg: 'success', result: null });
    } catch (e) { return res.json({ code: 0, msg: e.message, result: null }); }
  });

  app.all('/user/delete', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || '';
    const uid = b.id || q.id || b.uid || q.uid || '';
    if (!findKeepUserByToken(token, deviceId)) return res.json({ code: 0, msg: '请先登录', result: null });
    if (!uid || !dbQuery) return res.json({ code: 0, msg: !uid ? '缺少用户id' : '数据库未就绪', result: null });
    try {
      const ex = dbQuery('SELECT id, login_name FROM keep_users WHERE id = ?', [uid]);
      if (!ex || ex.length === 0) return res.json({ code: 0, msg: '用户不存在', result: null });
      dbQuery('DELETE FROM keep_users WHERE id = ?', [uid]);
      return res.json({ code: 1, msg: 'success', result: null });
    } catch (e) { return res.json({ code: 0, msg: e.message, result: null }); }
  });

  app.all('/user/upload_token', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    // ★ 解析 content 字段
    let contentParsed = {};
    const rawContent = b.content || q.content || '';
    if (rawContent && typeof rawContent === 'string') {
      try { contentParsed = JSON.parse(rawContent); } catch (e) { }
    }
    const merged = { ...contentParsed, ...b };
    const token = merged.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = merged.deviceId || q.deviceId || '';
    const deviceSn = merged.deviceSn || q.deviceSn || '';
    if (!findKeepUserByToken(token, deviceId)) return res.json({ code: 0, msg: '请先登录', result: null });
    if (!dbQuery) return res.json({ code: 0, msg: '数据库未就绪', result: null });

    // ★ 人脸 token：兼容 body/query 字段，以及设备把它当文件字段上传的情况
    let ft = String(merged.faceToken || q.faceToken || merged.face_token || q.face_token || merged.faceData || q.faceData || '').trim();
    if (!ft && req.files && req.files.length > 0) {
      const ff = req.files.find(f => /face|token/i.test(f.fieldname || '') && f.buffer && f.buffer.length > 0);
      if (ff) ft = String(ff.buffer.toString('utf-8')).trim();
    }
    const rawUid = merged.id || q.id || merged.userId || q.userId || merged.uid || q.uid || '';
    const uid = (rawUid === '' || rawUid === null || rawUid === undefined) ? '' : String(rawUid).trim();
    const nl = (merged.loginName || q.loginName || merged.login_name || q.login_name || merged.userName || q.userName || merged.username || q.username || merged.appId || q.appId || merged.app_id || q.app_id || merged.name || q.name || '').trim();
    console.log('[Keep-UploadToken] ft长度=' + ft.length + ', uid=' + uid + ', loginName=' + nl + ', bodyKeys=' + JSON.stringify(Object.keys(b)));

    // ── 操作一：上传人脸 token（faceToken 必填，目标用户靠 id/loginName 定位）──
    if (ft) {
      let target = null;
      try {
        if (uid && /^\d+$/.test(uid)) {
          target = dbQuery('SELECT id, login_name FROM keep_users WHERE id = ?', [uid]);
        }
        if ((!target || target.length === 0) && uid) {
          // 设备可能把 loginName 直接当 id 传（非数字），或数字 id 对不上，回退用 login_name 查
          const cand = /^\d+$/.test(uid) ? nl : uid;
          if (cand) target = dbQuery('SELECT id, login_name FROM keep_users WHERE login_name = ?', [cand]);
        }
        if ((!target || target.length === 0) && nl) {
          target = dbQuery('SELECT id, login_name FROM keep_users WHERE login_name = ?', [nl]);
        }
      } catch (e) { target = null; }

      if (target && target.length > 0) {
        const tid = target[0].id;
        try {
          dbQuery('UPDATE keep_users SET face_token = ?, updated_at = ? WHERE id = ?', [ft, new Date().toISOString(), tid]);
          console.log('[Keep-UploadToken] 人脸token已关联: id=' + tid + ', login_name=' + (target[0].login_name || ''));
          return res.json({ code: 1, msg: 'success', result: { id: tid, loginName: target[0].login_name || nl } });
        } catch (e) { return res.json({ code: 0, msg: e.message, result: null }); }
      }

      // 有 faceToken，但既没有 id 也没有 loginName，且查不到用户 → 明确报错，而不是「登录名不能为空」
      if (!nl) {
        console.log('[Keep-UploadToken] 人脸token上传失败：未提供 id/loginName，且无对应用户');
        return res.json({ code: 0, msg: '未找到对应用户，请先录入人员信息', result: null });
      }
      // 有 faceToken + loginName 但用户不存在 → 落到下方「新建用户」分支（组合式录入）
    }

    // ── 操作二：新建用户（无 faceToken，或 faceToken + loginName 的组合式录入）──
    if (!nl) {
      console.log('[Keep-UploadToken] 登录名为空，收到的字段:', JSON.stringify({ bodyKeys: Object.keys(b), queryKeys: Object.keys(q), ct: req.headers['content-type'] || '' }));
      return res.json({ code: 0, msg: '登录名不能为空', result: null });
    }
    try {
      const dup = dbQuery('SELECT id FROM keep_users WHERE login_name = ?', [nl]);
      if (dup && dup.length > 0) {
        // ★ 幂等处理：用户已存在时不再报「已存在」，避免设备重试被误判为失败；有 faceToken 则顺带补绑
        const dupId = dup[0].id;
        if (ft) {
          dbQuery('UPDATE keep_users SET face_token = ?, updated_at = ? WHERE id = ?', [ft, new Date().toISOString(), dupId]);
          console.log('[Keep-UploadToken] 用户已存在，已补绑人脸token id=' + dupId);
        }
        return res.json({ code: 1, msg: 'success', result: { id: dupId, loginName: nl, existed: true } });
      }
      const pw = merged.password || q.password || '123456';
      const nn = merged.nickName || q.nickName || merged.nick_name || q.nick_name || merged.realName || q.realName || merged.name || q.name || '';
      const ia = parseInt(merged.isAdmin || q.isAdmin || merged.is_admin || q.is_admin || '0', 10);
      const pic = extractPicFromRequest(req); const savedUrl = pic ? saveBase64ToFile(pic) : '';
      const pos = merged.position || q.position || merged.title || q.title || '';
      const num = merged.num || q.num || merged.workNo || q.workNo || '';
      const now = new Date().toISOString();
      dbQuery('INSERT INTO keep_users (login_name, password, nick_name, is_admin, image, position, num, face_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [nl, String(pw).trim(), String(nn).trim(), ia ? 1 : 0, savedUrl || '', String(pos).trim(), String(num).trim(), ft, now, now]);
      const sr = dbQuery('SELECT id FROM keep_users WHERE login_name = ?', [nl]);
      pushKeepLog(deviceSn, '设备端添加人员', `loginName:${nl}, id:${sr?.[0]?.id || ''}, faceToken:${ft ? '已采集' : '未采集'}`);
      console.log('[Keep-UploadToken] 新建用户成功 loginName=' + nl + ', id=' + (sr?.[0]?.id || '') + ', faceToken=' + (ft ? '已写入' : '空'));
      return res.json({ code: 1, msg: 'success', result: { id: sr?.[0]?.id || '', loginName: nl } });
    } catch (e) { return res.json({ code: 0, msg: e.message, result: null }); }
  });

  // ═══ 登录名查重（供设备端录入前实时校验）═══
  app.all('/user/check_exists', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    let contentParsed = {};
    const rawContent = b.content || q.content || '';
    if (rawContent && typeof rawContent === 'string') { try { contentParsed = JSON.parse(rawContent); } catch (e) { } }
    const merged = { ...contentParsed, ...b };
    const token = merged.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    if (!findKeepUserByToken(token, merged.deviceId || q.deviceId || '')) return res.json({ code: 0, msg: '请先登录', result: null });
    const loginName = (merged.loginName || q.loginName || merged.login_name || q.login_name || merged.userName || q.userName || merged.username || q.username || '').trim();
    if (!loginName) return res.json({ code: 0, msg: '参数错误', result: null });
    if (!dbQuery) return res.json({ code: 0, msg: '数据库未就绪', result: null });
    let exists = false; let userId = '';
    try {
      const ex = dbQuery('SELECT id FROM keep_users WHERE login_name = ?', [loginName]);
      if (ex && ex.length > 0) { exists = true; userId = String(ex[0].id); }
    } catch (e) { }
    return res.json({ code: 1, msg: 'success', exists, id: userId, result: { exists, id: userId } });
  });

  // ═══ 按登录名查询用户（供设备端用 loginName 反查 id）═══
  app.all('/user/get_by_name', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    let contentParsed = {};
    const rawContent = b.content || q.content || '';
    if (rawContent && typeof rawContent === 'string') { try { contentParsed = JSON.parse(rawContent); } catch (e) { } }
    const merged = { ...contentParsed, ...b };
    const token = merged.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    if (!findKeepUserByToken(token, merged.deviceId || q.deviceId || '')) return res.json({ code: 0, msg: '请先登录', result: null });
    const loginName = (merged.loginName || q.loginName || merged.login_name || q.login_name || merged.userName || q.userName || merged.username || q.username || '').trim();
    if (!loginName) return res.json({ code: 0, msg: '参数错误', result: null });
    if (!dbQuery) return res.json({ code: 0, msg: '数据库未就绪', result: null });
    try {
      const ex = dbQuery('SELECT id, login_name, nick_name, is_admin FROM keep_users WHERE login_name = ?', [loginName]);
      if (!ex || ex.length === 0) return res.json({ code: 0, msg: '用户不存在', result: null });
      const u = ex[0];
      return res.json({ code: 1, msg: 'success', result: { id: u.id, loginName: u.login_name, nickName: u.nick_name || u.login_name, isAdmin: u.is_admin || 0 } });
    } catch (e) { return res.json({ code: 0, msg: e.message, result: null }); }
  });

  app.all('/user/face_login', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    // ★ 解析 content 字段（设备端常把参数包在 JSON content 里）
    let contentParsed = {};
    const rawContent = b.content || q.content || '';
    if (rawContent && typeof rawContent === 'string') {
      try { contentParsed = JSON.parse(rawContent); } catch (e) { }
    }
    const merged = { ...contentParsed, ...b };
    // ★ 触发设备端所有可能的 face_token 字段名
    const ft = (merged.faceToken || merged.face_token || merged.FaceToken || merged.faceTokenStr || merged.face_token_str || merged.token || merged.faceData || merged.face_data || q.faceToken || q.face_token || '').trim();
    const deviceId = merged.deviceId || q.deviceId || '';
    console.log('[Keep-FaceLogin] 收到请求, face_token长度=' + ft.length + ', deviceId=' + deviceId);
    console.log('[Keep-FaceLogin] body字段:', JSON.stringify(Object.keys(b)));
    console.log('[Keep-FaceLogin] query字段:', JSON.stringify(Object.keys(q)));
    if (rawContent) console.log('[Keep-FaceLogin] content已解析, 字段:', JSON.stringify(Object.keys(contentParsed)));
    if (!ft || !dbQuery) {
      console.log('[Keep-FaceLogin] 失败: ft=' + !!ft + ' dbQuery=' + !!dbQuery);
      return res.json({ code: 0, msg: !ft ? '人脸token不能为空' : '数据库未就绪', result: null });
    }
    console.log('[Keep-FaceLogin] 查找 face_token，长度=' + ft.length + '，前20字符=' + ft.slice(0, 20) + '...');
    try {
      // ★ 先用 TRIM 匹配，兼容存储时的空格差异
      let rows = dbQuery('SELECT id, login_name, nick_name, is_admin, face_token FROM keep_users WHERE TRIM(face_token) = ?', [ft]);
      if (!rows || rows.length === 0) {
        // 兜底：遍历全表做 JavaScript 精确对比
        const all = dbQuery('SELECT id, login_name, nick_name, is_admin, face_token FROM keep_users WHERE face_token IS NOT NULL AND face_token != ?', ['']);
        console.log('[Keep-FaceLogin] 精确匹配未命中，遍历 ' + (all?.length || 0) + ' 条有token的用户...');
        let matched = null;
        for (const u of (all || [])) {
          const storedToken = (u.face_token || '').trim();
          if (storedToken && storedToken === ft) { matched = u; break; }
          // 如果 token 超过 100 字符，也尝试前缀匹配（某些设备会截断）
          if (storedToken && ft.length >= 50 && storedToken.length >= 50 && storedToken.slice(0, 100) === ft.slice(0, 100)) {
            console.log('[Keep-FaceLogin] 前缀匹配命中（前100字符一致）: login_name=' + u.login_name);
            matched = u; break;
          }
        }
        if (!matched) {
          console.log('[Keep-FaceLogin] 未找到匹配，DB中token数=' + (all?.length || 0) + '，请求token前50字符=' + ft.slice(0, 50));
          return res.json({ code: 0, msg: '人脸识别失败', result: null });
        }
        rows = [matched];
      } else {
        console.log('[Keep-FaceLogin] SQL TRIM匹配命中: login_name=' + rows[0].login_name);
      }
      const user = rows[0];
      const token = generateToken(); keepUserTokens.set(user.login_name, token);
      const exp = Date.now() + 8 * 3600 * 1000; keepTokenExpiry.set(user.login_name, exp);
      if (deviceId) { keepDeviceIdTokens.set(String(deviceId), token); keepDeviceTokenExpiry.set(String(deviceId), exp); }
      try { saveKeepTokens(); } catch (e) { }
      return res.json({ code: 1, msg: 'success', result: { nickName: user.nick_name || user.login_name, isAdmin: user.is_admin || 0, token } });
    } catch (e) { console.error('[Keep-FaceLogin] 异常:', e.message); return res.json({ code: 0, msg: e.message, result: null }); }
  });

  function handleDeletePic(req, res) {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || '';
    const uid = b.id || b.userId || q.id || q.userId || '';
    const rid = b.recordId || b.cookId || q.recordId || q.cookId || '';
    if (!findKeepUserByToken(token, deviceId)) return res.json({ code: 0, msg: '请先登录', result: null });
    if (uid && dbQuery) { try { dbQuery('UPDATE keep_users SET image = ?, updated_at = ? WHERE id = ?', ['', new Date().toISOString(), uid]); } catch (e) { } }
    if (rid && dbQuery) { try { dbQuery('UPDATE sample_records SET photo_url = ?, updated_at = ? WHERE device_record_id = ? OR CAST(id AS TEXT) = ?', ['', new Date().toISOString(), String(rid), String(rid)]); } catch (e) { } }
    return res.json({ code: 1, msg: 'success', result: null });
  }
  app.all('/cook/delete_pic', parseMultipartWithFix, handleDeletePic);
  app.all('/cook/del_pic', parseMultipartWithFix, handleDeletePic);
  app.all('/user/delete_pic', parseMultipartWithFix, handleDeletePic);
  app.all('/user/del_pic', parseMultipartWithFix, handleDeletePic);
  app.all('/common/delete_file', parseMultipartWithFix, handleDeletePic);
  app.all('/common/del_file', parseMultipartWithFix, handleDeletePic);
  app.all('/common/delete_img', parseMultipartWithFix, handleDeletePic);
  app.all('/common/del_img', parseMultipartWithFix, handleDeletePic);
  app.all('/keep/delete_pic', parseMultipartWithFix, handleDeletePic);
  app.all('/keep/del_pic', parseMultipartWithFix, handleDeletePic);

  // ═══ 留样操作：keep_b, finish_keep, take_keep, upload_pic, remote_data, import_base ═══
  app.all('/cook/keep_b', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || ''; const deviceSn = b.deviceSn || q.deviceSn || '';
    const cookId = b.cookId || q.cookId || b.id || q.id || '';
    let cookName = b.cookName || q.cookName || ''; if (!cookName && cookId && isNaN(Number(cookId))) cookName = cookId;
    if (!cookName && cookId && !isNaN(Number(cookId)) && dbQuery) { try { const nr = dbQuery('SELECT dish_name FROM dish_nutrition WHERE id = ? LIMIT 1', [Number(cookId)]); if (nr && nr.length > 0) cookName = nr[0].dish_name; else { const pr = dbQuery('SELECT name FROM product_items WHERE id = ? LIMIT 1', [Number(cookId)]); if (pr && pr.length > 0) cookName = pr[0].name; } } catch (e) { } }
    const mt = b.mealTimes ?? q.mealTimes ?? getCurrentMealType();
    const autoNum = { 0: '1', 1: '2', 2: '3' }[mt] || '2';
    const num = (b.num != null && b.num !== '') ? String(b.num) : autoNum;
    const loginName = findKeepUserByToken(token, deviceId);
    if (!loginName) return res.json({ code: 0, msg: '请先登录', result: null });
    const meal = mealMap[mt] || '午餐';
    const weight = b.weight ?? q.weight ?? 0;
    const pic = extractPicFromRequest(req); const savedUrl = saveBase64ToFile(pic);
    let cabinetId = deviceSn || 'MS-LYG-40OEZJ';
    if (!cabinetId && deviceId && dbQuery) { try { const dr = dbQuery('SELECT device_sn FROM keep_devices WHERE id = ? OR device_sn = ?', [deviceId, String(deviceId)]); if (dr && dr.length > 0) cabinetId = dr[0].device_sn; } catch (e) { } }
    const now = new Date(); const sampledAt = now.toISOString(); const expireAt = new Date(now.getTime() + getKeepTimeoutMs()).toISOString();
    // 检查已有记录
    if (dbQuery && cookName) {
      const d = new Date(Date.now() + 8 * 3600 * 1000); const ts = d.toISOString().slice(0, 10);
      const us = new Date(ts + 'T00:00:00+08:00').toISOString(); const ue = new Date(ts + 'T23:59:59+08:00').toISOString();
      const er = dbQuery("SELECT id, slot, photo_url FROM sample_records WHERE cabinet_id = ? AND dish = ? AND sampled_at >= ? AND sampled_at <= ? AND status = 'stored' ORDER BY sampled_at DESC LIMIT 1", [cabinetId, cookName, us, ue]);
      if (er && er.length > 0) {
        const uf = ['weight = ?', 'updated_at = ?', 'operator = ?', 'meal = ?', 'dish = ?'];
        const uv = [Number(weight) || 0, new Date().toISOString(), loginName, meal, cookName];
        if (savedUrl) { uf.push('photo_url = ?'); uv.push(savedUrl); }
        if (num) { uf.push('slot = ?'); uv.push(String(num)); }
        uf.push("status = 'stored'");
        dbQuery(`UPDATE sample_records SET ${uf.join(', ')} WHERE id = ?`, [...uv, er[0].id]);
        return res.json({ code: 1, msg: 'success', result: { id: String(cookId || ''), pic: savedUrl || '', num: String(num || ''), cookName } });
      }
    }
    const row = { record_no: `KEEP${Date.now()}`, meal, dish: cookName || '未知菜品', weight: Number(weight) || 0, cabinet_id: cabinetId, slot: String(num), sampled_at: sampledAt, expire_at: expireAt, status: 'stored', operator: loginName, notes: '', device_record_id: String(cookId || Date.now()), photo_url: savedUrl || '' };
    keepWriteToSupabase('sample_records', row);
    return res.json({ code: 1, msg: 'success', result: { id: String(cookId || ''), pic: savedUrl || '', num: String(num || ''), cookName: cookName || '' } });
  });

  app.all('/cook/finish_keep', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || ''; const deviceSn = b.deviceSn || q.deviceSn || '';
    const loginName = findKeepUserByToken(token, deviceId);
    if (!loginName) return res.json({ code: 0, msg: '请先登录', result: null });
    let listArr = [];
    const rawList = b.list || q.list || '';
    if (rawList) { try { listArr = typeof rawList === 'string' ? JSON.parse(rawList) : rawList; if (!Array.isArray(listArr)) listArr = [listArr]; } catch (e) { } }
    if (listArr.length === 0) {
      const topCookId = b.cookId || q.cookId || b.id || q.id || '';
      if (topCookId) listArr = [{ id: topCookId, weight: b.weight ?? q.weight ?? 0, num: b.num ?? q.num, pic: extractPicFromRequest(req), mealTimes: b.mealTimes ?? q.mealTimes ?? 1 }];
    }
    let cabinetId = deviceSn || 'MS-LYG-40OEZJ';
    const results = [];
    if (dbQuery && listArr.length > 0) {
      for (const item of listArr) {
        const itemCookId = item.id || item.cookId || '';
        let itemCookName = item.cookName || b.cookName || q.cookName || '';
        if (!itemCookName && itemCookId && isNaN(Number(itemCookId))) itemCookName = itemCookId;
        const itemNum = (item.num != null && item.num !== '') ? String(item.num) : { 0: '1', 1: '2', 2: '3' }[item.mealTimes ?? 1] || '2';
        try {
          const saved = saveBase64ToFile(item.pic || '');
          const uf = ['weight = ?', 'updated_at = ?']; const uv = [Number(item.weight) || 0, new Date().toISOString()];
          if (saved) { uf.push('photo_url = ?'); uv.push(saved); }
          if (itemCookName) { uf.push('dish = ?'); uv.push(itemCookName); }
          let ex = null;
          if (itemNum) ex = dbQuery("SELECT id, slot FROM sample_records WHERE cabinet_id = ? AND slot = ? AND status = 'stored' ORDER BY sampled_at DESC LIMIT 1", [cabinetId, String(itemNum)]);
          if ((!ex || ex.length === 0) && itemCookId) ex = dbQuery("SELECT id, slot FROM sample_records WHERE device_record_id = ? AND status = 'stored' ORDER BY sampled_at DESC LIMIT 1", [String(itemCookId)]);
          if (ex && ex.length > 0) {
            if (itemNum && (!ex[0].slot || ex[0].slot === '')) { uf.push('slot = ?'); uv.push(String(itemNum)); }
            dbQuery(`UPDATE sample_records SET ${uf.join(', ')} WHERE id = ?`, [...uv, ex[0].id]);
          }
        } catch (e) { }
      }
    }
    return res.json({ code: 1, msg: 'success', message: 'success', result: results.length > 0 ? results : null });
  });

  app.all('/cook/take_keep', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || ''; const deviceSn = b.deviceSn || q.deviceSn || '';
    const loginName = findKeepUserByToken(token, deviceId);
    if (!loginName) return res.json({ code: 0, msg: '请先登录', result: null });
    const cookId = b.cookId || q.cookId || b.id || q.id || '';
    let cookName = b.cookName || q.cookName || b.dishName || q.dishName || '';
    if (!cookName && cookId && isNaN(Number(cookId))) cookName = cookId;
    const pic = extractPicFromRequest(req); const savedUrl = saveBase64ToFile(pic);
    const num = b.num ?? q.num ?? b.stallId ?? q.stallId ?? undefined;
    let cabinetId = deviceSn || 'MS-LYG-40OEZJ';
    if (dbQuery && num != null) {
      try {
        const now = new Date(); const sampledAt = now.toISOString(); const expireAt = new Date(now.getTime() + getKeepTimeoutMs()).toISOString();
        let ex = null;
        if (cookId) ex = dbQuery("SELECT id, slot FROM sample_records WHERE (device_record_id = ? OR CAST(id AS TEXT) = ?) AND status = 'stored' ORDER BY sampled_at DESC LIMIT 1", [String(cookId), String(cookId)]);
        if ((!ex || ex.length === 0) && num !== '' && num !== undefined) ex = dbQuery("SELECT id, slot FROM sample_records WHERE cabinet_id = ? AND slot = ? AND status = 'stored' ORDER BY sampled_at DESC LIMIT 1", [cabinetId, String(num)]);
        if (ex && ex.length > 0) {
          const uf = ['updated_at = ?']; const uv = [new Date().toISOString()];
          if (savedUrl) { uf.push('photo_url = ?'); uv.push(savedUrl); }
          if (cookName) { uf.push('dish = ?'); uv.push(cookName); }
          if (num != null && (!ex[0].slot || ex[0].slot === '')) { uf.push('slot = ?'); uv.push(String(num)); }
          dbQuery(`UPDATE sample_records SET ${uf.join(', ')} WHERE id = ?`, [...uv, ex[0].id]);
        }
      } catch (e) { }
    }
    return res.json({ code: 1, msg: 'success', result: { id: String(cookId || ''), num: String(num || ''), pic: savedUrl || '', cookName: cookName || '' } });
  });

  async function handleCookUploadPic(req, res) {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || ''; const deviceSn = b.deviceSn || q.deviceSn || '';
    const loginName = findKeepUserByToken(token, deviceId);
    if (!loginName) return res.json({ code: 0, msg: '请先登录', result: null });
    const pic = extractPicFromRequest(req);
    if (!pic) return res.json({ code: 0, msg: '缺少图片数据', result: null });
    const savedUrl = saveBase64ToFile(pic);
    const cookId = b.cookId || q.cookId || b.id || q.id || '';
    let cookName = b.cookName || q.cookName || ''; if (!cookName && cookId && isNaN(Number(cookId))) cookName = cookId;
    let cabinetId = deviceSn || 'MS-LYG-40OEZJ';
    if (dbQuery) {
      try {
        let ex = null;
        const num = (b.num ?? q.num) ? String(b.num ?? q.num) : '';
        if (num) ex = dbQuery("SELECT id, slot FROM sample_records WHERE cabinet_id = ? AND slot = ? AND status = 'stored' ORDER BY sampled_at DESC LIMIT 1", [cabinetId, num]);
        if ((!ex || ex.length === 0) && cookId) ex = dbQuery("SELECT id, slot FROM sample_records WHERE (device_record_id = ? OR CAST(id AS TEXT) = ?) AND status = 'stored' ORDER BY sampled_at DESC LIMIT 1", [String(cookId), String(cookId)]);
        if (ex && ex.length > 0) {
          const uf = ['photo_url = ?', 'updated_at = ?']; const uv = [savedUrl, new Date().toISOString()];
          if (cookName) { uf.push('dish = ?'); uv.push(cookName); }
          if (num && (!ex[0].slot || ex[0].slot === '')) { uf.push('slot = ?'); uv.push(num); }
          dbQuery(`UPDATE sample_records SET ${uf.join(', ')} WHERE id = ?`, [...uv, ex[0].id]);
          return res.json({ code: 1, msg: 'success', result: { id: String(ex[0].id), pic: savedUrl } });
        }
        // 新建
        if (cookName || num) {
          const now = new Date(); const sampledAt = now.toISOString(); const expireAt = new Date(now.getTime() + getKeepTimeoutMs()).toISOString();
          const fs2 = (num && num !== '0') ? num : '2';
          const row = { record_no: `UP${Date.now()}`, meal: '午餐', dish: cookName || '未知菜品', weight: 0, cabinet_id: cabinetId, slot: fs2, sampled_at: sampledAt, expire_at: expireAt, status: 'stored', operator: loginName, device_record_id: String(cookId || Date.now()), photo_url: savedUrl || '' };
          keepWriteToSupabase('sample_records', row);
          return res.json({ code: 1, msg: 'success', result: { id: String(row.device_record_id), pic: savedUrl } });
        }
        return res.json({ code: 1, msg: 'success', result: { id: '' } });
      } catch (e) { return res.json({ code: 0, msg: '图片保存失败', result: null }); }
    }
    return res.json({ code: 1, msg: 'success', result: { id: '' } });
  }
  app.all('/cook/upload_pic', parseMultipartWithFix, handleCookUploadPic);
  app.all('/cook/pic_upload', parseMultipartWithFix, handleCookUploadPic);
  app.all('/keep/upload_pic', parseMultipartWithFix, handleCookUploadPic);

  app.all('/common/import_base', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || '';
    if (!findKeepUserByToken(token, deviceId)) return res.json({ code: 0, msg: '请先登录', result: null });
    const file = extractPicFromRequest(req);
    if (!file) return res.json({ code: 0, msg: '缺少文件', result: null });
    try {
      const uploadDir = path.join(userDataPath || '/tmp', 'keep-uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      let ext = 'png'; let bd = file;
      if (file.startsWith('data:image/jpeg') || file.startsWith('data:image/jpg')) { ext = 'jpg'; bd = file.replace(/^data:image\/(jpeg|jpg);base64,/, ''); }
      else if (file.startsWith('data:image/png')) { bd = file.replace(/^data:image\/png;base64,/, ''); }
      const fn = 'keep_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      fs.writeFileSync(path.join(uploadDir, fn), bd, 'base64');
      const host = req.headers.host || `127.0.0.1:${state.httpPort || port}`;
      return res.json({ code: 1, msg: 'success', result: `http://${host}/keep-uploads/${fn}` });
    } catch (e) { return res.json({ code: 1, msg: 'success', result: file }); }
  });

  app.all('/cook/remote_data', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || ''; const deviceSn = b.deviceSn || q.deviceSn || '';
    const loginName = findKeepUserByToken(token, deviceId);
    if (!loginName) return res.json({ code: 0, msg: '请先登录', result: null });
    const pic = extractPicFromRequest(req); const savedUrl = saveBase64ToFile(pic);
    const cookId = b.cookId || q.cookId || b.id || q.id || '';
    const num = b.num ?? q.num ?? b.stallId ?? q.stallId ?? undefined;
    let cookName = b.cookName || q.cookName || b.dishName || q.dishName || '';
    if (!cookName && cookId && isNaN(Number(cookId))) cookName = cookId;
    let cabinetId = deviceSn || 'MS-LYG-40OEZJ';
    if (cookName && num != null && dbQuery) {
      try {
        const now = new Date(); const sampledAt = now.toISOString(); const expireAt = new Date(now.getTime() + getKeepTimeoutMs()).toISOString();
        let ex = null;
        if (cookId) ex = dbQuery("SELECT id, slot FROM sample_records WHERE device_record_id = ? AND status = 'stored'", [String(cookId)]);
        if ((!ex || ex.length === 0) && num != null) ex = dbQuery("SELECT id, slot FROM sample_records WHERE cabinet_id = ? AND slot = ? AND status = 'stored'", [cabinetId, String(num)]);
        if (ex && ex.length > 0) {
          const uf = ['weight = ?', 'updated_at = ?']; const uv = [Number(b.weight || q.weight) || 0, new Date().toISOString()];
          if (savedUrl) { uf.push('photo_url = ?'); uv.push(savedUrl); }
          dbQuery(`UPDATE sample_records SET ${uf.join(', ')} WHERE id = ?`, [...uv, ex[0].id]);
        }
      } catch (e) { }
    }
    return res.json({ code: 1, msg: 'success', result: { id: String(cookId || ''), pic: savedUrl || '' } });
  });

  // ═══ 柜门相关 ═══
  app.all('/door/query_list', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || '';
    let deviceSn = b.deviceSn || q.deviceSn || b.device_sn || q.device_sn || '';
    if (!deviceSn && dbQuery) { try { const mr = dbQuery('SELECT device_sn FROM keep_devices WHERE model = ? OR device_sn = ? LIMIT 1', ['MS-LYG-40OEZJ', 'MS-LYG-40OEZJ']); if (mr && mr.length > 0) deviceSn = mr[0].device_sn; } catch (e) { } }
    if (!deviceSn) deviceSn = 'MS-LYG-40OEZJ';
    const loginName = findKeepUserByToken(token, deviceId);
    if (!loginName) return res.json({ code: 0, msg: '请先登录', message: '请先登录', result: null });
    const cp = Math.max(1, parseInt(b.page || b.currentPage || q.page || q.currentPage || '1', 10) || 1);
    const ps = Math.max(12, parseInt(b.limit || b.pageSize || q.limit || q.pageSize || '12', 10) || 12);
    let cabinetCount = 12;
    if (dbQuery) {
      try {
        const cr = dbQuery('SELECT cabinet_count FROM keep_devices WHERE device_sn = ?', [deviceSn]);
        if (cr && cr.length > 0 && cr[0].cabinet_count) cabinetCount = parseInt(cr[0].cabinet_count, 10) || 12;
      } catch (e) { }
    }
    const dNow = new Date(Date.now() + 8 * 3600 * 1000); const ts = dNow.toISOString().slice(0, 10);
    const us = new Date(ts + 'T00:00:00+08:00').toISOString(); const ue = new Date(ts + 'T23:59:59+08:00').toISOString();
    const assignedMap = {};
    if (dbQuery) {
      try {
        let storedRows = dbQuery("SELECT id, slot, dish, weight, status, operator, sampled_at, expire_at, photo_url, meal, device_record_id FROM sample_records WHERE cabinet_id = ? AND sampled_at >= ? AND sampled_at <= ? AND status = 'stored' ORDER BY sampled_at DESC", [deviceSn, us, ue]);
        if (!storedRows || storedRows.length === 0) storedRows = dbQuery("SELECT id, slot, dish, weight, status, operator, sampled_at, expire_at, photo_url, meal, device_record_id FROM sample_records WHERE sampled_at >= ? AND sampled_at <= ? AND status = 'stored' ORDER BY sampled_at DESC", [us, ue]);
        (storedRows || []).forEach(r => { const s = r.slot != null ? String(r.slot).trim() : ''; if (s && s !== '0') { if (!assignedMap[s]) assignedMap[s] = { records: [] }; assignedMap[s].records.push(r); } });
      } catch (e) { }
    }
    const list = [];
    for (let i = 1; i <= cabinetCount; i++) {
      const sn = String(i); const sd = assignedMap[sn];
      if (sd) {
        const pr = sd.records[0];
        let pu = pr.photo_url || '';
        if (pu && pu.startsWith('/keep-uploads/')) { const h = req.headers.host || `127.0.0.1:${state.httpPort || port}`; pu = `http://${h}${pu}`; }
        list.push({ id: String(pr.device_record_id || pr.id || ''), deviceId: deviceSn, num: sn, state: 1, cookName: sd.records.map(r => r.dish || '').filter(Boolean).join('/'), weight: sd.records.reduce((s, r) => s + (Number(r.weight) || 0), 0), operator: pr.operator || '', pic: pu, photoUrl: pu, picUrl: pu, mealTimes: pr.meal === '早餐' ? 0 : pr.meal === '晚餐' ? 2 : 1, gmtCook: new Date(pr.sampled_at).getTime(), gmtStart: new Date(pr.sampled_at).getTime(), gmtEnd: new Date(pr.expire_at).getTime(), gmtModify: Date.now(), gmtCreate: new Date(pr.sampled_at).getTime() });
      } else {
        list.push({ id: '', deviceId: deviceSn, num: sn, state: 0, cookName: '', weight: 0, operator: '', pic: '', photoUrl: '', picUrl: '', mealTimes: 1, gmtCook: 0, gmtStart: 0, gmtEnd: 0, gmtModify: 0, gmtCreate: 0 });
      }
    }
    const si = (cp - 1) * ps;
    return res.json({ code: 1, msg: 'success', message: 'success', result: { total: list.length, list: list.slice(si, si + ps) } });
  });

  app.all('/door/open_one', (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || '';
    const num = b.num ?? q.num ?? b.stallId ?? q.stallId ?? b.slot ?? q.slot ?? b.doorNum ?? q.doorNum ?? undefined;
    const loginName = findKeepUserByToken(token, deviceId);
    if (!loginName) return res.json({ code: 0, msg: '请先登录', message: '请先登录', result: null });
    if (num == null) return res.json({ code: 0, msg: '缺少柜门编号', message: '缺少柜门编号', result: null });
    const row = { device_sn: deviceId || '', door_num: String(num), event_type: 'open', reason: '正常开门', operator: loginName, dish_name: '', recorded_at: new Date().toISOString() };
    keepWriteToSupabase('keep_door_records', row);
    return res.json({ code: 1, msg: 'success', message: 'success', result: { num: String(num), deviceId: String(deviceId) } });
  });

  app.all('/door/opened_list', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || '';
    if (!findKeepUserByToken(token, deviceId)) return res.json({ code: 0, msg: '请先登录', message: '请先登录', result: null });
    const opened = [];
    if (dbQuery) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const us = new Date(today + 'T00:00:00+08:00').toISOString(); const ue = new Date(today + 'T23:59:59+08:00').toISOString();
        const openRows = dbQuery("SELECT door_num, recorded_at, event_type FROM keep_door_records WHERE (event_type = 'open' OR event_type = 'emergency') AND recorded_at >= ? AND recorded_at <= ? ORDER BY recorded_at DESC", [us, ue]);
        const closeRows = dbQuery("SELECT door_num, recorded_at FROM keep_door_records WHERE event_type = 'close' AND recorded_at >= ? AND recorded_at <= ? ORDER BY recorded_at DESC", [us, ue]);
        const cm = {}; (closeRows || []).forEach(r => { if (!cm[r.door_num]) cm[r.door_num] = r.recorded_at; });
        const dot = {};
        (openRows || []).forEach(r => { const dn = String(r.door_num); const ct = cm[dn]; if (!ct || new Date(ct).getTime() < new Date(r.recorded_at).getTime()) { if (!dot[dn]) dot[dn] = r.recorded_at; } });
        for (const [num, ot] of Object.entries(dot)) opened.push({ num, gmtOpen: new Date(ot).getTime() });
      } catch (e) { }
    }
    return res.json({ code: 1, msg: 'success', message: 'success', result: opened });
  });

  app.all('/door/close', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || '';
    const num = b.num ?? q.num ?? undefined;
    if (!findKeepUserByToken(token, deviceId)) return res.json({ code: 0, msg: '请先登录', message: '请先登录', result: null });
    if (num == null) return res.json({ code: 0, msg: '缺少柜门编号', message: '缺少柜门编号', result: null });
    const row = { device_sn: String(deviceId) || '', door_num: String(num), event_type: 'close', reason: '正常关门', operator: findKeepUserByToken(token, deviceId), dish_name: '', recorded_at: new Date().toISOString() };
    keepWriteToSupabase('keep_door_records', row);
    return res.json({ code: 1, msg: 'success', message: 'success', result: { num: String(num) } });
  });

  app.all('/door/is_keep', (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || '';
    if (!findKeepUserByToken(token, deviceId)) return res.json({ code: 0, msg: '请先登录', result: null });
    return res.json({ code: 1, msg: 'success', result: null });
  });

  app.all('/open_record/save', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || '';
    const num = b.num ?? q.num ?? undefined;
    if (!findKeepUserByToken(token, deviceId)) return res.json({ code: 0, msg: '请先登录', message: '请先登录', result: null });
    if (num == null) return res.json({ code: 0, msg: '缺少柜门编号', message: '缺少柜门编号', result: null });
    const row = { device_sn: String(deviceId) || '', door_num: String(num), event_type: 'open', reason: b.reason || q.reason || '正常开门', operator: b.operator || q.operator || findKeepUserByToken(token, deviceId), dish_name: '', recorded_at: new Date().toISOString() };
    keepWriteToSupabase('keep_door_records', row);
    return res.json({ code: 1, msg: 'success', message: 'success', result: { num: String(num) } });
  });

  // ═══ 留样查询 ═══
  app.all('/cook/query_list', async (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    const deviceId = b.deviceId || q.deviceId || '';
    if (!findKeepUserByToken(token, deviceId)) return res.json({ code: 0, msg: '请先登录', result: { total: 0, list: [] } });
    const cp = parseInt(b.currentPage || q.currentPage || '1', 10) || 1; const ps = parseInt(b.pageSize || q.pageSize || '33', 10) || 33;
    const kw = b.keyword || q.keyword || b.dishName || q.dishName || '';
    const rawGmt = b.gmtCook || q.gmtCook || '';
    let gmtCook = rawGmt;
    if (rawGmt && /^\d{10,}$/.test(String(rawGmt))) { gmtCook = new Date(Number(rawGmt) + 8 * 3600 * 1000).toISOString().slice(0, 10); }
    else if (!rawGmt) { gmtCook = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }
    // 搜索模式
    if (kw && kw.trim() && dbQuery) {
      try {
        const sp = `%${kw.trim()}%`;
        const cnt = dbQuery("SELECT COUNT(*) as cnt FROM sample_records WHERE dish LIKE ? AND status = 'stored'", [sp]);
        const rows = dbQuery("SELECT id, dish, weight, slot, operator, sampled_at, expire_at, photo_url, meal, device_record_id, record_no, status FROM sample_records WHERE dish LIKE ? AND status = 'stored' ORDER BY sampled_at DESC LIMIT ? OFFSET ?", [sp, ps, (cp - 1) * ps]);
        const list = (rows || []).map(r => {
          let pu = r.photo_url || ''; if (pu && pu.startsWith('/keep-uploads/')) { pu = 'http://' + (req.headers.host || `127.0.0.1:${state.httpPort || port}`) + pu; }
          return { id: String(r.device_record_id || r.id || ''), cookName: r.dish || '', cookCode: r.record_no || '', num: r.slot || '', weight: r.weight || 0, operator: r.operator || '', pic: pu, state: 1, mealTimes: r.meal === '早餐' ? 0 : r.meal === '晚餐' ? 2 : 1, gmtCook: new Date(r.sampled_at).getTime(), gmtKeep: new Date(r.sampled_at).getTime() };
        });
        return res.json({ code: 1, msg: 'success', result: { total: cnt?.[0]?.cnt || 0, list } });
      } catch (e) { return res.json({ code: 0, msg: e.message, result: { total: 0, list: [] } }); }
    }
    // 非搜索模式：返回今日菜单状态
    try {
      const keepMap = {};
      if (dbQuery) {
        try {
          const us = new Date(gmtCook + 'T00:00:00+08:00').toISOString(); const ue = new Date(gmtCook + 'T23:59:59+08:00').toISOString();
          const kr = dbQuery("SELECT * FROM sample_records WHERE sampled_at >= ? AND sampled_at <= ? ORDER BY sampled_at DESC", [us, ue]);
          (kr || []).forEach(r => { const k = r.dish || ''; if (k && !keepMap[k]) keepMap[k] = r; });
        } catch (e) { }
      }
      // 从 dish_nutrition 获取今日菜单
      let menuDishes = [];
      if (dbQuery) {
        try {
          const nr = dbQuery('SELECT dish_name, meal_type FROM dish_nutrition WHERE menu_date = ? ORDER BY id', [gmtCook]);
          const seen = new Set();
          menuDishes = (nr || []).filter(r => { if (!r.dish_name || seen.has(r.dish_name)) return false; seen.add(r.dish_name); return true; }).map(r => ({ cookName: r.dish_name, mealTimes: r.meal_type ?? 1 }));
        } catch (e) { }
      }
      if (menuDishes.length === 0 && Object.keys(keepMap).length > 0) {
        menuDishes = Object.values(keepMap).map(r => ({ cookName: r.dish, mealTimes: r.meal === '早餐' ? 0 : r.meal === '晚餐' ? 2 : 1 }));
      }
      const cabinetId = 'MS-LYG-40OEZJ';
      const fullList = menuDishes.map(md => {
        const record = keepMap[md.cookName];
        if (record) {
          let pu = record.photo_url || ''; if (pu && pu.startsWith('/keep-uploads/')) pu = 'http://' + (req.headers.host || `127.0.0.1:${state.httpPort || port}`) + pu;
          return { id: String(record.device_record_id || record.id || ''), deviceId: cabinetId, cookName: record.dish || md.cookName, cookCode: record.record_no || '', num: record.slot || '', operator: record.operator || '', pic: pu, weight: Number(record.weight) || 0, state: 1, mealTimes: md.mealTimes, gmtCook: new Date(record.sampled_at).getTime() };
        }
        return { id: md.cookName, deviceId: cabinetId, cookName: md.cookName, cookCode: '', num: '', operator: '', pic: '', weight: 0, state: 0, mealTimes: md.mealTimes ?? 1, gmtCook: new Date(gmtCook).getTime() };
      });
      const si2 = (cp - 1) * ps;
      return res.json({ code: 1, msg: 'success', message: 'success', result: { total: fullList.length, list: fullList.slice(si2, si2 + ps) } });
    } catch (err) { return res.status(500).json({ code: 0, msg: err.message, result: { list: [], total: 0 } }); }
  });

  // ═══ 食谱管理 ═══
  app.all('/meal/query_list', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = b.token || q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || '';
    if (!findKeepUserByToken(token, b.deviceId || q.deviceId || '')) return res.json({ code: 0, message: '请先登录', result: null });
    let gmtCook = b.gmtCook || q.gmtCook || '';
    if (gmtCook && /^\d{10,}$/.test(String(gmtCook))) { gmtCook = new Date(Number(gmtCook) + 8 * 3600 * 1000).toISOString().slice(0, 10); } else if (!gmtCook) { gmtCook = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }
    const mt = b.mealTimes ?? q.mealTimes ?? 0;
    let dishes = [];
    if (dbQuery) { try { dishes = (dbQuery('SELECT id, dish_name FROM dish_nutrition WHERE menu_date = ? AND meal_type = ? ORDER BY id', [gmtCook, mt]) || []).map(r => ({ id: String(r.id), cookName: r.dish_name })); } catch (e) { } }
    return res.json({ code: 1, message: 'success', result: { mealTimes: Number(mt), gmtCook, dishes } });
  });

  app.all('/meal/insert_list', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    if (!findKeepUserByToken(b.token || q.token || '', b.deviceId || q.deviceId || '')) return res.json({ code: 0, msg: '请先登录', result: null });
    let list = b.list || q.list || []; if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
    const ids = [];
    if (Array.isArray(list) && dbQuery) { for (const item of list) { const dn = item.cookName || item.name || ''; if (!dn) continue; const gmt = item.gmtCook || new Date().toISOString().slice(0, 10); const ex = dbQuery('SELECT id FROM dish_nutrition WHERE dish_name = ? AND menu_date = ?', [dn, gmt]); if (ex && ex.length > 0) ids.push(String(ex[0].id)); else { dbQuery('INSERT INTO dish_nutrition (dish_name, menu_date, meal_type, created_at, updated_at) VALUES (?, ?, ?, datetime("now"), datetime("now"))', [dn, gmt, item.mealTimes ?? 1]); const nr = dbQuery('SELECT id FROM dish_nutrition WHERE dish_name = ? AND menu_date = ? ORDER BY id DESC LIMIT 1', [dn, gmt]); if (nr && nr.length > 0) ids.push(String(nr[0].id)); } } }
    return res.json({ code: 1, msg: 'success', result: ids });
  });

  app.all('/meal/insert', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    if (!findKeepUserByToken(b.token || q.token || '', b.deviceId || q.deviceId || '')) return res.json({ code: 0, msg: '请先登录', result: null });
    const cn = b.cookName || q.cookName || b.name || q.name || '';
    if (!cn) return res.json({ code: 0, msg: '菜肴名称不能为空', result: null });
    const gmt = b.gmtCook || q.gmtCook || new Date().toISOString().slice(0, 10);
    let id = '';
    if (dbQuery) {
      const ex = dbQuery('SELECT id FROM dish_nutrition WHERE dish_name = ? AND menu_date = ?', [cn, gmt]);
      if (ex && ex.length > 0) id = String(ex[0].id);
      else { dbQuery('INSERT INTO dish_nutrition (dish_name, menu_date, meal_type, created_at, updated_at) VALUES (?, ?, ?, datetime("now"), datetime("now"))', [cn, gmt, b.mealTimes ?? 1]); const nr = dbQuery('SELECT id FROM dish_nutrition WHERE dish_name = ? AND menu_date = ? ORDER BY id DESC LIMIT 1', [cn, gmt]); if (nr && nr.length > 0) id = String(nr[0].id); }
    }
    return res.json({ code: 1, msg: 'success', result: id });
  });

  app.all('/meal/clear', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    if (!findKeepUserByToken(b.token || q.token || '', b.deviceId || q.deviceId || '')) return res.json({ code: 0, msg: '请先登录', result: null });
    if (dbQuery && b.mealTimes !== undefined) { try { dbQuery('DELETE FROM dish_nutrition WHERE menu_date = ? AND meal_type = ?', [b.gmtCook || q.gmtCook || new Date().toISOString().slice(0, 10), b.mealTimes ?? q.mealTimes]); } catch (e) { } }
    return res.json({ code: 1, msg: 'success', result: null });
  });

  // ═══ 留样统计/日历/搜索 ═══
  app.all('/keep_count/day_detail', (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    if (!findKeepUserByToken(b.token || q.token || '', b.deviceId || q.deviceId || '')) return res.json({ code: 0, msg: '请先登录', result: null });
    let date = b.date || q.date || '';
    if (date && /^\d{10,}$/.test(String(date))) { date = new Date(Number(date) + 8 * 3600 * 1000).toISOString().slice(0, 10); } else if (!date) { date = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }
    let list = [];
    if (dbQuery) {
      try {
        const us = new Date(date + 'T00:00:00+08:00').toISOString(); const ue = new Date(date + 'T23:59:59+08:00').toISOString();
        const rows = dbQuery("SELECT * FROM sample_records WHERE sampled_at >= ? AND sampled_at <= ? ORDER BY slot", [us, ue]);
        const grouped = {};
        (rows || []).forEach(r => { const k = r.meal || '午餐'; if (!grouped[k]) grouped[k] = { mealTimes: r.meal === '早餐' ? 0 : r.meal === '晚餐' ? 2 : 1, amount: 0, alreadyAmount: 0 }; grouped[k].amount++; if (r.status === 'stored') grouped[k].alreadyAmount++; });
        list = Object.values(grouped).map(g => ({ id: '', mealTimes: g.mealTimes, amount: g.amount, alreadyAmount: g.alreadyAmount, achieve: g.alreadyAmount, gmtCook: date }));
      } catch (e) { }
    }
    return res.json({ code: 1, msg: 'success', message: 'success', result: list });
  });

  app.all('/keep_count/get_day', (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    if (!findKeepUserByToken(b.token || q.token || '', b.deviceId || q.deviceId || '')) return res.json({ code: 0, msg: '请先登录', result: null });
    let gmt = b.gmtCook || q.gmtCook || ''; if (gmt && /^\d{10,}$/.test(String(gmt))) gmt = new Date(Number(gmt) + 8 * 3600 * 1000).toISOString().slice(0, 10); else if (!gmt) gmt = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    let total = 0, already = 0;
    if (dbQuery) {
      try {
        const us = new Date(gmt + 'T00:00:00+08:00').toISOString(); const ue = new Date(gmt + 'T23:59:59+08:00').toISOString();
        total = dbQuery('SELECT COUNT(*) as cnt FROM sample_records WHERE sampled_at >= ? AND sampled_at <= ?', [us, ue])?.[0]?.cnt || 0;
        already = dbQuery("SELECT COUNT(*) as cnt FROM sample_records WHERE sampled_at >= ? AND sampled_at <= ? AND status = 'stored'", [us, ue])?.[0]?.cnt || 0;
      } catch (e) { }
    }
    return res.json({ code: 1, msg: 'success', message: 'success', result: { total, already } });
  });

  app.all('/keep/calendar', (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    if (!findKeepUserByToken(b.token || q.token || '', b.deviceId || q.deviceId || '')) return res.json({ code: 0, msg: '请先登录', result: null });
    let ym = b.yearMonth || q.yearMonth || b.date || q.date || ''; if (ym && /^\d{10,}$/.test(String(ym))) ym = new Date(Number(ym) + 8 * 3600 * 1000).toISOString().slice(0, 7); else if (!ym) ym = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7);
    const [year, month] = ym.split('-').map(Number);
    const dim = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1).getDay();
    const days = [{ day: 1, status: 0, hasMenu: false, hasSample: false }]; 
    for (let d = 2; d <= dim; d++) days.push({ day: d, status: 0, hasMenu: false, hasSample: false });
    return res.json({ code: 1, msg: 'success', result: { yearMonth: ym, firstWeekday: firstDay, daysInMonth: dim, days } });
  });

  app.all('/keep/day_detail', (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    if (!findKeepUserByToken(b.token || q.token || '', b.deviceId || q.deviceId || '')) return res.json({ code: 0, msg: '请先登录', result: null });
    let date = b.date || q.date || ''; if (date && /^\d{10,}$/.test(String(date))) date = new Date(Number(date) + 8 * 3600 * 1000).toISOString().slice(0, 10); else if (!date) date = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const meals = [{ mealTimes: 0, mealName: '早餐', status: 0, amount: 0, alreadyAmount: 0, menuItems: [], sampleItems: [] }, { mealTimes: 1, mealName: '午餐', status: 0, amount: 0, alreadyAmount: 0, menuItems: [], sampleItems: [] }, { mealTimes: 2, mealName: '晚餐', status: 0, amount: 0, alreadyAmount: 0, menuItems: [], sampleItems: [] }];
    return res.json({ code: 1, msg: 'success', result: { date, meals } });
  });

  app.all('/keep/search', (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    if (!findKeepUserByToken(b.token || q.token || '', b.deviceId || q.deviceId || '')) return res.json({ code: 0, msg: '请先登录', result: { total: 0, list: [] } });
    const kw = b.keyword || q.keyword || b.dishName || q.dishName || '';
    if (!kw || !kw.trim()) return res.json({ code: 0, msg: '请输入搜索关键词', result: { total: 0, list: [] } });
    const cp = parseInt(b.currentPage || q.currentPage || '1', 10) || 1; const ps = parseInt(b.pageSize || q.pageSize || '20', 10) || 20;
    let list = []; let total = 0;
    if (dbQuery) {
      try {
        const sp = `%${kw.trim()}%`;
        total = dbQuery("SELECT COUNT(*) as cnt FROM sample_records WHERE dish LIKE ? AND status = 'stored'", [sp])?.[0]?.cnt || 0;
        const rows = dbQuery("SELECT id, dish, weight, slot, operator, sampled_at, expire_at, photo_url, meal, device_record_id FROM sample_records WHERE dish LIKE ? AND status = 'stored' ORDER BY sampled_at DESC LIMIT ? OFFSET ?", [sp, ps, (cp - 1) * ps]);
        list = (rows || []).map(r => {
          let pu = r.photo_url || ''; if (pu && pu.startsWith('/keep-uploads/')) pu = 'http://' + (req.headers.host || `127.0.0.1:${state.httpPort || port}`) + pu;
          return { id: String(r.device_record_id || r.id || ''), cookName: r.dish || '', num: r.slot || '', weight: r.weight || 0, operator: r.operator || '', pic: pu, mealTimes: r.meal === '早餐' ? 0 : r.meal === '晚餐' ? 2 : 1, gmtCook: new Date(r.sampled_at).getTime() };
        });
      } catch (e) { }
    }
    return res.json({ code: 1, msg: 'success', result: { total, list } });
  });

  app.all('/keep/usage', (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    if (!findKeepUserByToken(b.token || q.token || '', b.deviceId || q.deviceId || '')) return res.json({ code: 0, msg: '请先登录', message: '请先登录', result: null });
    return res.json({ code: 1, msg: 'success', message: 'success', result: { currentTemp: 0, totalDoors: 12, usedDoors: 0, freeDoors: 12, amount: 0, alreadyAmount: 0, mealTimes: getCurrentMealType() } });
  });

  // ═══ 温度上报 ═══
  app.all('/temperature/recently_info', (req, res) => {
    let list = [];
    if (dbQuery) { try { list = (dbQuery('SELECT id, device_sn, temperature, humidity, recorded_at FROM keep_temperature_readings ORDER BY recorded_at DESC LIMIT 20', []) || []).map(r => ({ id: String(r.id), value: r.temperature != null ? Number(r.temperature) : 0, gmtRecord: new Date(r.recorded_at).getTime() })); } catch (e) { } }
    return res.json({ code: 1, message: 'success', result: list });
  });

  app.all('/temperature/save', parseMultipartWithFix, (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const deviceId = b.deviceId || q.deviceId || ''; const value = b.value || q.value || '';
    if (dbQuery && deviceId && value) { try { dbQuery('INSERT INTO keep_temperature_readings (device_sn, temperature, recorded_at, created_at) VALUES (?, ?, ?, ?)', [String(deviceId), Number(value), new Date().toISOString(), new Date().toISOString()]); } catch (e) { } }
    return res.json({ code: 1, message: 'success', result: null });
  });

  // ═══ 设备上报接收 ═══
  app.post('/api/keep/report', async (req, res) => {
    const b = req.body || {};
    const row = { record_no: b.recordNo || `DEV${Date.now()}`, meal: mealMap[b.mealTimes ?? 1] || '午餐', dish: b.dishName || b.dish || '未知菜品', weight: Number(b.weight) || 0, cabinet_id: b.deviceId || b.deviceSn || 'MS-LYG-40OEZJ', slot: String(b.num || b.slot || ''), sampled_at: new Date().toISOString(), expire_at: new Date(Date.now() + getKeepTimeoutMs()).toISOString(), status: 'stored', operator: b.operator || '', device_record_id: String(b.id || b.recordId || Date.now()) };
    await keepWriteToSupabase('sample_records', row);
    return res.json({ code: 0, msg: 'ok', data: null });
  });

  app.post('/api/keep/door/record', async (req, res) => {
    const b = req.body || {};
    await keepWriteToSupabase('keep_door_records', { device_sn: b.deviceSn || b.device_sn || '', door_num: String(b.doorNum || b.num || ''), event_type: 'open', reason: b.reason || '', operator: b.operator || '', dish_name: b.dishName || '', recorded_at: new Date().toISOString() });
    return res.json({ code: 0, msg: 'ok', data: null });
  });

  app.post('/api/keep/emergency', async (req, res) => {
    const b = req.body || {};
    await keepWriteToSupabase('keep_door_records', { device_sn: b.deviceSn || b.device_sn || '', door_num: String(b.doorNum || b.num || ''), event_type: 'emergency', reason: b.reason || '紧急取样', operator: b.operator || '', dish_name: b.dishName || '', recorded_at: new Date().toISOString() });
    return res.json({ code: 0, msg: 'ok', data: null });
  });

  app.post('/api/keep/door/status', async (req, res) => {
    const b = req.body || {}; const deviceSn = b.deviceSn || b.device_sn || '';
    if (dbQuery) { try { dbQuery("UPDATE keep_devices SET status = 'online', last_heartbeat = ? WHERE device_sn = ?", [new Date().toISOString(), deviceSn || 'MS-LYG-40OEZJ']); } catch (e) { } }
    return res.json({ code: 0, msg: 'ok', data: null });
  });

  app.post('/api/keep/expire/alarm', async (req, res) => {
    const b = req.body || {};
    await keepWriteToSupabase('alarm_events', { alarm_type: 'keep_expire', device_sn: b.deviceSn || b.device_sn || '', message: `留样到期: ${b.dishName || b.dish || ''} 槽位${b.slot || b.num || ''}`, created_at: new Date().toISOString() });
    return res.json({ code: 0, msg: 'ok', data: null });
  });

  app.post('/api/keep/device/status', async (req, res) => {
    const b = req.body || {}; const deviceSn = b.deviceSn || b.device_sn || b.sn || '';
    if (!deviceSn) return res.status(400).json({ code: 400, msg: '缺少 device_sn', data: null });
    const status = b.status || (b.online ? 'online' : 'offline'); const now = new Date().toISOString();
    if (dbQuery) {
      try {
        const ex = dbQuery('SELECT id FROM keep_devices WHERE device_sn = ?', [deviceSn]);
        if (ex && ex.length > 0) dbQuery('UPDATE keep_devices SET status = ?, last_heartbeat = ?, updated_at = ? WHERE device_sn = ?', [status, now, now, deviceSn]);
        else dbQuery('INSERT INTO keep_devices (name, device_sn, model, status, last_heartbeat, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [b.name || deviceSn, deviceSn, b.model || 'MS-LYG-40OEZJ', status, now, now, now]);
      } catch (e) { }
    }
    return res.json({ code: 0, msg: 'ok', data: null });
  });

  // ═══ 管理端 API ═══
  app.get('/api/keep/logs', (req, res) => {
    const since = parseInt(req.query.since || '0', 10);
    res.json({ code: 0, msg: 'ok', data: { logs: getKeepLogs(since), total: keepDeviceLogs.length } });
  });

  app.get('/api/keep/expired-doors', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: [] });
    try {
      const rows = dbQuery("SELECT slot, dish, meal, sampled_at, expire_at FROM sample_records WHERE status = 'stored' AND expire_at IS NOT NULL AND expire_at < ? ORDER BY slot, sampled_at", [new Date().toISOString()]);
      const sm = {};
      (rows || []).forEach(r => { const s = r.slot != null ? String(r.slot).trim() : ''; if (!s || s === '0') return; if (!sm[s]) sm[s] = { num: s, dishes: [] }; sm[s].dishes.push(r.dish || '未知'); });
      return res.json({ code: 0, msg: 'ok', data: Object.values(sm) });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: [] }); }
  });

  app.post('/api/keep/take-sample', (req, res) => {
    const { num } = req.body || {}; if (!num || !dbQuery) return res.status(400).json({ code: 400, msg: '缺少参数', data: null });
    try {
      const now = new Date().toISOString();
      dbQuery("UPDATE sample_records SET status = 'disposed', updated_at = ? WHERE slot = ? AND status = 'stored'", [now, String(num)]);
      return res.json({ code: 0, msg: 'ok', data: { num: String(num), cleared: 1 } });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: null }); }
  });

  app.post('/api/keep/cleanup', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    try { dbQuery('DELETE FROM sample_records', []); return res.json({ code: 0, msg: 'ok', data: { deleted: 1 } }); }
    catch (e) { return res.status(500).json({ code: 500, msg: e.message, data: null }); }
  });

  app.get('/api/keep/dashboard', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    try {
      let deviceSn = 'MS-LYG-40OEZJ', model = 'MS-LYG-40OEZJ', deviceStatus = 'online', cabinetCount = 12;
      const dr = dbQuery('SELECT device_sn, model, status, last_heartbeat, cabinet_count FROM keep_devices ORDER BY last_heartbeat DESC LIMIT 1', []);
      if (dr && dr.length > 0) { deviceSn = dr[0].device_sn || deviceSn; model = dr[0].model || model; deviceStatus = dr[0].status || 'offline'; cabinetCount = parseInt(dr[0].cabinet_count, 10) || 12; }
      const dNow = new Date(Date.now() + 8 * 3600 * 1000), ts = dNow.toISOString().slice(0, 10);
      const us = new Date(ts + 'T00:00:00+08:00').toISOString(), ue = new Date(ts + 'T23:59:59+08:00').toISOString();
      const sr = dbQuery("SELECT id, slot, dish, weight, meal, operator, sampled_at, expire_at, photo_url, status FROM sample_records WHERE sampled_at >= ? AND sampled_at <= ? ORDER BY slot, sampled_at", [us, ue]);
      const sg = {}; (sr || []).forEach(r => { const s = r.slot != null ? String(r.slot).trim() : ''; if (!s || s === '0') return; if (!sg[s]) sg[s] = []; sg[s].push(r); });
      const doors = [];
      for (let i = 1; i <= cabinetCount; i++) {
        const records = sg[String(i)] || [];
        if (records.length > 0) {
          const pr = records[0]; let pu = pr.photo_url || ''; if (pu && pu.startsWith('/keep-uploads/')) pu = 'http://' + (req.headers.host || '127.0.0.1:' + (state.httpPort || port)) + pu;
          doors.push({ num: i, state: 1, meal: pr.meal || '午餐', cookName: records.map(r => r.dish || '').join('/'), dishCount: records.length, photoUrl: pu, operator: pr.operator || '', weight: records.reduce((s, r) => s + (Number(r.weight) || 0), 0) });
        } else { doors.push({ num: i, state: 0, meal: '午餐', cookName: '', dishCount: 0, weight: 0 }); }
      }
      return res.json({ code: 0, msg: 'ok', data: { device: { deviceSn, model, status: deviceStatus, cabinetCount, usedCount: Object.keys(sg).length, emptyCount: cabinetCount - Object.keys(sg).length }, doors } });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: null }); }
  });

  app.post('/api/keep/seed', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    try {
      const now = new Date(); const st = { 1: ['小米粥', '早餐'], 2: ['红烧肉', '午餐'], 3: ['清蒸鱼', '晚餐'] };
      for (const [slot, [dish, meal]] of Object.entries(st)) {
        const ex = dbQuery("SELECT id FROM sample_records WHERE cabinet_id='MS-LYG-40OEZJ' AND slot=? AND status='stored'", [slot]);
        if (!ex || ex.length === 0) {
          dbQuery('INSERT INTO sample_records (record_no, meal, dish, weight, cabinet_id, slot, sampled_at, expire_at, status, operator, device_record_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ['SEED' + Date.now(), meal, dish, 125, 'MS-LYG-40OEZJ', slot, now.toISOString(), new Date(now.getTime() + 48 * 3600 * 1000).toISOString(), 'stored', 'system', String(Date.now())]);
        }
      }
      return res.json({ code: 0, msg: 'ok', data: { inserted: 3 } });
    } catch (e) { return res.status(500).json({ code: 500, msg: e.message, data: null }); }
  });

  // ═══ 返回中间件和上传目录路径 ═══
  return { parseMultipartWithFix, keepUploadDir, saveBase64ToFile, extractPicFromRequest, keepWriteToSupabase };
}