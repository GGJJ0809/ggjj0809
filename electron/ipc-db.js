import { app, dialog, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(app.getPath('userData'), 'canteen.db');

// ─── 查找 sql.js 的 WASM 文件（兼容手动安装、npm 安装和打包后环境）──────────────────────────────
function findWasmPath() {
  const candidates = [];
  // 1. 打包后的路径（electron-builder extraResources 会将 wasm 放到 resources 目录）
  if (process.resourcesPath) {
    candidates.push(
      path.join(process.resourcesPath, 'sql-wasm.wasm'),
    );
  }
  // 2. 从 node_modules 路径查找
  try {
    const sqlJsPath = require.resolve('sql.js');
    const sqlJsDir = path.dirname(sqlJsPath);
    candidates.push(
      path.join(sqlJsDir, 'sql-wasm.wasm'),
      path.join(sqlJsDir, 'dist', 'sql-wasm.wasm'),
      path.join(sqlJsDir, '..', 'dist', 'sql-wasm.wasm'),
      path.join(sqlJsDir, '..', 'sql-wasm.wasm'),
    );
  } catch {
    // require.resolve 失败时继续用兜底方案
  }

  // 3. 尝试从 node_modules 搜索路径找
  const modulePaths = require.resolve.paths?.('sql.js') || [];
  for (const mp of modulePaths) {
    candidates.push(
      path.join(mp, 'sql.js', 'sql-wasm.wasm'),
      path.join(mp, 'sql.js', 'dist', 'sql-wasm.wasm'),
    );
  }

  // 4. 项目根目录下的 node_modules
  const projectRoot = path.resolve(__dirname, '..');
  candidates.push(
    path.join(projectRoot, 'node_modules', 'sql.js', 'sql-wasm.wasm'),
    path.join(projectRoot, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  );

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log('[sql.js] WASM found:', p);
      return p;
    }
  }

  throw new Error(
    'sql.js WASM file not found. Searched:\n' + candidates.join('\n')
  );
}

// ─── 初始化 sql.js（纯 JavaScript，无需编译）──────────────────────────────
let SQL = null;
let db = null;
let dbInitPromise = null; // singleton lock to prevent concurrent init

function tableExists(database, name) {
  try {
    const res = database.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`);
    return res && res.length > 0 && res[0].values && res[0].values.length > 0;
  } catch {
    return false;
  }
}

function indexExists(database, indexName) {
  try {
    const res = database.exec(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='${indexName}'`,
    );
    return res && res.length > 0 && res[0].values && res[0].values.length > 0;
  } catch {
    return false;
  }
}

function getTableColumns(database, tableName) {
  try {
    const res = database.exec(`PRAGMA table_info('${tableName}')`);
    if (!res || res.length === 0 || !res[0].values || res[0].values.length === 0) {
      return [];
    }
    // PRAGMA table_info returns: [cid, name, type, notnull, dflt_value, pk]
    return res[0].values.map((row) => row[1]);
  } catch (err) {
    console.error(`[SQLite] getTableColumns failed for ${tableName}:`, err.message);
    return [];
  }
}

function columnExists(database, tableName, columnName) {
  const cols = getTableColumns(database, tableName);
  const exists = cols.includes(columnName);
  if (!exists) {
    console.log(`[SQLite] columnExists check: ${tableName}.${columnName} NOT found in [${cols.join(', ')}]`);
  }
  return exists;
}

