/**
 * 本地 SQLite 数据库 schema 应急修复
 * 在 Electron 环境下启动时自动检测并修复缺失列
 */

const TDD_FIX_COLUMNS = [
  { name: 'bind_mode', def: "TEXT DEFAULT 'all'" },
  { name: 'bind_value', def: "TEXT DEFAULT ''" },
  { name: 'max_price_temp_dish', def: 'REAL DEFAULT 0' },
  { name: 'interval_price_temp_dish', def: 'REAL DEFAULT 0' },
  { name: 'min_price_temp_dish', def: 'REAL DEFAULT 0' },
  { name: 'bind_plate_before_take', def: 'INTEGER DEFAULT 1' },
  { name: 'ui_template', def: 'INTEGER DEFAULT 1' },
  { name: 'weigh_alarm_model', def: 'INTEGER DEFAULT 1' },
  { name: 'min_settlement_weight', def: 'INTEGER DEFAULT 10' },
  { name: 'stable_difference', def: 'INTEGER DEFAULT 2' },
  { name: 'alarm_below_grams', def: 'INTEGER DEFAULT -1000' },
  { name: 'max_weight_dish', def: 'INTEGER DEFAULT 5000' },
  { name: 'device_type', def: "TEXT DEFAULT 'display_scale'" },
  { name: 'last_pull_at', def: 'TEXT' },
  { name: 'token', def: 'TEXT' },
];

async function getTableColumns(tableName: string): Promise<string[]> {
  const api = (window as any).electronAPI;
  if (!api || !api.dbExec) return [];
  try {
    const res = await api.dbExec(`PRAGMA table_info('${tableName}')`);
    if (res.error) {
      console.error(`[LocalDbFix] PRAGMA table_info failed for ${tableName}:`, res.error);
      return [];
    }
    // dbExec 返回 { error: null } 但没法获取查询结果，改用 dbQuery
    const qRes = await api.dbQuery(`PRAGMA table_info('${tableName}')`, []);
    if (qRes.error || !qRes.data) return [];
    // PRAGMA table_info returns: [cid, name, type, notnull, dflt_value, pk]
    return qRes.data.map((row: any) => row.name);
  } catch (err) {
    console.error(`[LocalDbFix] getTableColumns error:`, err);
    return [];
  }
}

async function execSql(sql: string): Promise<{ ok: boolean; error?: string }> {
  const api = (window as any).electronAPI;
  if (!api || !api.dbExec) {
    return { ok: false, error: 'Electron IPC not available' };
  }
  try {
    const res = await api.dbExec(sql);
    if (res.error) {
      return { ok: false, error: res.error };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * 修复 tray_display_devices 缺失列
 * 在 Electron 环境下启动时调用一次
 */
export async function fixTrayDisplayDevicesSchema(): Promise<void> {
  const api = (window as any).electronAPI;
  if (!api || !api.dbExec) {
    console.log('[LocalDbFix] Not Electron, skip schema fix');
    return;
  }

  console.log('[LocalDbFix] Checking tray_display_devices schema...');

  const columns = await getTableColumns('tray_display_devices');
  if (columns.length === 0) {
    console.log('[LocalDbFix] tray_display_devices table not found or cannot read columns, skip');
    return;
  }

  console.log(`[LocalDbFix] tray_display_devices current columns: ${columns.join(', ')}`);

  const missing = TDD_FIX_COLUMNS.filter((col) => !columns.includes(col.name));
  if (missing.length === 0) {
    console.log('[LocalDbFix] tray_display_devices schema is complete, no fix needed');
    // schema 完整时也要修复已有设备的临时菜品配置值
    await fixTempDishPrice();
    return;
  }

  console.warn(`[LocalDbFix] tray_display_devices missing columns: ${missing.map((c) => c.name).join(', ')}`);

  for (const col of missing) {
    const sql = `ALTER TABLE tray_display_devices ADD COLUMN ${col.name} ${col.def}`;
    console.log(`[LocalDbFix] Applying: ${sql}`);
    const res = await execSql(sql);
    if (res.ok) {
      console.log(`[LocalDbFix] Column added: ${col.name}`);
    } else {
      // 如果列已经存在（可能是并发或其他原因），SQLite 会报错 "duplicate column name"
      if (res.error?.includes('duplicate column') || res.error?.includes('already exists')) {
        console.log(`[LocalDbFix] Column ${col.name} already exists (race condition)`);
      } else {
        console.error(`[LocalDbFix] Failed to add column ${col.name}:`, res.error);
      }
    }
  }

  // 最终验证
  const finalColumns = await getTableColumns('tray_display_devices');
  const stillMissing = TDD_FIX_COLUMNS.filter((col) => !finalColumns.includes(col.name));
  if (stillMissing.length > 0) {
    console.error(`[LocalDbFix] CRITICAL: still missing columns after fix: ${stillMissing.map((c) => c.name).join(', ')}`);
  } else {
    console.log('[LocalDbFix] tray_display_devices schema fixed successfully');
  }

  // 修复已存在设备的临时菜品配置（max_price_temp_dish > 0 会导致设备生成临时菜品）
  await fixTempDishPrice();
}

/**
 * 修复已有设备的 max_price_temp_dish 配置
 * 如果 max_price_temp_dish > 0，强制清零（禁用临时菜品生成）
 */
async function fixTempDishPrice(): Promise<void> {
  const api = (window as any).electronAPI;
  if (!api || !api.dbQuery) return;
  try {
    // 查询有多少设备的临时菜品配置不为0
    const res = await api.dbQuery(
      'SELECT COUNT(*) as cnt FROM tray_display_devices WHERE max_price_temp_dish > 0',
      []
    );
    const cnt = res?.data?.[0]?.cnt || 0;
    if (cnt > 0) {
      console.warn(`[LocalDbFix] 发现 ${cnt} 台设备 max_price_temp_dish > 0（会生成临时菜品），强制清零...`);
      // 用 dbRun 执行 UPDATE（dbExec 只支持 DDL）
      if (api.dbRun) {
        await api.dbRun(
          'UPDATE tray_display_devices SET max_price_temp_dish = 0, interval_price_temp_dish = 0, min_price_temp_dish = 0 WHERE max_price_temp_dish > 0',
          []
        );
      } else if (api.dbExec) {
        await api.dbExec(
          'UPDATE tray_display_devices SET max_price_temp_dish = 0, interval_price_temp_dish = 0, min_price_temp_dish = 0 WHERE max_price_temp_dish > 0'
        );
      }
      console.log('[LocalDbFix] 临时菜品配置已修复，设备重新注册后生效');
    } else {
      console.log('[LocalDbFix] 临时菜品配置正常（全部为0）');
    }
  } catch (e) {
    console.warn('[LocalDbFix] fixTempDishPrice 执行失败:', e);
  }
}