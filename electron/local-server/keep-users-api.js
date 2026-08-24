// 留样柜人员管理 CRUD API 路由
// 由 local-server/index.js 在 tryHttpPort 中调用 mountKeepUsersApi(app, dbQuery, state, port, ...)

export function mountKeepUsersApi(app, dbQuery, state, port, keepDeviceCredentials, saveBase64ToFile, pushKeepLog) {

  // GET /api/keep/users — 查询人员列表（支持搜索）
  app.get('/api/keep/users', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: [] });
    try {
      const keyword = (req.query.keyword || '').trim();
      let rows;
      if (keyword) {
        const pattern = `%${keyword}%`;
        rows = dbQuery(
          'SELECT id, login_name, nick_name, is_admin, image, position, num, face_token, created_at, updated_at FROM keep_users WHERE login_name LIKE ? OR nick_name LIKE ? OR position LIKE ? OR num LIKE ? ORDER BY id',
          [pattern, pattern, pattern, pattern]
        );
      } else {
        rows = dbQuery(
          'SELECT id, login_name, nick_name, is_admin, image, position, num, face_token, created_at, updated_at FROM keep_users ORDER BY id'
        );
      }
      return res.json({ code: 0, msg: 'ok', data: rows || [] });
    } catch (e) {
      console.error('[KeepUsers] 查询人员列表失败:', e.message);
      return res.status(500).json({ code: 500, msg: e.message, data: [] });
    }
  });

  // GET /api/keep/users/check-exists — 校验登录名是否已存在（供管理端录入时实时查重）
  app.get('/api/keep/users/check-exists', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: { exists: false } });
    const loginName = (req.query.login_name || '').trim();
    if (!loginName) return res.status(400).json({ code: 400, msg: '登录名不能为空', data: { exists: false } });
    try {
      const existing = dbQuery('SELECT id FROM keep_users WHERE login_name = ?', [loginName]);
      return res.json({ code: 0, msg: 'ok', data: { exists: !!(existing && existing.length > 0) } });
    } catch (e) {
      console.error('[KeepUsers] 查重失败:', e.message);
      return res.status(500).json({ code: 500, msg: e.message, data: { exists: false } });
    }
  });

  // GET /api/keep/users/:id — 查询单个人员详情
  app.get('/api/keep/users/:id', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    try {
      const rows = dbQuery(
        'SELECT id, login_name, nick_name, is_admin, image, position, num, face_token, created_at, updated_at FROM keep_users WHERE id = ?',
        [req.params.id]
      );
      if (!rows || rows.length === 0) {
        return res.status(404).json({ code: 404, msg: '人员不存在', data: null });
      }
      return res.json({ code: 0, msg: 'ok', data: rows[0] });
    } catch (e) {
      console.error('[KeepUsers] 查询人员详情失败:', e.message);
      return res.status(500).json({ code: 500, msg: e.message, data: null });
    }
  });

  // POST /api/keep/users — 新增人员
  app.post('/api/keep/users', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    try {
      const body = req.body || {};
      const { login_name, password, nick_name, is_admin, image, position, num } = body;
      if (!login_name || !login_name.trim()) {
        console.log('[KeepUsers-API] 登录名为空，req.body keys:', Object.keys(body), 'rawBody前200字符:', (req.rawBody || '').slice(0, 200));
        return res.status(400).json({ code: 400, msg: '登录名不能为空', data: null });
      }
      const existing = dbQuery('SELECT id FROM keep_users WHERE login_name = ?', [login_name.trim()]);
      if (existing && existing.length > 0) {
        return res.status(400).json({ code: 400, msg: `登录名「${login_name.trim()}」已存在`, data: null });
      }
      const now = new Date().toISOString();
      dbQuery(
        'INSERT INTO keep_users (login_name, password, nick_name, is_admin, image, position, num, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [login_name.trim(), (password || '123456').trim(), (nick_name || '').trim(), is_admin ? 1 : 0, (image || '').trim(), (position || '').trim(), (num || '').trim(), now, now]
      );
      const newRow = dbQuery('SELECT id, login_name, nick_name, is_admin, image, position, num, face_token, created_at, updated_at FROM keep_users WHERE login_name = ?', [login_name.trim()]);
      const created = newRow?.[0] || null;
      if (created && keepDeviceCredentials) {
        keepDeviceCredentials[login_name.trim()] = (password || '123456').trim();
      }
      if (pushKeepLog) pushKeepLog('system', '新增留样人员', `登录名:${login_name.trim()}`);
      console.log(`[KeepUsers] 新增人员: ${login_name.trim()}`);
      return res.json({ code: 0, msg: 'ok', data: created });
    } catch (e) {
      console.error('[KeepUsers] 新增人员失败:', e.message);
      return res.status(500).json({ code: 500, msg: e.message, data: null });
    }
  });

  // PUT /api/keep/users/:id — 编辑人员
  app.put('/api/keep/users/:id', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    try {
      const id = req.params.id;
      const existing = dbQuery('SELECT id, login_name FROM keep_users WHERE id = ?', [id]);
      if (!existing || existing.length === 0) {
        return res.status(404).json({ code: 404, msg: '人员不存在', data: null });
      }
      const oldLoginName = existing[0].login_name;
      const { login_name, password, nick_name, is_admin, image, position, num, face_token } = req.body || {};
      const now = new Date().toISOString();
      const fields = ['updated_at = ?'];
      const vals = [now];
      if (login_name !== undefined) {
        if (!login_name || !login_name.trim()) return res.status(400).json({ code: 400, msg: '登录名不能为空', data: null });
        if (login_name.trim() !== oldLoginName) {
          const dup = dbQuery('SELECT id FROM keep_users WHERE login_name = ?', [login_name.trim()]);
          if (dup && dup.length > 0) return res.status(400).json({ code: 400, msg: `登录名「${login_name.trim()}」已被使用`, data: null });
        }
        fields.push('login_name = ?'); vals.push(login_name.trim());
        if (oldLoginName !== login_name.trim() && keepDeviceCredentials) delete keepDeviceCredentials[oldLoginName];
      }
      if (password !== undefined) { fields.push('password = ?'); vals.push(String(password).trim()); }
      if (nick_name !== undefined) { fields.push('nick_name = ?'); vals.push(String(nick_name).trim()); }
      if (is_admin !== undefined) { fields.push('is_admin = ?'); vals.push(is_admin ? 1 : 0); }
      if (image !== undefined) { fields.push('image = ?'); vals.push(String(image).trim()); }
      if (position !== undefined) { fields.push('position = ?'); vals.push(String(position).trim()); }
      if (num !== undefined) { fields.push('num = ?'); vals.push(String(num).trim()); }
      if (face_token !== undefined) { fields.push('face_token = ?'); vals.push(String(face_token).trim()); }
      dbQuery(`UPDATE keep_users SET ${fields.join(', ')} WHERE id = ?`, [...vals, id]);
      const effLoginName = login_name !== undefined ? login_name.trim() : oldLoginName;
      const effPassword = password !== undefined ? String(password).trim() : undefined;
      if (keepDeviceCredentials) {
        if (effPassword) keepDeviceCredentials[effLoginName] = effPassword;
        else if (login_name !== undefined && oldLoginName !== login_name.trim()) {
          keepDeviceCredentials[effLoginName] = keepDeviceCredentials[oldLoginName] || '123456';
        }
      }
      const updated = dbQuery('SELECT id, login_name, nick_name, is_admin, image, position, num, face_token, created_at, updated_at FROM keep_users WHERE id = ?', [id]);
      if (pushKeepLog) pushKeepLog('system', '编辑留样人员', `id:${id}, login_name:${effLoginName}`);
      return res.json({ code: 0, msg: 'ok', data: updated?.[0] || null });
    } catch (e) {
      console.error('[KeepUsers] 编辑人员失败:', e.message);
      return res.status(500).json({ code: 500, msg: e.message, data: null });
    }
  });

  // DELETE /api/keep/users/:id — 删除人员
  app.delete('/api/keep/users/:id', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    try {
      const id = req.params.id;
      const existing = dbQuery('SELECT id, login_name FROM keep_users WHERE id = ?', [id]);
      if (!existing || existing.length === 0) return res.status(404).json({ code: 404, msg: '人员不存在', data: null });
      const loginName = existing[0].login_name;
      dbQuery('DELETE FROM keep_users WHERE id = ?', [id]);
      if (keepDeviceCredentials) delete keepDeviceCredentials[loginName];
      if (pushKeepLog) pushKeepLog('system', '删除留样人员', `login_name:${loginName}`);
      return res.json({ code: 0, msg: 'ok', data: null });
    } catch (e) {
      console.error('[KeepUsers] 删除人员失败:', e.message);
      return res.status(500).json({ code: 500, msg: e.message, data: null });
    }
  });

  // POST /api/keep/users/upload-image — 上传人员头像
  app.post('/api/keep/users/upload-image', (req, res) => {
    try {
      const { image } = req.body || {};
      if (!image) return res.status(400).json({ code: 400, msg: '缺少图片数据', data: null });
      const url = saveBase64ToFile ? saveBase64ToFile(image) : image;
      return res.json({ code: 0, msg: 'ok', data: { url } });
    } catch (e) {
      console.error('[KeepUsers] 上传头像失败:', e.message);
      return res.status(500).json({ code: 500, msg: e.message, data: null });
    }
  });

}