function runMigrations(database) {
  let migrated = 0;
  console.log('[SQLite] Migration engine started...');

  // Migration 1: 为 product_custom_values 添加 UNIQUE(product_id, field_id) 索引
  // 旧版 canteen.db 缺少此约束，导致 upsert 的 ON CONFLICT 会报错
  const idxName = 'idx_product_custom_values_unique';
  if (indexExists(database, idxName)) {
    console.log(`[SQLite] Migration skipped: ${idxName} already exists`);
  } else {
    console.log(`[SQLite] Migration running: ${idxName} not found, applying...`);
    try {
      // 统计重复数据
      let dedupCount = 0;
      try {
        const dupRes = database.exec(`
          SELECT COUNT(*) FROM (
            SELECT t1.id FROM product_custom_values AS t1
            WHERE EXISTS (
              SELECT 1 FROM product_custom_values AS t2
              WHERE t2.product_id = t1.product_id
                AND t2.field_id = t1.field_id
                AND t2.id > t1.id
            )
          )
        `);
        if (dupRes && dupRes[0]?.values?.[0]) {
          dedupCount = dupRes[0].values[0][0] || 0;
        }
      } catch {
        // 如果表不存在则忽略统计
      }
      if (dedupCount > 0) {
        console.log(`[SQLite] Migration: cleaning ${dedupCount} duplicate rows in product_custom_values`);
      } else {
        console.log(`[SQLite] Migration: no duplicate rows found in product_custom_values`);
      }

      // 先清理重复数据：保留每组 (product_id, field_id) 中 id 最大的记录
      database.exec(`
        DELETE FROM product_custom_values
        WHERE id IN (
          SELECT t1.id FROM product_custom_values AS t1
          WHERE EXISTS (
            SELECT 1 FROM product_custom_values AS t2
            WHERE t2.product_id = t1.product_id
              AND t2.field_id = t1.field_id
              AND t2.id > t1.id
          )
        )
      `);
      // 创建唯一索引
      database.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS ${idxName}
        ON product_custom_values (product_id, field_id)
      `);
      console.log(`[SQLite] Migration applied: ${idxName} created successfully`);
      migrated++;
    } catch (err) {
      console.error(`[SQLite] Migration failed for ${idxName}:`, err.message);
    }
  }

  // Migration 2: tray_display_devices 新增多个列
  // 旧版 canteen.db 缺少这些列，与云端 schema 不一致
  if (tableExists(database, 'tray_display_devices')) {
    const tddColumns = [
      { name: 'bind_mode', def: "TEXT DEFAULT 'all'" },
      { name: 'bind_value', def: "TEXT DEFAULT ''" },
      { name: 'meal_type', def: 'INTEGER' },
      // 设备配置参数（旧版可能缺少）
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
    // 先打印当前所有列，方便排查
    const allCols = getTableColumns(database, 'tray_display_devices');
    console.log('[SQLite] tray_display_devices current columns:', allCols.join(', '));

    for (const col of tddColumns) {
      if (columnExists(database, 'tray_display_devices', col.name)) {
        console.log(`[SQLite] Migration skipped: tray_display_devices.${col.name} already exists`);
      } else {
        console.log(`[SQLite] Migration running: tray_display_devices.${col.name} not found, applying...`);
        try {
          database.exec(`ALTER TABLE tray_display_devices ADD COLUMN ${col.name} ${col.def}`);
          console.log(`[SQLite] Migration applied: tray_display_devices.${col.name} added successfully`);
          migrated++;
        } catch (err) {
          console.error(`[SQLite] Migration failed: tray_display_devices.${col.name} - ${err.message}`);
        }
      }
    }

    // 最终验证：强制检查所有列是否真正存在
    const finalCols = getTableColumns(database, 'tray_display_devices');
    const missingCols = tddColumns.filter((col) => !finalCols.includes(col.name));
    if (missingCols.length > 0) {
      console.error(`[SQLite] CRITICAL: tray_display_devices 仍然缺失列: ${missingCols.map((c) => c.name).join(', ')}`);
      console.error(`[SQLite] 当前列: ${finalCols.join(', ')}`);
      // 尝试再次强制修复
      for (const col of missingCols) {
        console.log(`[SQLite] Force repair: tray_display_devices.${col.name}...`);
        try {
          database.exec(`ALTER TABLE tray_display_devices ADD COLUMN ${col.name} ${col.def}`);
          console.log(`[SQLite] Force repair success: tray_display_devices.${col.name}`);
          migrated++;
        } catch (err) {
          console.error(`[SQLite] Force repair failed: tray_display_devices.${col.name} - ${err.message}`);
        }
      }
    } else {
      console.log(`[SQLite] tray_display_devices schema verified: all ${tddColumns.length} columns present`);
    }
  } else {
    console.log('[SQLite] Migration skipped: tray_display_devices table does not exist');
  }

  console.log(`[SQLite] Migration engine finished: ${migrated} migration(s) applied`);

  // Migration 3: 为 dish_nutrition 添加 menu_date 和 img 列
  // 旧版 canteen.db 缺少这些列，导致同步菜品到大屏失败
  if (tableExists(database, 'dish_nutrition')) {
    const dnColumns = [
      { name: 'menu_date', def: "TEXT DEFAULT ''" },
      { name: 'img', def: "TEXT DEFAULT ''" },
    ];
    for (const col of dnColumns) {
      if (columnExists(database, 'dish_nutrition', col.name)) {
        console.log(`[SQLite] Migration skipped: dish_nutrition.${col.name} already exists`);
      } else {
        console.log(`[SQLite] Migration running: dish_nutrition.${col.name} not found, applying...`);
        try {
          database.exec(`ALTER TABLE dish_nutrition ADD COLUMN ${col.name} ${col.def}`);
          console.log(`[SQLite] Migration applied: dish_nutrition.${col.name} added successfully`);
          migrated++;
        } catch (err) {
          console.error(`[SQLite] Migration failed: dish_nutrition.${col.name} - ${err.message}`);
        }
      }
    }
  }

  // Migration 4: 为 dish_nutrition 建立唯一约束 —— 统一使用 3 字段索引 (dish_name, menu_date, meal_type)
  // 不再创建旧的 2 字段索引
  if (tableExists(database, 'dish_nutrition')) {
    if (indexExists(database, 'idx_dish_nutrition_unique_v2')) {
      console.log('[SQLite] Migration 4 skipped: v2 3-column unique index already exists');
    } else {
      console.log('[SQLite] Migration 4 running: ensuring 3-column unique index...');
      try {
        // 先清理 3 字段真正重复的数据
        try {
          database.exec("DELETE FROM dish_nutrition WHERE id IN (SELECT t1.id FROM dish_nutrition AS t1 WHERE EXISTS (SELECT 1 FROM dish_nutrition AS t2 WHERE t2.dish_name=t1.dish_name AND t2.menu_date=t1.menu_date AND t2.meal_type=t1.meal_type AND t2.id>t1.id))");
        } catch { /* ignore */ }
        // 删除旧的 2 字段索引（如果存在）
        try { database.exec("DROP INDEX IF EXISTS idx_dish_nutrition_unique"); } catch { /* ignore */ }
        // 创建 3 字段唯一索引
        database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_dish_nutrition_unique_v2 ON dish_nutrition (dish_name, menu_date, meal_type)");
        console.log('[SQLite] Migration 4 applied: 3-column unique index created');
        migrated++;
      } catch (err) {
        console.error('[SQLite] Migration 4 failed:', err.message);
      }
    }
  }

  // Migration 5a: 为 sample_records 添加 photo_url 列
  // 留样柜设备拍照后需要写入图片 base64
  if (tableExists(database, 'sample_records')) {
    if (!columnExists(database, 'sample_records', 'photo_url')) {
      console.log('[SQLite] Migration running: sample_records.photo_url not found, applying...');
      try {
        database.exec(`ALTER TABLE sample_records ADD COLUMN photo_url TEXT DEFAULT ''`);
        console.log('[SQLite] Migration applied: sample_records.photo_url added successfully');
        migrated++;
      } catch (err) {
        console.error('[SQLite] Migration failed: sample_records.photo_url -', err.message);
      }
    } else {
      console.log('[SQLite] Migration skipped: sample_records.photo_url already exists');
    }
  }

  // Migration 5b: 为 sample_records 添加 device_record_id 列
  if (tableExists(database, 'sample_records')) {
    if (!columnExists(database, 'sample_records', 'device_record_id')) {
      console.log('[SQLite] Migration running: sample_records.device_record_id not found, applying...');
      try {
        database.exec(`ALTER TABLE sample_records ADD COLUMN device_record_id TEXT DEFAULT ''`);
        console.log('[SQLite] Migration applied: sample_records.device_record_id added successfully');
        migrated++;
      } catch (err) {
        console.error('[SQLite] Migration failed: sample_records.device_record_id -', err.message);
      }
    } else {
      console.log('[SQLite] Migration skipped: sample_records.device_record_id already exists');
    }
  }

  // Migration 5: 为 dish_nutrition 添加 method, nutrition_notes, dietary_restrictions 列
  // syncToDisplay 写入这些字段，但旧版本地 SQLite 表定义缺少
  if (tableExists(database, 'dish_nutrition')) {
    const dnCols5 = [
      { name: 'method', def: "TEXT DEFAULT ''" },
      { name: 'nutrition_notes', def: "TEXT DEFAULT ''" },
      { name: 'dietary_restrictions', def: "TEXT DEFAULT ''" },
    ];
    const dnCurrentCols = getTableColumns(database, 'dish_nutrition');
    console.log('[SQLite] dish_nutrition current columns:', dnCurrentCols.join(', '));

    for (const col of dnCols5) {
      if (columnExists(database, 'dish_nutrition', col.name)) {
        console.log(`[SQLite] Migration skipped: dish_nutrition.${col.name} already exists`);
      } else {
        console.log(`[SQLite] Migration running: dish_nutrition.${col.name} not found, applying...`);
        try {
          database.exec(`ALTER TABLE dish_nutrition ADD COLUMN ${col.name} ${col.def}`);
          console.log(`[SQLite] Migration applied: dish_nutrition.${col.name} added successfully`);
          migrated++;
        } catch (err) {
          console.error(`[SQLite] Migration failed: dish_nutrition.${col.name} - ${err.message}`);
        }
      }
    }

    // 验证
    const dnFinalCols = getTableColumns(database, 'dish_nutrition');
    const dnMissing5 = dnCols5.filter((c) => !dnFinalCols.includes(c.name));
    if (dnMissing5.length > 0) {
      console.error(`[SQLite] CRITICAL: dish_nutrition 仍缺失列: ${dnMissing5.map((c) => c.name).join(', ')}`);
      for (const col of dnMissing5) {
        try {
          database.exec(`ALTER TABLE dish_nutrition ADD COLUMN ${col.name} ${col.def}`);
          migrated++;
        } catch (err) {
          console.error(`[SQLite] Force repair failed: dish_nutrition.${col.name} - ${err.message}`);
        }
      }
    } else {
      console.log('[SQLite] dish_nutrition schema verified: all sync columns present');
    }
  }

  // Migration: 为 dish_nutrition 添加 meal_type 列（留样柜设备需要按餐次分类）
  if (tableExists(database, 'dish_nutrition')) {
    if (!columnExists(database, 'dish_nutrition', 'meal_type')) {
      console.log('[SQLite] Migration running: dish_nutrition.meal_type not found, applying...');
      try {
        database.exec(`ALTER TABLE dish_nutrition ADD COLUMN meal_type INTEGER DEFAULT 1`);
        console.log('[SQLite] Migration applied: dish_nutrition.meal_type added successfully');
        migrated++;
      } catch (err) {
        console.error('[SQLite] Migration failed: dish_nutrition.meal_type -', err.message);
      }
    } else {
      console.log('[SQLite] Migration skipped: dish_nutrition.meal_type already exists');
    }
  }

  // Migration: 修复 dish_nutrition 唯一约束 —— 从 (dish_name, menu_date) 升级到 (dish_name, menu_date, meal_type)
  // 旧版约束只有两字段，导致早餐米饭和午餐米饭冲突（同日期同名菜品只能存在一次）
  const dnNewIdxName = 'idx_dish_nutrition_unique_v2';
  const dnOldIdxName = 'idx_dish_nutrition_unique';
  if (tableExists(database, 'dish_nutrition')) {
    if (!indexExists(database, dnNewIdxName)) {
      console.log('[SQLite] Migration running: upgrading dish_nutrition unique constraint to 3-column (dish_name, menu_date, meal_type)...');
      try {
        // 1. 先清理三字段组合上的真正重复数据（保留 id 最大的）
        let dupCount = 0;
        try {
          const dupRes = database.exec(`
            SELECT COUNT(*) FROM (
              SELECT t1.id FROM dish_nutrition AS t1
              WHERE EXISTS (
                SELECT 1 FROM dish_nutrition AS t2
                WHERE t2.dish_name = t1.dish_name
                  AND t2.menu_date = t1.menu_date
                  AND t2.meal_type = t1.meal_type
                  AND t2.id > t1.id
              )
            )
          `);
          if (dupRes && dupRes[0]?.values?.[0]) {
            dupCount = dupRes[0].values[0][0] || 0;
          }
        } catch { /* ignore */ }
        if (dupCount > 0) {
          console.log(`[SQLite] Migration: cleaning ${dupCount} true-duplicate rows in dish_nutrition (same name+date+meal)`);
          database.exec(`
            DELETE FROM dish_nutrition
            WHERE id IN (
              SELECT t1.id FROM dish_nutrition AS t1
              WHERE EXISTS (
                SELECT 1 FROM dish_nutrition AS t2
                WHERE t2.dish_name = t1.dish_name
                  AND t2.menu_date = t1.menu_date
                  AND t2.meal_type = t1.meal_type
                  AND t2.id > t1.id
              )
            )
          `);
        }
        // 2. 删除旧的 2 字段唯一索引
        if (indexExists(database, dnOldIdxName)) {
          database.exec(`DROP INDEX IF EXISTS ${dnOldIdxName}`);
          console.log('[SQLite] Migration: dropped old 2-column unique index');
        }
        // 3. 创建新的 3 字段唯一索引
        database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${dnNewIdxName} ON dish_nutrition (dish_name, menu_date, meal_type)`);
        console.log('[SQLite] Migration applied: new 3-column unique index created (breakfast/lunch/dinner can share same dish name)');
        migrated++;
      } catch (err) {
        console.error(`[SQLite] Migration failed for dish_nutrition 3-column constraint:`, err.message);
      }
    } else {
      console.log('[SQLite] Migration skipped: 3-column unique index already exists');
    }
  }

  // Migration: 彻底修复 dish_nutrition 表级 UNIQUE 约束（autoindex 无法通过 DROP INDEX 删除）
  // 旧版 CREATE TABLE ... UNIQUE(dish_name, menu_date) 创建的表级自动索引不会被显式 DROP INDEX 移除
  // 唯一修复方式：重建整张表
  if (tableExists(database, 'dish_nutrition')) {
    try {
      const createRes = database.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='dish_nutrition'");
      if (createRes && createRes.length > 0 && createRes[0].values && createRes[0].values[0]) {
        const createSqlStr = String(createRes[0].values[0][0] || '');
        const uniqMatch = createSqlStr.match(/UNIQUE\s*\(([^)]+)\)/i);
        if (uniqMatch) {
          const uniqCols = uniqMatch[1].split(',').map(function(c) { return c.trim().replace(/["'`]/g, ''); });
          // 如果 UNIQUE 约束只包含 2 个字段且不包含 meal_type，说明是旧表 → 重建
          if (uniqCols.length === 2 && !uniqCols.some(function(c) { return c === 'meal_type'; })) {
            console.log('[SQLite] DETECTED old 2-field table-level UNIQUE constraint! Rebuilding dish_nutrition table with 3-field constraint...');
            
            // Step 1: 备份所有数据
            const backupData = database.exec("SELECT * FROM dish_nutrition");
            
            // Step 2: 删除旧表（同时删除所有关联的索引和约束）
            database.exec("DROP TABLE IF EXISTS dish_nutrition");
            
            // Step 3: 创建新表（3 字段 UNIQUE 约束）
            database.exec("CREATE TABLE \"dish_nutrition\" (" +
              "id INTEGER PRIMARY KEY AUTOINCREMENT," +
              "dish_name TEXT NOT NULL," +
              "alias TEXT DEFAULT '[]'," +
              "category TEXT," +
              "calories_per_100g REAL NOT NULL DEFAULT 100," +
              "protein_per_100g REAL DEFAULT 0," +
              "fat_per_100g REAL DEFAULT 0," +
              "carbs_per_100g REAL DEFAULT 0," +
              "unit TEXT DEFAULT 'kcal'," +
              "method TEXT DEFAULT ''," +
              "nutrition_notes TEXT DEFAULT ''," +
              "dietary_restrictions TEXT DEFAULT ''," +
              "menu_date TEXT DEFAULT ''," +
              "meal_type INTEGER DEFAULT 1," +
              "img TEXT DEFAULT ''," +
              "created_at TEXT DEFAULT CURRENT_TIMESTAMP," +
              "updated_at TEXT DEFAULT CURRENT_TIMESTAMP," +
              "UNIQUE(dish_name, menu_date, meal_type)" +
            ")");
            
            // Step 4: 恢复数据（去重：同菜名+同日+同餐次只保留 id 最大的）
            if (backupData && backupData.length > 0 && backupData[0].values && backupData[0].values.length > 0) {
              var bkCols = backupData[0].columns;
              // 先按去重规则排序
              var seen = {};
              var rowsToInsert = [];
              // 按 id DESC 排序，先遇到的保留
              var sortedVals = backupData[0].values.slice().sort(function(a, b) {
                var idA = a[bkCols.indexOf('id')];
                var idB = b[bkCols.indexOf('id')];
                return (idB || 0) - (idA || 0);
              });
              for (var vi = 0; vi < sortedVals.length; vi++) {
                var row = sortedVals[vi];
                var dnIdx = bkCols.indexOf('dish_name');
                var mdIdx = bkCols.indexOf('menu_date');
                var mtIdx = bkCols.indexOf('meal_type');
                var key = (dnIdx >= 0 ? row[dnIdx] : '') + '|' + (mdIdx >= 0 ? row[mdIdx] : '') + '|' + (mtIdx >= 0 ? row[mtIdx] : '');
                if (!seen[key]) {
                  seen[key] = true;
                  rowsToInsert.push(row);
                }
              }
              for (var ri = 0; ri < rowsToInsert.length; ri++) {
                var r = rowsToInsert[ri];
                var vals = r.map(function(v) {
                  if (v === null || v === undefined) return 'NULL';
                  return "'" + String(v).replace(/'/g, "''") + "'";
                }).join(',');
                database.exec("INSERT INTO dish_nutrition (" + bkCols.join(',') + ") VALUES (" + vals + ")");
              }
              console.log('[SQLite] Table rebuild: restored ' + rowsToInsert.length + ' rows to dish_nutrition (deduped from ' + backupData[0].values.length + ')');
            }
            
            console.log('[SQLite] Migration applied: dish_nutrition table rebuilt with 3-column UNIQUE constraint');
            migrated++;
          }
        }
      }
    } catch (err) {
      console.warn('[SQLite] dish_nutrition table-level constraint check failed:', err.message);
    }
  }

  console.log(`[SQLite] Migration engine finished: ${migrated} migration(s) applied`);

  // 6. 新增 `keep_devices` 表（确保存在，用于留样柜设备管理）
  if (!tableExists(database, 'keep_devices')) {
    try {
      database.exec(`CREATE TABLE "keep_devices" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        device_sn TEXT UNIQUE,
        model TEXT DEFAULT 'MS-LYG-40OEZJ',
        cabinet_count INTEGER DEFAULT 12,
        status TEXT DEFAULT 'offline',
        last_heartbeat TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
      console.log('[SQLite] Table created: keep_devices');
      migrated++;
    } catch (err) {
      console.error('[SQLite] Failed to create table keep_devices:', err.message);
    }
  }

  console.log(`[SQLite] Migration engine finished: ${migrated} migration(s) applied`);

  // Migration 6: 为 keep_devices 添加 cabinet_count 列
  if (tableExists(database, 'keep_devices')) {
    if (!columnExists(database, 'keep_devices', 'cabinet_count')) {
      console.log('[SQLite] Migration running: keep_devices.cabinet_count not found, applying...');
      try {
        database.exec(`ALTER TABLE keep_devices ADD COLUMN cabinet_count INTEGER DEFAULT 12`);
        console.log('[SQLite] Migration applied: keep_devices.cabinet_count added successfully');
        migrated++;
      } catch (err) {
        console.error('[SQLite] Migration failed: keep_devices.cabinet_count -', err.message);
      }
    } else {
      console.log('[SQLite] Migration skipped: keep_devices.cabinet_count already exists');
    }
  }

  // Migration 7: 修复 sample_records 中 status 为 NULL 或空字符串的记录
  if (tableExists(database, 'sample_records')) {
    try {
      const fixRes = database.exec(`UPDATE sample_records SET status = 'stored' WHERE status IS NULL OR status = ''`);
      const changes = database.getRowsModified();
      if (changes > 0) {
        console.log(`[SQLite] Migration applied: fixed ${changes} sample_records with NULL/empty status to 'stored'`);
        migrated++;
      } else {
        console.log('[SQLite] Migration skipped: no sample_records with NULL/empty status found');
      }
    } catch (err) {
      console.warn('[SQLite] Migration fix sample_records status failed:', err.message);
    }
  }

  // Migration 9: 确保 product_custom_fields 有营养字段（旧版升级后可能表存在但数据为空）
  if (tableExists(database, 'product_custom_fields')) {
    const fieldCount = database.exec("SELECT COUNT(*) as cnt FROM product_custom_fields");
    const fieldCountVal = fieldCount?.[0]?.values?.[0]?.[0] || 0;
    if (fieldCountVal === 0) {
      console.log('[SQLite] Migration running: product_custom_fields is empty, seeding nutrition fields...');
      const fields = [
        ['calories', 'number', 1],
        ['protein', 'number', 2],
        ['fat', 'number', 3],
        ['carbs', 'number', 4],
        ['fiber', 'number', 5],
        ['method', 'text', 6],
        ['nutrition', 'text', 7],
        ['contraindications', 'text', 8],
      ];
      for (const [name, fieldType, sort] of fields) {
        database.exec(
          `INSERT INTO product_custom_fields (name, field_type, options, required, sort_order, created_at) VALUES ('${name}', '${fieldType}', '[]', 0, ${sort}, datetime('now'))`
        );
      }
      console.log(`[SQLite] Migration applied: seeded ${fields.length} product_custom_fields`);
      migrated++;
    } else {
      console.log(`[SQLite] Migration skipped: product_custom_fields has ${fieldCountVal} rows`);
    }
  }

  // Migration 10: 修复 tray_display_devices 临时菜品价格配置
  // max_price_temp_dish=100 会导致设备自动生成 200 个临时菜品，应该为 0（禁用）
  if (tableExists(database, 'tray_display_devices')) {
    try {
      const wrongRows = database.exec("SELECT COUNT(*) as cnt FROM tray_display_devices WHERE max_price_temp_dish > 0");
      const wrongCount = wrongRows?.[0]?.values?.[0]?.[0] || 0;
      if (wrongCount > 0) {
        database.exec("UPDATE tray_display_devices SET max_price_temp_dish = 0, interval_price_temp_dish = 0, min_price_temp_dish = 0 WHERE max_price_temp_dish > 0");
        console.log(`[SQLite] Migration applied: fixed ${wrongCount} tray_display_devices with non-zero temp dish price (临时菜品已禁用)`);
        migrated++;
      } else {
        console.log('[SQLite] Migration skipped: tray_display_devices temp dish price already 0');
      }
    } catch (err) {
      console.warn('[SQLite] Migration fix temp dish price failed:', err.message);
    }
  }

  // Migration 8: 新增 keep_door_records 表（留样柜开门/关门记录）
  if (!tableExists(database, 'keep_door_records')) {
    try {
      database.exec(`CREATE TABLE "keep_door_records" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_sn TEXT DEFAULT '',
        door_num TEXT NOT NULL,
        event_type TEXT NOT NULL DEFAULT 'open',
        reason TEXT DEFAULT '',
        operator TEXT DEFAULT '',
        dish_name TEXT DEFAULT '',
        recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
      console.log('[SQLite] Table created: keep_door_records');
      migrated++;
    } catch (err) {
      console.error('[SQLite] Failed to create table keep_door_records:', err.message);
    }
  } else {
    console.log('[SQLite] Migration skipped: keep_door_records already exists');
  }

  // Migration 11: 为 environment_readings 表添加 updated_at 列
  // 旧版本建表时没有此列，导致 MQTT 传感器数据写入失败
  if (tableExists(database, 'environment_readings')) {
    if (!columnExists(database, 'environment_readings', 'updated_at')) {
      console.log('[SQLite] Migration running: environment_readings.updated_at not found, applying...');
      try {
        database.exec(`ALTER TABLE environment_readings ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP`);
        console.log('[SQLite] Migration applied: environment_readings.updated_at added successfully');
        migrated++;
      } catch (err) {
        console.error('[SQLite] Migration failed: environment_readings.updated_at -', err.message);
      }
    } else {
      console.log('[SQLite] Migration skipped: environment_readings.updated_at already exists');
    }
  }

  // Migration 12: 将 tray_display_devices 中的传感器网关记录标记为 gateway 类型
  // 旧版本把传感器网关错误地注册到了电子屏设备表，导致电子屏设备列表混入传感器网关
  if (tableExists(database, 'tray_display_devices')) {
    try {
      const gatewayRows = database.exec(
        "SELECT COUNT(*) as cnt FROM tray_display_devices WHERE name LIKE '%传感器网关%' AND (device_type IS NULL OR device_type != 'gateway')"
      );
      const gatewayCount = gatewayRows && gatewayRows[0] && gatewayRows[0].values && gatewayRows[0].values[0]
        ? (gatewayRows[0].values[0][0] || 0)
        : 0;
      if (gatewayCount > 0) {
        database.exec(
          "UPDATE tray_display_devices SET device_type = 'gateway' WHERE name LIKE '%传感器网关%'"
        );
        console.log(`[SQLite] Migration 12: fixed ${gatewayCount} gateway records in tray_display_devices`);
        migrated++;
      } else {
        console.log('[SQLite] Migration 12 skipped: no misclassified gateway records found');
      }
    } catch (err) {
      console.warn('[SQLite] Migration 12 failed:', err.message);
    }
  }

  // Migration 14: 清理 tray_display_devices 重复 SN 记录，并建 UNIQUE 索引防止后续重复注册
  // 根本原因：sn 列没有 UNIQUE 约束，设备每次重启/重连都 INSERT 新记录，导致数量翻倍
  const tddSnIdxName = 'idx_tray_display_devices_sn_unique';
  if (tableExists(database, 'tray_display_devices')) {
    if (!indexExists(database, tddSnIdxName)) {
      console.log('[SQLite] Migration 14: cleaning duplicate SN records in tray_display_devices...');
      try {
        // 统计重复数量
        const dupRes = database.exec(
          'SELECT COUNT(*) FROM (SELECT t1.id FROM tray_display_devices AS t1 WHERE EXISTS (SELECT 1 FROM tray_display_devices AS t2 WHERE t2.sn = t1.sn AND t2.id > t1.id))'
        );
        const dupCount = dupRes && dupRes[0] && dupRes[0].values && dupRes[0].values[0] ? (dupRes[0].values[0][0] || 0) : 0;
        if (dupCount > 0) {
          console.log('[SQLite] Migration 14: found ' + dupCount + ' duplicate SN rows, keeping newest per SN');
          // 保留每个 SN 中 id 最大的记录（最新注册的），删除旧的重复记录
          database.exec(
            'DELETE FROM tray_display_devices WHERE id IN (SELECT t1.id FROM tray_display_devices AS t1 WHERE EXISTS (SELECT 1 FROM tray_display_devices AS t2 WHERE t2.sn = t1.sn AND t2.id > t1.id))'
          );
          console.log('[SQLite] Migration 14: cleaned ' + dupCount + ' duplicate records');
        } else {
          console.log('[SQLite] Migration 14: no duplicate SN records found');
        }
        // 建唯一索引，防止以后再重复
        database.exec('CREATE UNIQUE INDEX IF NOT EXISTS ' + tddSnIdxName + ' ON tray_display_devices (sn)');
        console.log('[SQLite] Migration 14: unique index on tray_display_devices.sn created');
        migrated++;
      } catch (err) {
        console.warn('[SQLite] Migration 14 failed:', err.message);
      }
    } else {
      console.log('[SQLite] Migration 14 skipped: unique index on tray_display_devices.sn already exists');
    }
  }

  // Migration 13: 确保 gateway_sensor_bindings 表存在
  if (!tableExists(database, 'gateway_sensor_bindings')) {
    try {
      database.exec(
        'CREATE TABLE "gateway_sensor_bindings" (' +
        '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '  gateway_sn TEXT NOT NULL,' +
        '  device_sn TEXT,' +
        '  device_type TEXT NOT NULL,' +
        '  device_type_name TEXT,' +
        '  device_name TEXT,' +
        '  device_no TEXT,' +
        '  zone TEXT,' +
        '  protocol TEXT DEFAULT \'modbus_tcp\',' +
        '  mqtt_topic TEXT,' +
        '  slave_addr INTEGER,' +
        '  enabled INTEGER DEFAULT 0,' +
        '  created_at TEXT DEFAULT (datetime(\'now\', \'localtime\')),' +
        '  updated_at TEXT DEFAULT (datetime(\'now\', \'localtime\'))' +
        ')'
      );
      console.log('[SQLite] Migration 13: gateway_sensor_bindings table created');
      migrated++;
    } catch (err) {
      console.log('[SQLite] Migration 13 skipped (table may already exist):', err.message);
    }
  } else {
    console.log('[SQLite] Migration 13 skipped: gateway_sensor_bindings already exists');
  }

  // Migration 15: 为 devices 表添加 gateway_ip 列（单独存储 Modbus TCP 网关 IP，与厂商SN分离）
  if (tableExists(database, 'devices')) {
    if (!columnExists(database, 'devices', 'gateway_ip')) {
      console.log('[SQLite] Migration 15: devices.gateway_ip not found, applying...');
      try {
        database.exec('ALTER TABLE devices ADD COLUMN gateway_ip TEXT');
        console.log('[SQLite] Migration 15: devices.gateway_ip added successfully');
        migrated++;
      } catch (err) {
        console.warn('[SQLite] Migration 15 failed:', err.message);
      }
    } else {
      console.log('[SQLite] Migration 15 skipped: devices.gateway_ip already exists');
    }
  }

  // Migration 17: 为 suppliers 表添加 code 和 score 列（旧表可能缺失）
  if (tableExists(database, 'suppliers')) {
    if (!columnExists(database, 'suppliers', 'code')) {
      console.log('[SQLite] Migration 17a: suppliers.code not found, applying...');
      try {
        database.exec("ALTER TABLE suppliers ADD COLUMN code TEXT");
        // 自动生成 code 按 GYS+id 格式
        database.exec("UPDATE suppliers SET code = 'GYS' || SUBSTR('000' || id, -3) WHERE code IS NULL");
        console.log('[SQLite] Migration 17a: suppliers.code added and populated');
        migrated++;
      } catch (err) {
        console.error('[SQLite] Migration 17a failed:', err.message);
      }
    }
    if (!columnExists(database, 'suppliers', 'score')) {
      console.log('[SQLite] Migration 17b: suppliers.score not found, applying...');
      try {
        database.exec("ALTER TABLE suppliers ADD COLUMN score REAL DEFAULT 5.0");
        console.log('[SQLite] Migration 17b: suppliers.score added');
        migrated++;
      } catch (err) {
        console.error('[SQLite] Migration 17b failed:', err.message);
      }
    }
  }

  // Migration 18: 确保 warehouses 表存在（旧版可能没有）
  if (!tableExists(database, 'warehouses')) {
    console.log('[SQLite] Migration 18: warehouses table not found, creating...');
    try {
      database.exec(`CREATE TABLE "warehouses" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        address TEXT,
        manager TEXT,
        phone TEXT,
        is_active INTEGER DEFAULT 1,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
      console.log('[SQLite] Migration 18: warehouses table created');
      migrated++;
    } catch (err) {
      console.error('[SQLite] Migration 18 failed:', err.message);
    }
  } else {
    // 确保 warehouses 有 manager 和 phone 列
    if (!columnExists(database, 'warehouses', 'manager')) {
      try { database.exec("ALTER TABLE warehouses ADD COLUMN manager TEXT"); migrated++; } catch (e) {}
    }
    if (!columnExists(database, 'warehouses', 'phone')) {
      try { database.exec("ALTER TABLE warehouses ADD COLUMN phone TEXT"); migrated++; } catch (e) {}
    }
    if (!columnExists(database, 'warehouses', 'notes')) {
      try { database.exec("ALTER TABLE warehouses ADD COLUMN notes TEXT"); migrated++; } catch (e) {}
    }
    if (!columnExists(database, 'warehouses', 'updated_at')) {
      try { database.exec("ALTER TABLE warehouses ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP"); migrated++; } catch (e) {}
    }
  }

  // Migration 16: 为 device_dish_cache 添加 category 列
  // resolveDishNameSmart 查询 `SELECT dish_name, category FROM device_dish_cache`，
  // 但旧版表没有 category 列（category 只在 dish_data JSON 里）
  if (tableExists(database, 'device_dish_cache')) {
    if (!columnExists(database, 'device_dish_cache', 'category')) {
      console.log('[SQLite] Migration 16: device_dish_cache.category not found, applying...');
      try {
        database.exec("ALTER TABLE device_dish_cache ADD COLUMN category TEXT DEFAULT ''");
        console.log('[SQLite] Migration 16: device_dish_cache.category added successfully');
        // 从 dish_data JSON 中回填已有的 category 数据
        try {
          const rows = database.exec("SELECT device_sn, dish_data FROM device_dish_cache WHERE (category IS NULL OR category = '') AND dish_data IS NOT NULL AND dish_data != ''");
          if (rows && rows.length > 0 && rows[0].values) {
            let backfilled = 0;
            for (const row of rows[0].values) {
              try {
                const data = JSON.parse(row[1] || '');
                if (data.category) {
                  database.run("UPDATE device_dish_cache SET category = ? WHERE device_sn = ?", [data.category, row[0]]);
                  backfilled++;
                }
              } catch {}
            }
            if (backfilled > 0) console.log('[SQLite] Migration 16: backfilled ' + backfilled + ' category values from dish_data JSON');
          }
        } catch (e) { console.warn('[SQLite] Migration 16 backfill failed:', e.message); }
        migrated++;
      } catch (err) {
        console.warn('[SQLite] Migration 16 failed:', err.message);
      }
    } else {
      console.log('[SQLite] Migration 16 skipped: device_dish_cache.category already exists');
    }
  }

  // Migration 19: 为 acceptance_records 添加 inbound_material_id 和 supplier_id 列
  // 入库电子秤提交时写入这两个关联字段，旧版本地表缺失导致本地 SQLite 写入报 no such column，
  // 进而导致「后台入库记录为空」。纯局域网环境下必须修本地表，而不是云端。
  if (tableExists(database, 'acceptance_records')) {
    if (!columnExists(database, 'acceptance_records', 'inbound_material_id')) {
      console.log('[SQLite] Migration 19a: acceptance_records.inbound_material_id not found, applying...');
      try {
        database.exec('ALTER TABLE acceptance_records ADD COLUMN inbound_material_id INTEGER');
        console.log('[SQLite] Migration 19a: acceptance_records.inbound_material_id added successfully');
        migrated++;
      } catch (err) {
        console.error('[SQLite] Migration 19a failed:', err.message);
      }
    } else {
      console.log('[SQLite] Migration 19a skipped: acceptance_records.inbound_material_id already exists');
    }
    if (!columnExists(database, 'acceptance_records', 'supplier_id')) {
      console.log('[SQLite] Migration 19b: acceptance_records.supplier_id not found, applying...');
      try {
        database.exec('ALTER TABLE acceptance_records ADD COLUMN supplier_id INTEGER');
        console.log('[SQLite] Migration 19b: acceptance_records.supplier_id added successfully');
        migrated++;
      } catch (err) {
        console.error('[SQLite] Migration 19b failed:', err.message);
      }
    } else {
      console.log('[SQLite] Migration 19b skipped: acceptance_records.supplier_id already exists');
    }
  }

  return migrated;
}

function ensureTables(database) {
  const tableDefinitions = [
    {
      name: 'acceptance_records',
      sql: `CREATE TABLE "acceptance_records" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_no TEXT NOT NULL,
        accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ingredient TEXT NOT NULL,
        supplier TEXT DEFAULT '',
        expected REAL DEFAULT 0,
        actual REAL DEFAULT 0,
        deviation REAL DEFAULT 0,
        unit TEXT DEFAULT 'kg',
        inspector TEXT DEFAULT '',
        certificates TEXT DEFAULT '[]',
        status TEXT DEFAULT 'pass',
        inbound_at TEXT,
        inbound_status TEXT DEFAULT 'pending',
        inbound_remark TEXT DEFAULT '',
        inbound_material_id INTEGER,
        supplier_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'environment_readings',
      sql: `CREATE TABLE "environment_readings" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        zone TEXT NOT NULL,
        sensor_id TEXT DEFAULT '',
        pm25 REAL,
        pm10 REAL,
        temp REAL,
        humidity REAL,
        co2 REAL,
        recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        source TEXT DEFAULT 'manual',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'environment_zones',
      sql: `CREATE TABLE "environment_zones" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'sample_records',
      sql: `CREATE TABLE "sample_records" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_no TEXT NOT NULL,
        sampled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        meal TEXT NOT NULL,
        dish TEXT NOT NULL,
        weight REAL DEFAULT 0,
        cabinet_id TEXT DEFAULT 'CB-01',
        slot TEXT DEFAULT '',
        expire_at TEXT,
        status TEXT DEFAULT 'stored',
        operator TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        device_record_id TEXT DEFAULT '',
        photo_url TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'ai_recognition_events',
      sql: `CREATE TABLE "ai_recognition_events" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_code TEXT NOT NULL,
        camera_id TEXT NOT NULL,
        camera_name TEXT NOT NULL,
        camera_location TEXT,
        event_type TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'medium',
        confidence INTEGER DEFAULT 0,
        description TEXT,
        snapshot_url TEXT,
        status TEXT NOT NULL DEFAULT 'unread',
        handled_at TEXT,
        handled_note TEXT,
        event_time TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'tray_stations',
      sql: `CREATE TABLE "tray_stations" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        dish_id TEXT,
        dish_name TEXT,
        station_code TEXT NOT NULL,
        location TEXT DEFAULT '取餐区',
        is_active INTEGER DEFAULT 1,
        tare_weight REAL DEFAULT 0,
        capacity_max INTEGER DEFAULT 50,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        product_item_id INTEGER,
        hw_ip TEXT,
        hw_port INTEGER DEFAULT 8080,
        hw_sn TEXT,
        hw_enabled INTEGER DEFAULT 0,
        hw_last_seen TEXT,
        hw_last_weight REAL
      )`,
    },
    {
      name: 'tray_pickup_logs',
      sql: `CREATE TABLE "tray_pickup_logs" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id INTEGER,
        station_code TEXT NOT NULL,
        dish_name TEXT NOT NULL,
        category TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        pickup_time TEXT DEFAULT CURRENT_TIMESTAMP,
        weight_before REAL,
        weight_after REAL,
        pickup_weight REAL,
        pickup_portions INTEGER DEFAULT 1,
        person_id TEXT,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        calories REAL DEFAULT 0,
        protein REAL DEFAULT 0,
        fat REAL DEFAULT 0,
        carbs REAL DEFAULT 0,
        source TEXT DEFAULT 'manual'
      )`,
    },
    {
      name: 'alarm_events',
      sql: `CREATE TABLE "alarm_events" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alarm_code TEXT NOT NULL,
        occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        alarm_type TEXT NOT NULL DEFAULT '烟感报警',
        level TEXT NOT NULL DEFAULT 'high',
        sensor_id TEXT,
        zone TEXT,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unconfirmed',
        operator TEXT,
        source TEXT DEFAULT 'sensor',
        raw_value REAL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'product_items',
      sql: `CREATE TABLE "product_items" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category_id INTEGER,
        status TEXT NOT NULL DEFAULT 'draft',
        description TEXT,
        pricing_mode INTEGER DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        price REAL DEFAULT 0,
        stock INTEGER DEFAULT 0,
        discount_enabled INTEGER DEFAULT 0,
        discount_price REAL,
        media TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'product_categories',
      sql: `CREATE TABLE "product_categories" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'product_variants',
      sql: `CREATE TABLE "product_variants" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        options TEXT NOT NULL DEFAULT '[]',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'product_skus',
      sql: `CREATE TABLE "product_skus" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        label TEXT,
        options TEXT NOT NULL DEFAULT '[]',
        price REAL DEFAULT 0,
        stock INTEGER DEFAULT 0,
        discount_enabled INTEGER DEFAULT 0,
        discount_price REAL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'product_custom_fields',
      sql: `CREATE TABLE "product_custom_fields" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        field_type TEXT NOT NULL DEFAULT 'text',
        options TEXT DEFAULT '[]',
        required INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'product_custom_values',
      sql: `CREATE TABLE "product_custom_values" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        field_id INTEGER NOT NULL,
        value TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id, field_id)
      )`,
    },
    {
      name: 'order_headers',
      sql: `CREATE TABLE "order_headers" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id TEXT,
        status TEXT,
        customer_notes TEXT,
        admin_notes TEXT,
        tracking_number TEXT,
        currency TEXT NOT NULL DEFAULT 'USD',
        shipping_total REAL DEFAULT 0,
        tax_total REAL DEFAULT 0,
        subtotal_items REAL DEFAULT 0,
        discount_price REAL DEFAULT 0,
        payment_provider TEXT,
        checkout_session_id TEXT,
        payment_id TEXT,
        recipient TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'order_items',
      sql: `CREATE TABLE "order_items" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        sku_id TEXT,
        sku_label TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL,
        final_price REAL DEFAULT 0,
        subtotal REAL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'suppliers',
      sql: `CREATE TABLE "suppliers" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT,
        contact TEXT,
        phone TEXT,
        address TEXT,
        category TEXT DEFAULT '综合',
        score REAL DEFAULT 5.0,
        is_active INTEGER DEFAULT 1,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'warehouses',
      sql: `CREATE TABLE "warehouses" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        address TEXT,
        manager TEXT,
        phone TEXT,
        is_active INTEGER DEFAULT 1,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'dish_nutrition',
      sql: `CREATE TABLE "dish_nutrition" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dish_name TEXT NOT NULL,
        alias TEXT DEFAULT '[]',
        category TEXT,
        calories_per_100g REAL NOT NULL DEFAULT 100,
        protein_per_100g REAL DEFAULT 0,
        fat_per_100g REAL DEFAULT 0,
        carbs_per_100g REAL DEFAULT 0,
        unit TEXT DEFAULT 'kcal',
        method TEXT DEFAULT '',
        nutrition_notes TEXT DEFAULT '',
        dietary_restrictions TEXT DEFAULT '',
        menu_date TEXT DEFAULT '',
        meal_type INTEGER DEFAULT 1,
        img TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(dish_name, menu_date, meal_type)
      )`,
    },
    {
      name: 'display_configs',
      sql: `CREATE TABLE "display_configs" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_key TEXT NOT NULL DEFAULT 'display_config',
        config_data TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'display_season_config',
      sql: `CREATE TABLE "display_season_config" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term_name TEXT NOT NULL,
        next_term_name TEXT DEFAULT '',
        foods TEXT DEFAULT '[]',
        health_tip TEXT DEFAULT '',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'display_finance_config',
      sql: `CREATE TABLE "display_finance_config" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        income REAL DEFAULT 0,
        expense REAL DEFAULT 0,
        balance REAL DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'display_finance_history',
      sql: `CREATE TABLE "display_finance_history" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year_month TEXT NOT NULL,
        income REAL DEFAULT 0,
        expense REAL DEFAULT 0,
        balance REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(year_month)
      )`,
    },
    {
      name: 'camera_configs',
      sql: `CREATE TABLE "camera_configs" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_key TEXT NOT NULL,
        config_data TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'dish_likes',
      sql: `CREATE TABLE "dish_likes" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dish_id INTEGER NOT NULL,
        dish_name TEXT DEFAULT '',
        like_count INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'dish_order_records',
      sql: `CREATE TABLE "dish_order_records" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dish_id INTEGER NOT NULL,
        dish_name TEXT DEFAULT '',
        category TEXT DEFAULT '',
        device_info TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'dish_ratings',
      sql: `CREATE TABLE "dish_ratings" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dish_id INTEGER NOT NULL,
        rating_type TEXT NOT NULL CHECK (rating_type IN ('good', 'average', 'bad')),
        count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(dish_id, rating_type)
      )`,
    },
    {
      name: 'tray_display_devices',
      sql: `CREATE TABLE "tray_display_devices" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sn TEXT NOT NULL,
        hw_key TEXT NOT NULL,
        station_id INTEGER,
        location TEXT DEFAULT '',
        status TEXT DEFAULT 'offline',
        last_seen TEXT,
        notes TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_pull_at TEXT,
        token TEXT,
        device_type TEXT DEFAULT 'display_scale',
        max_price_temp_dish REAL DEFAULT 0,
        interval_price_temp_dish REAL DEFAULT 0,
        min_price_temp_dish REAL DEFAULT 0,
        bind_plate_before_take INTEGER DEFAULT 1,
        ui_template INTEGER DEFAULT 1,
        weigh_alarm_model INTEGER DEFAULT 1,
        min_settlement_weight INTEGER DEFAULT 10,
        stable_difference INTEGER DEFAULT 2,
        alarm_below_grams INTEGER DEFAULT -1000,
        max_weight_dish INTEGER DEFAULT 5000,
        bind_mode TEXT DEFAULT 'all',
        bind_value TEXT DEFAULT '',
        meal_type INTEGER
      )`,
    },
    {
      name: 'devices',
      sql: `CREATE TABLE "devices" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_model TEXT NOT NULL,
        device_name TEXT NOT NULL,
        device_number TEXT NOT NULL,
        device_sn TEXT NOT NULL,
        device_type TEXT DEFAULT 'temp_humidity',
        zone TEXT,
        cafeteria_name TEXT,
        location TEXT,
        maintenance_cycle TEXT DEFAULT 'monthly',
        socket_meter_id INTEGER,
        gateway_sn TEXT,
        gateway_ip TEXT,
        communication_address INTEGER,
        temp_low_threshold REAL,
        temp_high_threshold REAL,
        humidity_low_threshold REAL,
        humidity_high_threshold REAL,
        status TEXT DEFAULT 'offline',
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'scale_devices',
      sql: `CREATE TABLE "scale_devices" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_no TEXT NOT NULL,
        device_name TEXT NOT NULL,
        device_sn TEXT NOT NULL,
        device_ip TEXT,
        device_key TEXT NOT NULL,
        gateway TEXT,
        install_address TEXT,
        device_mac TEXT,
        zone TEXT NOT NULL DEFAULT '',
        canteen TEXT NOT NULL DEFAULT '',
        stall TEXT,
        password TEXT,
        max_capacity REAL,
        precision_value REAL,
        unit TEXT,
        division_value REAL,
        comm_protocol TEXT,
        status TEXT DEFAULT 'active',
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'inbound_materials',
      sql: `CREATE TABLE "inbound_materials" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category_name TEXT NOT NULL DEFAULT '',
        unit TEXT,
        unit_price REAL DEFAULT 0,
        supplier_id INTEGER,
        material_type INTEGER DEFAULT 1,
        bar_code TEXT,
        is_active INTEGER DEFAULT 1,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'scale_operators',
      sql: `CREATE TABLE "scale_operators" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_sn TEXT NOT NULL,
        work_no TEXT NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'operator',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(device_sn, work_no)
      )`,
    },
    {
      name: 'meal_period_config',
      sql: `CREATE TABLE "meal_period_config" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meal_type INTEGER NOT NULL UNIQUE,
        meal_name TEXT NOT NULL,
        start_time TEXT NOT NULL DEFAULT '05:00',
        end_time TEXT NOT NULL DEFAULT '10:00',
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      name: 'device_dish_cache',
      sql: `CREATE TABLE "device_dish_cache" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_sn TEXT NOT NULL,
        station_id INTEGER,
        dish_id INTEGER,
        dish_name TEXT,
        category TEXT DEFAULT '',
        dish_data TEXT NOT NULL DEFAULT '',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(device_sn)
      )`,
    },
  ];

  let created = 0;
  for (const { name, sql } of tableDefinitions) {
    const exists = tableExists(database, name);
    if (exists) continue;
    try {
      database.exec(sql);
      console.log(`[SQLite] Table created: ${name}`);
      created++;
    } catch (err) {
      console.error(`[SQLite] Failed to create table ${name}:`, err.message);
    }
  }
  return created;
}

function seedData(database) {
  let seeded = 0;
  console.log('[SQLite] Seed engine started...');

  // ── 种子数据：菜品分类 ──
  const catCount = database.exec("SELECT COUNT(*) as cnt FROM product_categories");
  const catCountVal = catCount?.[0]?.values?.[0]?.[0] || 0;
  if (catCountVal === 0) {
    const categories = [
      ['热菜', 1], ['凉菜', 2], ['主食', 3], ['汤品', 4],
      ['面点', 5], ['小吃', 6], ['饮品', 7], ['套餐', 8],
    ];
    for (const [name, sort] of categories) {
      database.exec(
        `INSERT INTO product_categories (name, sort_order, created_at, updated_at) VALUES ('${name}', ${sort}, datetime('now'), datetime('now'))`
      );
    }
    console.log(`[SQLite] Seeded ${categories.length} product_categories`);
    seeded++;
  } else {
    console.log(`[SQLite] Seed skipped: product_categories has ${catCountVal} rows`);
  }

  // ── 种子数据：自定义字段 ──
  const fieldCount = database.exec("SELECT COUNT(*) as cnt FROM product_custom_fields");
  const fieldCountVal = fieldCount?.[0]?.values?.[0]?.[0] || 0;
  if (fieldCountVal === 0) {
    const fields = [
      ['calories', 'number', 1],
      ['protein', 'number', 2],
      ['fat', 'number', 3],
      ['carbs', 'number', 4],
      ['fiber', 'number', 5],
      ['method', 'text', 6],
      ['nutrition', 'text', 7],
      ['contraindications', 'text', 8],
    ];
    for (const [name, fieldType, sort] of fields) {
      database.exec(
        `INSERT INTO product_custom_fields (name, field_type, options, required, sort_order, created_at) VALUES ('${name}', '${fieldType}', '[]', 0, ${sort}, datetime('now'))`
      );
    }
    console.log(`[SQLite] Seeded ${fields.length} product_custom_fields`);
    seeded++;
  } else {
    console.log(`[SQLite] Seed skipped: product_custom_fields has ${fieldCountVal} rows`);
  }

  // ── 种子数据：环境区域 ──
  if (tableExists(database, 'environment_zones')) {
    const zoneCount = database.exec("SELECT COUNT(*) as cnt FROM environment_zones");
    const zoneCountVal = zoneCount?.[0]?.values?.[0]?.[0] || 0;
    if (zoneCountVal === 0) {
      const zones = [
        ['面点加工间', 1], ['冷菜加工间', 2], ['操作间', 3],
        ['蔬菜加工间', 4], ['肉类加工间', 5], ['主食库房', 6],
        ['管理办公室', 7],
      ];
      for (const [name, sort] of zones) {
        database.exec(
          `INSERT INTO environment_zones (name, sort_order, enabled, created_at) VALUES ('${name}', ${sort}, 1, datetime('now'))`
        );
      }
      console.log(`[SQLite] Seeded ${zones.length} environment_zones`);
      seeded++;
    } else {
      console.log(`[SQLite] Seed skipped: environment_zones has ${zoneCountVal} rows`);
    }
  }

  // ── 种子数据：菜品（product_items） ──
  if (tableExists(database, 'product_items')) {
    const dishCount = database.exec("SELECT COUNT(*) as cnt FROM product_items");
    const dishCountVal = dishCount?.[0]?.values?.[0]?.[0] || 0;
    if (dishCountVal === 0) {
      const dishes = [
        // [name, category_id, price, description]
        ['红烧肉', 1, 15, '经典本帮红烧肉，肥而不腻，入口即化'],
        ['宫保鸡丁', 1, 12, '经典川味宫保鸡丁，麻辣鲜香'],
        ['清炒时蔬', 1, 8, '当日新鲜时蔬清炒，健康低脂'],
        ['鱼香肉丝', 1, 12, '经典川菜鱼香肉丝，酸甜可口'],
        ['糖醋排骨', 1, 16, '外酥里嫩糖醋排骨，老少皆宜'],
        ['番茄炒蛋', 1, 8, '家常番茄炒蛋，营养美味'],
        ['干煸四季豆', 1, 10, '干煸四季豆，咸香下饭'],
        ['回锅肉', 1, 14, '正宗回锅肉，肥瘦相间，酱香浓郁'],
        ['凉拌黄瓜', 2, 5, '爽脆凉拌黄瓜，蒜香开胃'],
        ['皮蛋豆腐', 2, 6, '经典皮蛋豆腐，嫩滑爽口'],
        ['凉拌木耳', 2, 6, '凉拌黑木耳，脆嫩爽口'],
        ['口水鸡', 2, 12, '麻辣口水鸡，鲜嫩多汁'],
        ['米饭', 3, 2, '东北优质大米，粒粒分明'],
        ['馒头', 3, 1, '手工白面馒头，松软香甜'],
        ['蛋炒饭', 3, 8, '经典蛋炒饭，粒粒金黄'],
        ['紫菜蛋花汤', 4, 3, '紫菜蛋花汤，鲜美清淡'],
        ['番茄蛋汤', 4, 3, '番茄蛋花汤，酸甜开胃'],
        ['酸辣汤', 4, 4, '酸辣汤，开胃暖身'],
        ['包子', 5, 2, '鲜肉包子，皮薄馅大'],
        ['花卷', 5, 1.5, '葱油花卷，层层松软'],
        ['春卷', 6, 6, '香脆春卷，外酥里嫩'],
        ['豆浆', 7, 2, '现磨豆浆，香浓醇厚'],
        ['两荤一素套餐', 8, 18, '两荤一素搭配，经济实惠，含米饭'],
        ['一荤两素套餐', 8, 14, '一荤两素搭配，营养均衡，含米饭'],
      ];
      for (const [name, catId, price, desc] of dishes) {
        database.exec(
          `INSERT INTO product_items (name, category_id, status, description, price, stock, currency, media, created_at, updated_at) VALUES ('${name.replace(/'/g, "''")}', ${catId}, 'active', '${desc.replace(/'/g, "''")}', ${price}, 999, 'CNY', '[]', datetime('now'), datetime('now'))`
        );
      }
      console.log(`[SQLite] Seeded ${dishes.length} product_items`);
      seeded++;

      // 写入菜品对应的营养自定义值（calories, protein, fat, carbs）
      // 自定义字段 ID 参照种子数据顺序: calories=1, protein=2, fat=3, carbs=4
      const nutritionData = {
        '红烧肉': [280, 12, 22, 8],
        '宫保鸡丁': [220, 18, 14, 6],
        '清炒时蔬': [60, 3, 2, 8],
        '鱼香肉丝': [180, 14, 10, 8],
        '糖醋排骨': [300, 15, 20, 12],
        '番茄炒蛋': [120, 8, 7, 6],
        '干煸四季豆': [90, 4, 5, 8],
        '回锅肉': [260, 16, 20, 6],
        '凉拌黄瓜': [30, 1, 0.5, 5],
        '皮蛋豆腐': [90, 7, 5, 3],
        '凉拌木耳': [50, 2, 1, 8],
        '口水鸡': [200, 20, 12, 3],
        '米饭': [116, 3, 0.3, 26],
        '馒头': [110, 4, 0.5, 23],
        '蛋炒饭': [180, 7, 6, 24],
        '紫菜蛋花汤': [40, 3, 1, 4],
        '番茄蛋汤': [45, 2, 1, 6],
        '酸辣汤': [50, 3, 1, 6],
        '包子': [150, 7, 4, 20],
        '花卷': [120, 4, 1, 24],
        '春卷': [180, 5, 10, 16],
        '豆浆': [30, 3, 1.5, 2],
        '两荤一素套餐': [550, 28, 22, 40],
        '一荤两素套餐': [400, 18, 15, 38],
      };

      // 从数据库获取已插入的菜品 ID
      for (const [dishName, [cal, prot, fatVal, carb]] of Object.entries(nutritionData)) {
        const rows = database.exec(`SELECT id FROM product_items WHERE name = '${dishName.replace(/'/g, "''")}'`);
        if (rows && rows.length > 0 && rows[0].values) {
          for (const row of rows[0].values) {
            const dishId = row[0];
            database.exec(`INSERT OR IGNORE INTO product_custom_values (product_id, field_id, value, created_at, updated_at) VALUES (${dishId}, 1, '${cal}', datetime('now'), datetime('now'))`);
            database.exec(`INSERT OR IGNORE INTO product_custom_values (product_id, field_id, value, created_at, updated_at) VALUES (${dishId}, 2, '${prot}', datetime('now'), datetime('now'))`);
            database.exec(`INSERT OR IGNORE INTO product_custom_values (product_id, field_id, value, created_at, updated_at) VALUES (${dishId}, 3, '${fatVal}', datetime('now'), datetime('now'))`);
            database.exec(`INSERT OR IGNORE INTO product_custom_values (product_id, field_id, value, created_at, updated_at) VALUES (${dishId}, 4, '${carb}', datetime('now'), datetime('now'))`);
          }
        }
      }
      console.log('[SQLite] Seeded nutrition values for all dishes');
    } else {
      console.log(`[SQLite] Seed skipped: product_items has ${dishCountVal} rows`);
    }
  }

  console.log(`[SQLite] Seed engine finished: ${seeded} seed(s) applied`);
  return seeded;
}

// ─── 新增种子数据：24 时令节气 ────────────────────────────────────────────
function seedSeasonConfig(database) {
  if (!tableExists(database, 'display_season_config')) return 0;
  const count = database.exec("SELECT COUNT(*) as cnt FROM display_season_config");
  const countVal = count?.[0]?.values?.[0]?.[0] || 0;
  if (countVal > 0) {
    console.log(`[SQLite] Seed skipped: display_season_config has ${countVal} rows`);
    return 0;
  }
  const terms = [
    ['小寒','大寒','萝卜、白菜、山药、羊肉、牛肉、韭菜','防寒保暖，适当进补'],
    ['大寒','立春','萝卜、白菜、山药、羊肉、牛肉、韭菜','保暖护阳，养肾防寒'],
    ['立春','雨水','韭菜、菠菜、春笋、萝卜、芹菜、豆芽','早睡早起，护肝养阳'],
    ['雨水','惊蛰','韭菜、菠菜、春笋、芹菜、豆芽、荠菜','健脾祛湿，少食生冷'],
    ['惊蛰','春分','韭菜、菠菜、春笋、芹菜、荠菜、香椿','清淡饮食，润肺防燥'],
    ['春分','清明','韭菜、菠菜、春笋、芹菜、荠菜、香椿、豌豆','阴阳平衡，适度运动'],
    ['清明','谷雨','菠菜、春笋、荠菜、香椿、豌豆、蚕豆、韭菜','清肝明目，少吃辛辣'],
    ['谷雨','立夏','菠菜、春笋、荠菜、香椿、豌豆、蚕豆、韭菜','健脾祛湿，预防过敏'],
    ['立夏','小满','黄瓜、丝瓜、西红柿、茄子、豆角、冬瓜、芹菜','养心清热，多饮水'],
    ['小满','芒种','黄瓜、苦瓜、丝瓜、绿豆、薏米、冬瓜、芹菜、番茄、茄子','清热利湿，饮食清淡'],
    ['芒种','夏至','西瓜、香瓜、黄瓜、苦瓜、绿豆、西红柿、茄子、冬瓜','防暑降温，补充盐分'],
    ['夏至','小暑','苦瓜、丝瓜、绿豆、冬瓜、西瓜、黄瓜、西红柿','清淡饮食，午休养神'],
    ['小暑','大暑','苦瓜、冬瓜、西瓜、绿豆、黄瓜、茄子、芹菜','防暑降温，避免暴晒'],
    ['大暑','立秋','绿豆、西瓜、冬瓜、苦瓜、黄瓜、薏米、芹菜','清热解暑，及时补水'],
    ['立秋','处暑','南瓜、冬瓜、丝瓜、茄子、黄瓜、西红柿、豆角','滋阴润燥，少辛增酸'],
    ['处暑','白露','萝卜、白菜、冬瓜、南瓜、丝瓜、西红柿、黄瓜','防秋燥，多喝水'],
    ['白露','秋分','梨、苹果、萝卜、白菜、冬瓜、南瓜、山药','滋阴润肺，防秋凉'],
    ['秋分','寒露','萝卜、白菜、山药、南瓜、冬瓜、土豆、红薯','阴阳平衡，少食寒凉'],
    ['寒露','霜降','萝卜、白菜、山药、莲藕、土豆、红薯、南瓜','防寒保暖，养肺润燥'],
    ['霜降','立冬','萝卜、白菜、山药、莲藕、土豆、红薯、南瓜','防寒保暖，适当进补'],
    ['立冬','小雪','萝卜、白菜、山药、莲藕、土豆、红薯、羊肉','养肾藏精，早睡晚起'],
    ['小雪','大雪','萝卜、白菜、山药、莲藕、土豆、红薯、羊肉','防寒保暖，温补为主'],
    ['大雪','冬至','萝卜、白菜、山药、莲藕、土豆、羊肉、牛肉','温补助阳，防寒保暖'],
    ['冬至','小寒','萝卜、白菜、山药、莲藕、羊肉、牛肉、饺子','养肾护阳，忌寒凉'],
  ];
  for (const [termName, nextTermName, foods, healthTip] of terms) {
    const foodsArr = foods.split('、');
    const foodsJson = JSON.stringify(foodsArr);
    database.exec(
      `INSERT INTO display_season_config (term_name, next_term_name, foods, health_tip, updated_at) VALUES ('${termName}', '${nextTermName}', '${foodsJson.replace(/'/g, "''")}', '${healthTip.replace(/'/g, "''")}', datetime('now'))`
    );
  }
  console.log(`[SQLite] Seeded ${terms.length} display_season_config rows`);
  return 1;
}

// ─── 新增种子数据：财务配置 ──────────────────────────────────────────────
function seedFinanceConfig(database) {
  let seeded = 0;
  if (tableExists(database, 'display_finance_config')) {
    const count = database.exec("SELECT COUNT(*) as cnt FROM display_finance_config");
    const countVal = count?.[0]?.values?.[0]?.[0] || 0;
    if (countVal === 0) {
      database.exec(
        "INSERT INTO display_finance_config (income, expense, balance, updated_at) VALUES (128560.50, 96740.80, 31819.70, datetime('now'))"
      );
      console.log('[SQLite] Seeded 1 display_finance_config row');
      seeded++;
    }
  }
  return seeded;
}

// ─── 新增种子数据：调用所有补充种子 ───────────────────────────────────────
function seedExtraData(database) {
  let extra = 0;
  extra += seedSeasonConfig(database);
  extra += seedFinanceConfig(database);
  if (extra > 0) {
    console.log(`[SQLite] Extra seed applied: ${extra} table(s)`);
  }
  return extra;
}

// ─── 数据库完整性检查 ─────────────────────────────────────────────────
function checkDbIntegrity(database) {
  try {
    const res = database.exec('PRAGMA integrity_check');
    const result = res?.[0]?.values?.[0]?.[0];
    if (result === 'ok') {
      console.log('[SQLite] PRAGMA integrity_check: ok');
      return true;
    }
    console.error('[SQLite] PRAGMA integrity_check failed:', result);
    return false;
  } catch (err) {
    console.error('[SQLite] PRAGMA integrity_check error:', err.message);
    return false;
  }
}

// ─── 重建数据库：备份旧文件并创建全新数据库 ─────────────────────────────
function rebuildDatabase() {
  try {
    if (fs.existsSync(dbPath)) {
      const backupPath = `${dbPath}.corrupted_${Date.now()}`;
      fs.copyFileSync(dbPath, backupPath);
      console.log('[SQLite] Corrupted database backed up to:', backupPath);
      fs.unlinkSync(dbPath);
      console.log('[SQLite] Corrupted database removed:', dbPath);
    }
  } catch (e) {
    console.warn('[SQLite] Failed to backup/remove corrupted db:', e.message);
  }
  db = new SQL.Database();
  console.log('[SQLite] New database created after corruption detected');
  return true;
}

async function initDb() {
  if (db) return db;
  // If already initializing, wait for the same promise
  if (dbInitPromise) return dbInitPromise;
  dbInitPromise = _doInitDb();
  return dbInitPromise;
}

async function _doInitDb() {
  if (db) return db;
  if (!SQL) {
    const initSqlJs = require('sql.js');
    const wasmPath = findWasmPath();
    SQL = await initSqlJs({ locateFile: () => wasmPath });
  }

  let isNew = false;
  if (fs.existsSync(dbPath)) {
    const data = fs.readFileSync(dbPath);
    db = new SQL.Database(data);
    console.log('[SQLite] Database loaded from file:', dbPath);
    // 检查完整性，损坏则重建
    if (!checkDbIntegrity(db)) {
      console.error('[SQLite] Database file is corrupted, rebuilding...');
      rebuildDatabase();
      isNew = true;
    }
  } else {
    db = new SQL.Database();
    isNew = true;
    console.log('[SQLite] New in-memory database:', dbPath);
  }

  const created = ensureTables(db);
  const migrated = runMigrations(db);
  // 检查关键表是否为空，为空则重新种子数据（防止数据被误删后无法自动恢复）
  let needSeed = (created > 0 || isNew);
  if (!needSeed) {
    try {
      const dishCount = db.exec("SELECT COUNT(*) as cnt FROM product_items");
      const dishCountVal = dishCount?.[0]?.values?.[0]?.[0] || 0;
      if (dishCountVal === 0) {
        needSeed = true;
        console.log('[SQLite] product_items is empty, will re-seed data');
      }
      const nutCount = db.exec("SELECT COUNT(*) as cnt FROM dish_nutrition");
      const nutCountVal = nutCount?.[0]?.values?.[0]?.[0] || 0;
      if (nutCountVal === 0) {
        console.log('[SQLite] dish_nutrition is empty, will seed default menu');
      }
    } catch (e) {
      console.warn('[SQLite] Check empty tables failed:', e.message);
    }
  }
  const seeded = needSeed ? seedData(db) : 0;
  const extraSeeded = needSeed ? seedExtraData(db) : 0;
  if (created > 0 || isNew || migrated > 0 || seeded > 0 || extraSeeded > 0) {
    console.log(`[SQLite] Database changes detected: ${created} table(s) created, ${migrated} migration(s) applied, ${seeded} seed(s) applied, ${extraSeeded} extra seed(s) applied, isNew=${isNew}`);
    saveDb();
  } else {
    console.log('[SQLite] Database schema up to date, no changes saved');
  }
  return db;
}

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    console.log('[SQLite] 数据库已保存到文件:', dbPath);
  } catch (err) {
    console.error('[SQLite] 保存数据库失败:', err.message);
  }
}

function closeDb() {
  if (db) {
    saveDb();
    try { db.close(); } catch { /* ignore */ }
    db = null;
  }
}

// 应用退出时自动保存数据库
app.on('will-quit', () => {
  closeDb();
});

// ─── 执行 SELECT 返回行数据（使用 db.prepare 参数化查询）────────────────────────
function execQuery(database, sql, params = []) {
  let stmt;
  try {
    stmt = database.prepare(sql);
    if (params && params.length > 0) {
      stmt.bind(params.map(p => p === undefined ? null : p));
    }
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } catch (err) {
    console.error('[execQuery] error:', err.message, '| SQL:', sql.slice(0, 200));
    return [];
  } finally {
    if (stmt) {
      try { stmt.free(); } catch { /* ignore */ }
    }
  }
}

// ─── db:query ─────────────────────────────────────────────────────────────
ipcMain.handle('db:query', async (_event, sql, params = []) => {
  try {
    const database = await initDb();
    // ★ 诊断：tray_display_devices 读操作日志
    if (sql.toLowerCase().includes('tray_display_devices')) {
      console.log('[db:query] ═══ tray_display_devices 查询(IPC) ═══');
      console.log('[db:query] SQL: ' + sql.substring(0, 300));
      console.log('[db:query] params: ' + JSON.stringify(params));
    }
    const rows = execQuery(database, sql, params);
    if (sql.toLowerCase().includes('tray_display_devices')) {
      console.log('[db:query] 返回 ' + (rows ? rows.length : 0) + ' 行');
      if (rows && rows.length > 0) {
        rows.forEach((r, i) => {
          console.log('[db:query] [' + i + '] id=' + r.id + ', sn=' + r.sn + ', ui_template=' + r.ui_template + ' (type=' + typeof r.ui_template + ')');
        });
      }
    }
    return { data: rows, error: null, count: rows.length };
  } catch (err) {
    const msg = err.message || String(err);
    console.error('[db:query] ERROR:', msg, '| SQL:', sql);
    return { data: [], error: msg, count: 0 };
  }
});

// ─── db:run ───────────────────────────────────────────────────────────────
ipcMain.handle('db:run', async (_event, sql, params = []) => {
  try {
    const database = await initDb();
    // SQL.js 不接受 undefined 参数，统一转成 null
    const safeParams = (params || []).map((p) => (p === undefined ? null : p));
    // 对 INSERT/UPDATE/DELETE 用 db.run 执行 SQL
    const result = database.run(sql, safeParams);
    // sql.js 的 db.run 返回的是 getAsObject() 结果，不是元数据
    // 需要手动获取 changes 和 lastInsertRowid
    const changes = database.getRowsModified();
    let lastInsertRowid = 0;
    if (changes > 0 && sql.trim().toLowerCase().startsWith('insert')) {
      try {
        const lr = database.exec('SELECT last_insert_rowid()');
        if (lr && lr.length > 0 && lr[0].values && lr[0].values.length > 0) {
          lastInsertRowid = lr[0].values[0][0] || 0;
        }
      } catch {
        // ignore
      }
    }
    // ★ 关键诊断日志：tray_display_devices 的 UPDATE 操作记录到日志文件
    if (sql.toLowerCase().includes('tray_display_devices')) {
      console.log('[db:run] ═══ tray_display_devices 写操作 ═══');
      console.log('[db:run] SQL: ' + sql.substring(0, 300));
      console.log('[db:run] params: ' + JSON.stringify(safeParams));
      console.log('[db:run] changes: ' + changes);
    }
    // ★ 立即持久化到磁盘，防止内存修改因崩溃/重启丢失
    if (changes > 0) {
      saveDb();
    }
    return {
      data: result,
      error: null,
      lastInsertRowid,
      changes,
    };
  } catch (err) {
    const msg = err.message || String(err);
    console.error('[db:run] ERROR:', msg, '| SQL:', sql);
    return { data: null, error: msg, lastInsertRowid: 0, changes: 0 };
  }
});

// ─── db:exec ──────────────────────────────────────────────────────────────
ipcMain.handle('db:exec', async (_event, sql) => {
  try {
    const database = await initDb();
    database.exec(sql);
    // 执行后持久化到磁盘
    saveDb();
    return { error: null };
  } catch (err) {
    const msg = err.message || String(err);
    console.error('[db:exec]', msg, '| SQL:', sql);
    return { error: msg };
  }
});

// ─── 数据库备份 IPC ──────────────────────────────────────────────────────────
ipcMain.handle('db:backup', async () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultName = `canteen_backup_${timestamp}.db`;
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      title: '备份数据库',
    });
    if (result.canceled || !result.filePath) return { success: false, message: '用户取消' };

    // 保存当前内存数据库到文件后再复制
    saveDb();
    fs.copyFileSync(dbPath, result.filePath);

    const stats = fs.statSync(result.filePath);
    return {
      success: true,
      path: result.filePath,
      size: stats.size,
      message: `备份成功: ${result.filePath}`,
    };
  } catch (err) {
    return { success: false, message: `备份失败: ${err.message}` };
  }
});

// ─── 数据库恢复 IPC ──────────────────────────────────────────────────────────
ipcMain.handle('db:restore', async () => {
  try {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
      title: '选择备份文件恢复',
    });
    if (result.canceled || !result.filePaths.length) return { success: false, message: '用户取消' };
    const src = result.filePaths[0];
    const backupCurrent = `${dbPath}.auto_backup_${Date.now()}`;

    // 关闭当前数据库后恢复
    closeDb();
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupCurrent);
    }
    fs.copyFileSync(src, dbPath);
    await initDb(); // 重新打开

    return { success: true, path: src, message: `恢复成功，原数据库已自动备份至 ${backupCurrent}` };
  } catch (err) {
    return { success: false, message: `恢复失败: ${err.message}` };
  }
});

// ─── 获取数据库文件信息 ────────────────────────────────────────────────────────
ipcMain.handle('db:info', async () => {
  try {
    const stats = fs.existsSync(dbPath) ? fs.statSync(dbPath) : null;
    const database = await initDb();
    const connected = !!database;
    return {
      path: dbPath,
      size: stats ? stats.size : 0,
      modifiedAt: stats ? stats.mtime.toISOString() : null,
      connected,
    };
  } catch (err) {
    return { path: dbPath, size: 0, modifiedAt: null, error: err.message, connected: false };
  }
});

console.log('[ipc-db] All database IPC handlers registered');

export { db, initDb, execQuery, saveDb, closeDb };