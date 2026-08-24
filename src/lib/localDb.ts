/*
 * 本地 SQLite 数据库前端封装
 * 提供与 Supabase 兼容的链式查询 API，用于 Electron 桌面端
 */

// ─── 类型定义 ───────────────────────────────────────────────────────────────
interface PostgrestError {
  message: string;
  details: string;
  hint: string;
  code: string;
}

interface Filter {
  method: string;
  column: string;
  value: unknown;
}

interface OrderClause {
  column: string;
  ascending: boolean;
}

interface JoinInfo {
  table: string;
  columns: string[];
}

interface ApiError {
  message: string;
}

// ─── JSON 列映射 ────────────────────────────────────────────────────────────
const JSON_COLUMNS: Record<string, string[]> = {
  acceptance_records: ['certificates'],
  product_items: ['media'],
  product_variants: ['options'],
  product_skus: ['options'],
  product_custom_fields: ['options'],
  order_headers: ['recipient'],
  content_items: ['screens'],
  screen_devices: ['zones'],
  meal_records: ['items'],
  display_season_config: ['foods'],
  display_configs: ['config_data'],
};

// ─── 外键映射 ───────────────────────────────────────────────────────────────
// 正向映射：主表 → 关联表 → 外键列名（外键在主表上）
const FK_MAP: Record<string, Record<string, string>> = {
  product_items: { product_categories: 'category_id' },
  product_custom_values: { product_items: 'product_id', product_custom_fields: 'field_id' },
  product_variants: { product_items: 'product_id' },
  product_skus: { product_items: 'product_id' },
  order_items: { order_headers: 'order_id' },
  tray_pickup_logs: { tray_stations: 'station_id' },
  tray_display_devices: { tray_stations: 'station_id' },
};

// 反向映射：主表 → 关联表 → 关联表上的外键列名（用于一对多子查询场景）
// 例如：product_items join product_custom_values，关联表上的外键是 product_id
const REVERSE_FK_MAP: Record<string, Record<string, string>> = {
  product_items: {
    product_custom_values: 'product_id',
    product_variants: 'product_id',
    product_skus: 'product_id',
  },
  order_headers: { order_items: 'order_id' },
  tray_stations: { tray_pickup_logs: 'station_id', tray_display_devices: 'station_id' },
};

function getFkColumn(mainTable: string, joinTable: string): string {
  // 先查正向（外键在主表上），再查反向（外键在关联表上）
  if (FK_MAP[mainTable]?.[joinTable]) return FK_MAP[mainTable][joinTable];
  // 反向映射时：JOIN 用 joinTable.fk = a.id
  if (REVERSE_FK_MAP[mainTable]?.[joinTable]) return `__REVERSE__${REVERSE_FK_MAP[mainTable][joinTable]}`;
  return `${joinTable}_id`;
}

// ─── 工具函数 ───────────────────────────────────────────────────────────────
function makeError(msg: string): PostgrestError {
  return { message: msg, details: '', hint: '', code: 'LOCALDB_ERR' };
}

function parseJoinSelect(selectStr: string, mainTable: string): { mainSelect: string; joins: JoinInfo[] } {
  if (!selectStr || selectStr === '*') return { mainSelect: '*', joins: [] };

  // 正确处理括号内的逗号，不在这里拆分
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < selectStr.length; i++) {
    const char = selectStr[i];
    if (char === '(') { depth++; current += char; }
    else if (char === ')') { depth--; current += char; }
    else if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());

  const mainParts: string[] = [];
  const joins: JoinInfo[] = [];

  for (const part of parts) {
    // Match: table!left(col1, col2) or table!inner(col1, col2) or table(col1, col2)
    const match = part.match(/^(\w+)(?:!\w+)?\s*\(([^)]+)\)$/);
    if (match) {
      joins.push({ table: match[1], columns: match[2].split(',').map((c) => c.trim()).filter(Boolean) });
    } else {
      mainParts.push(part);
    }
  }
  return { mainSelect: mainParts.join(', ') || '*', joins };
}

function parseJsonColumns(rows: Record<string, unknown>[], table: string): Record<string, unknown>[] {
  const cols = JSON_COLUMNS[table] || [];
  if (cols.length === 0 || rows.length === 0) return rows;
  return rows.map((row) => {
    const r = { ...row };
    for (const col of cols) {
      if (typeof r[col] === 'string' && r[col]) {
        try { r[col] = JSON.parse(r[col] as string); } catch { /* keep string */ }
      }
    }
    return r;
  });
}

function restructureJoins(
  rows: Record<string, unknown>[],
  joins: JoinInfo[],
): Record<string, unknown>[] {
  if (joins.length === 0) return rows;
  return rows.map((row) => {
    const result: Record<string, unknown> = {};
    const nested: Record<string, Record<string, unknown>> = {};

    for (const [key, value] of Object.entries(row)) {
      let found = false;
      for (const join of joins) {
        const prefix = `${join.table}_`;
        if (key.startsWith(prefix)) {
          if (!nested[join.table]) nested[join.table] = {};
          nested[join.table][key.slice(prefix.length)] = value;
          found = true;
          break;
        }
      }
      if (!found) result[key] = value;
    }

    for (const join of joins) {
      const vals = Object.values(nested[join.table] || {});
      const allNull = vals.length > 0 && vals.every((v) => v === null);
      result[join.table] = allNull ? null : nested[join.table] || null;
    }
    return result;
  });
}

/**
 * 当 join 包含反向关联（一对多）时，需要按主表 id 分组聚合
 * 例如 product_items join product_custom_values，同一个 product_items.id 对应多个 custom_values 行
 */
function aggregateReverseJoins(
  rows: Record<string, unknown>[],
  reverseJoins: JoinInfo[],
  normalJoins: JoinInfo[],
): Record<string, unknown>[] {
  // 先对所有 join 进行结构化
  const allJoins = [...normalJoins, ...reverseJoins];
  const structured = restructureJoins(rows, allJoins);

  // 按 id 分组聚合
  const groupMap = new Map<unknown, Record<string, unknown>>();
  for (const row of structured) {
    const id = row.id;
    if (!groupMap.has(id)) {
      // 创建基础行，反向 join 表初始化为空数组
      const base = { ...row };
      for (const rj of reverseJoins) {
        base[rj.table] = base[rj.table] !== null ? [base[rj.table]] : [];
      }
      groupMap.set(id, base);
    } else {
      // 已有记录，将反向 join 的内容添加到数组
      const existing = groupMap.get(id)!;
      for (const rj of reverseJoins) {
        const val = row[rj.table];
        if (val !== null) {
          (existing[rj.table] as unknown[]).push(val);
        }
      }
    }
  }
  return Array.from(groupMap.values());
}

function buildWhereSQL(filters: Filter[], params: unknown[], alias = 'a'): string {
  if (filters.length === 0) return '';
  const conditions: string[] = [];
  const prefix = alias ? `${alias}.` : '';
  for (const f of filters) {
    switch (f.method) {
      case 'eq':
        conditions.push(`${prefix}"${f.column}" = ?`);
        params.push(f.value);
        break;
      case 'neq':
        conditions.push(`${prefix}"${f.column}" != ?`);
        params.push(f.value);
        break;
      case 'gt':
        conditions.push(`${prefix}"${f.column}" > ?`);
        params.push(f.value);
        break;
      case 'gte':
        conditions.push(`${prefix}"${f.column}" >= ?`);
        params.push(f.value);
        break;
      case 'lt':
        conditions.push(`${prefix}"${f.column}" < ?`);
        params.push(f.value);
        break;
      case 'lte':
        conditions.push(`${prefix}"${f.column}" <= ?`);
        params.push(f.value);
        break;
      case 'in': {
        const vals = Array.isArray(f.value) ? f.value : [f.value];
        conditions.push(`${prefix}"${f.column}" IN (${vals.map(() => '?').join(',')})`);
        params.push(...vals);
        break;
      }
      case 'ilike':
        conditions.push(`LOWER(${prefix}"${f.column}") LIKE LOWER(?)`);
        params.push(`%${f.value}%`);
        break;
    }
  }
  return ` WHERE ${conditions.join(' AND ')}`;
}

function buildOrderSQL(orders: OrderClause[], alias = 'a'): string {
  if (orders.length === 0) return '';
  const prefix = alias ? `${alias}.` : '';
  return ` ORDER BY ${orders.map((o) => `${prefix}"${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`).join(', ')}`;
}

// ─── IPC 调用 ───────────────────────────────────────────────────────────────
async function ipcQuery(sql: string, params: unknown[]): Promise<{ data: Record<string, unknown>[]; error: ApiError | null }> {
  const api = (window as any).electronAPI;
  if (!api || !api.dbQuery) {
    return { data: [], error: { message: 'Electron IPC not available' } };
  }
  const res = await api.dbQuery(sql, params);
  if (res.error) return { data: [], error: { message: res.error } };
  return { data: res.data || [], error: null };
}

async function ipcRun(sql: string, params: unknown[]): Promise<{ data: { lastInsertRowid: number; changes: number }; error: ApiError | null }> {
  const api = (window as any).electronAPI;
  if (!api || !api.dbRun) {
    return { data: { lastInsertRowid: 0, changes: 0 }, error: { message: 'Electron IPC not available' } };
  }
  const res = await api.dbRun(sql, params);
  if (res.error) return { data: { lastInsertRowid: 0, changes: 0 }, error: { message: res.error } };
  return {
    data: { lastInsertRowid: res.lastInsertRowid || 0, changes: res.changes || 0 },
    error: null,
  };
}

// ─── SELECT Builder ─────────────────────────────────────────────────────────
class LocalSelectBuilder<T = Record<string, unknown>> {
  private table: string;
  private selectStr = '*';
  private filters: Filter[] = [];
  private orders: OrderClause[] = [];
  private limitVal: number | null = null;
  private singleMode = false;
  private maybeSingleMode = false;

  constructor(table: string) { this.table = table; }

  select(columns: string): this { this.selectStr = columns; return this; }
  eq(column: string, value: unknown): this { this.filters.push({ method: 'eq', column, value }); return this; }
  neq(column: string, value: unknown): this { this.filters.push({ method: 'neq', column, value }); return this; }
  gt(column: string, value: unknown): this { this.filters.push({ method: 'gt', column, value }); return this; }
  gte(column: string, value: unknown): this { this.filters.push({ method: 'gte', column, value }); return this; }
  lt(column: string, value: unknown): this { this.filters.push({ method: 'lt', column, value }); return this; }
  lte(column: string, value: unknown): this { this.filters.push({ method: 'lte', column, value }); return this; }
  in(column: string, values: unknown[]): this { this.filters.push({ method: 'in', column, value: values }); return this; }
  ilike(column: string, pattern: string): this { this.filters.push({ method: 'ilike', column, value: pattern }); return this; }
  order(column: string, opts: { ascending?: boolean } = {}): this {
    this.orders.push({ column, ascending: opts.ascending !== false });
    return this;
  }
  limit(n: number): this { this.limitVal = n; return this; }
  single(): this { this.singleMode = true; return this; }
  maybeSingle(): this { this.maybeSingleMode = true; return this; }

  private buildSQL(): { sql: string; params: unknown[] } {
    const { mainSelect, joins } = parseJoinSelect(this.selectStr, this.table);
    const params: unknown[] = [];
    let sql = 'SELECT ';

    if (mainSelect === '*') {
      sql += 'a.*';
    } else {
      sql += mainSelect.split(',').map((c) => `a."${c.trim()}"`).join(', ');
    }

    joins.forEach((join, idx) => {
      const alias = String.fromCharCode(98 + idx);
      join.columns.forEach((col) => {
        sql += `, ${alias}."${col}" AS "${join.table}_${col}"`;
      });
    });

    sql += ` FROM "${this.table}" a`;
    joins.forEach((join, idx) => {
      const alias = String.fromCharCode(98 + idx);
      const fk = getFkColumn(this.table, join.table);
      if (fk.startsWith('__REVERSE__')) {
        // 反向关联：关联表上的外键指向主表 id
        const realFk = fk.slice('__REVERSE__'.length);
        sql += ` LEFT JOIN "${join.table}" ${alias} ON ${alias}."${realFk}" = a."id"`;
      } else {
        sql += ` LEFT JOIN "${join.table}" ${alias} ON a."${fk}" = ${alias}."id"`;
      }
    });

    sql += buildWhereSQL(this.filters, params, 'a');
    sql += buildOrderSQL(this.orders, 'a');

    if (this.limitVal !== null) {
      sql += ' LIMIT ?';
      params.push(this.limitVal);
    }

    return { sql, params };
  }

  async execute(): Promise<{ data: T[] | null; error: PostgrestError | null }> {
    const { sql, params } = this.buildSQL();
    const res = await ipcQuery(sql, params);
    if (res.error) return { data: null, error: makeError(res.error.message) };

    let rows = res.data;
    const { joins } = parseJoinSelect(this.selectStr, this.table);
    if (joins.length > 0) {
      // 检查是否有反向关联（一对多）
      const reverseJoins = joins.filter((j) => REVERSE_FK_MAP[this.table]?.[j.table]);
      const normalJoins = joins.filter((j) => !REVERSE_FK_MAP[this.table]?.[j.table]);

      if (reverseJoins.length > 0) {
        // 对于反向 join，需要按主表 id 分组聚合
        rows = aggregateReverseJoins(rows, reverseJoins, normalJoins);
      } else {
        rows = restructureJoins(rows, joins);
      }
    }
    rows = parseJsonColumns(rows, this.table);

    if (this.singleMode) {
      if (rows.length === 0) return { data: null, error: makeError('没有匹配记录') };
      return { data: rows[0] as unknown as T, error: null };
    }
    if (this.maybeSingleMode) {
      return { data: rows.length > 0 ? (rows[0] as unknown as T) : null, error: null };
    }
    return { data: rows as unknown as T[], error: null };
  }

  then(
    onfulfilled?: ((value: { data: T[] | null; error: PostgrestError | null }) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ): Promise<unknown> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

// ─── INSERT Builder ─────────────────────────────────────────────────────────
class LocalInsertBuilder<T = Record<string, unknown>> {
  private table: string;
  private rows: Record<string, unknown>[] = [];
  private selectAfter = false;
  private singleMode = false;
  private maybeSingleMode = false;

  constructor(table: string) { this.table = table; }

  insert(rowOrRows: Record<string, unknown> | Record<string, unknown>[]): this {
    this.rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
    return this;
  }
  select(): this { this.selectAfter = true; return this; }
  single(): this { this.singleMode = true; return this; }
  maybeSingle(): this { this.maybeSingleMode = true; return this; }

  async execute(): Promise<{ data: T[] | null; error: PostgrestError | null }> {
    if (this.rows.length === 0) return { data: [], error: null };

    const keys = Object.keys(this.rows[0]);
    const placeholders = keys.map(() => '?').join(',');
    const sql = `INSERT INTO "${this.table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${placeholders})`;

    const insertedIds: number[] = [];
    for (const row of this.rows) {
      const values = keys.map((k) => {
        const v = row[k];
        if (v === undefined) return null;
        if (JSON_COLUMNS[this.table]?.includes(k) && v !== null) {
          return JSON.stringify(v);
        }
        return v;
      });
      const res = await ipcRun(sql, values);
      if (res.error) return { data: null, error: makeError(res.error.message) };
      insertedIds.push(res.data.lastInsertRowid);
    }

    if (!this.selectAfter) return { data: [], error: null };

    const idSql = `SELECT * FROM "${this.table}" WHERE id IN (${insertedIds.map(() => '?').join(',')})`;
    const qRes = await ipcQuery(idSql, insertedIds);
    if (qRes.error) return { data: null, error: makeError(qRes.error.message) };

    let rows = parseJsonColumns(qRes.data, this.table);
    if (this.singleMode) {
      return { data: rows.length > 0 ? (rows[0] as unknown as T) : null, error: null };
    }
    if (this.maybeSingleMode) {
      return { data: (rows.length > 0 ? rows[0] : null) as unknown as T | null, error: null };
    }
    return { data: rows as unknown as T[], error: null };
  }

  then(
    onfulfilled?: ((value: { data: T[] | null; error: PostgrestError | null }) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ): Promise<unknown> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

// ─── UPDATE Builder ─────────────────────────────────────────────────────────
class LocalUpdateBuilder {
  private table: string;
  private values: Record<string, unknown> = {};
  private filters: Filter[] = [];
  private selectAfter = false;
  private singleMode = false;
  private maybeSingleMode = false;

  constructor(table: string) { this.table = table; }

  update(vals: Record<string, unknown>): this { this.values = vals; return this; }
  eq(column: string, value: unknown): this { this.filters.push({ method: 'eq', column, value }); return this; }
  in(column: string, values: unknown[]): this { this.filters.push({ method: 'in', column, value: values }); return this; }
  select(): this { this.selectAfter = true; return this; }
  single(): this { this.singleMode = true; return this; }
  maybeSingle(): this { this.maybeSingleMode = true; return this; }

  async execute(): Promise<{ data: unknown; error: PostgrestError | null }> {
    const keys = Object.keys(this.values);
    if (keys.length === 0) return { data: null, error: makeError('无更新内容') };

    const setClause = keys.map((k) => `"${k}" = ?`).join(', ');
    const params: unknown[] = keys.map((k) => {
      const v = this.values[k];
      if (v === undefined || v === null) return null;
      if (JSON_COLUMNS[this.table]?.includes(k)) {
        return JSON.stringify(v);
      }
      return v;
    });

    let sql = `UPDATE "${this.table}" SET ${setClause}`;
    sql += buildWhereSQL(this.filters, params, '');

    const res = await ipcRun(sql, params);
    if (res.error) return { data: null, error: makeError(res.error.message) };

    if (!this.selectAfter) return { data: null, error: null };

    // 查询更新后的记录
    const selectParams: unknown[] = [];
    const qSql = `SELECT * FROM "${this.table}"` + buildWhereSQL(this.filters, selectParams, '');
    const qRes = await ipcQuery(qSql, selectParams);
    if (qRes.error) return { data: null, error: makeError(qRes.error.message) };

    let rows = parseJsonColumns(qRes.data, this.table);
    if (this.singleMode) {
      return { data: rows.length > 0 ? rows[0] : null, error: null };
    }
    if (this.maybeSingleMode) {
      return { data: rows.length > 0 ? rows[0] : null, error: null };
    }
    return { data: rows, error: null };
  }

  then(
    onfulfilled?: ((value: { data: unknown; error: PostgrestError | null }) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ): Promise<unknown> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

// ─── DELETE Builder ─────────────────────────────────────────────────────────
class LocalDeleteBuilder {
  private table: string;
  private filters: Filter[] = [];

  constructor(table: string) { this.table = table; }

  delete(): this { return this; }
  eq(column: string, value: unknown): this { this.filters.push({ method: 'eq', column, value }); return this; }

  async execute(): Promise<{ data: null; error: PostgrestError | null }> {
    const params: unknown[] = [];
    let sql = `DELETE FROM "${this.table}"`;
    sql += buildWhereSQL(this.filters, params, '');

    const res = await ipcRun(sql, params);
    if (res.error) return { data: null, error: makeError(res.error.message) };
    return { data: null, error: null };
  }

  then(
    onfulfilled?: ((value: { data: null; error: PostgrestError | null }) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ): Promise<unknown> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

// ─── UPSERT Builder (SQLite: ON CONFLICT ... DO UPDATE SET ...) ─────────────
class LocalUpsertBuilder {
  private table: string;
  private rows: Record<string, unknown>[] = [];
  private conflictCols: string[] = [];

  constructor(table: string) { this.table = table; }

  upsert(rowOrRows: Record<string, unknown> | Record<string, unknown>[], opts: { onConflict: string }): this {
    this.rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
    this.conflictCols = opts.onConflict.split(',').map((c) => c.trim());
    return this;
  }

  async execute(): Promise<{ data: null; error: PostgrestError | null }> {
    if (this.rows.length === 0) return { data: null, error: makeError('无插入内容') };

    const keys = Object.keys(this.rows[0]);
    if (keys.length === 0) return { data: null, error: makeError('无插入内容') };

    const placeholders = keys.map(() => '?').join(',');
    const updateCols = keys.filter((k) => !this.conflictCols.includes(k));
    const updateClause = updateCols.length > 0
      ? updateCols.map((k) => `"${k}" = excluded."${k}"`).join(', ')
      : '"id" = "id"';

    const conflictStr = this.conflictCols.map((c) => `"${c}"`).join(', ');
    const sql = `INSERT INTO "${this.table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${placeholders}) ON CONFLICT(${conflictStr}) DO UPDATE SET ${updateClause}`;

    // 逐行执行 upsert
    for (const row of this.rows) {
      const params = keys.map((k) => {
        const v = row[k];
        if (v === undefined || v === null) return null;
        if (JSON_COLUMNS[this.table]?.includes(k)) {
          return JSON.stringify(v);
        }
        return v;
      });

      const res = await ipcRun(sql, params);
      if (res.error) return { data: null, error: makeError(res.error.message) };
    }

    return { data: null, error: null };
  }

  then(
    onfulfilled?: ((value: { data: null; error: PostgrestError | null }) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ): Promise<unknown> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

// 模拟 Supabase Realtime Channel
const mockChannel = {
  on: () => mockChannel,
  subscribe: () => ({ unsubscribe: () => {} }),
};

// ─── 主入口 ─────────────────────────────────────────────────────────────────
class LocalDbFrom {
  private table: string;
  constructor(table: string) { this.table = table; }
  select(columns = '*'): LocalSelectBuilder { return new LocalSelectBuilder(this.table).select(columns); }
  insert(rows: Record<string, unknown> | Record<string, unknown>[]): LocalInsertBuilder {
    return new LocalInsertBuilder(this.table).insert(rows);
  }
  update(values: Record<string, unknown>): LocalUpdateBuilder {
    return new LocalUpdateBuilder(this.table).update(values);
  }
  delete(): LocalDeleteBuilder { return new LocalDeleteBuilder(this.table).delete(); }
  upsert(row: Record<string, unknown>, opts: { onConflict: string }): LocalUpsertBuilder {
    return new LocalUpsertBuilder(this.table).upsert(row, opts);
  }
}

export const localDb = {
  from: (table: string) => new LocalDbFrom(table),
  channel: () => mockChannel,
  removeChannel: () => {},
};

// 全局声明类型
declare global {
  interface Window {
    electronAPI: {
      platform: string;
      arch: string;
      appVersion: string;
      versions: { node: string; electron: string; chrome: string };
      hikvisionSnapshot: (ip: string, port: number, username: string, password: string, channelNo: number) => Promise<{ success: boolean; data?: string; error?: string; code?: string; detail?: string }>;
      hikvisionDeviceInfo: (ip: string, port: number, username: string, password: string) => Promise<{ success: boolean; data?: string; error?: string; code?: string; detail?: string }>;
      dbQuery: (sql: string, params?: unknown[]) => Promise<{ data: Record<string, unknown>[]; error: string | null; count: number }>;
      dbRun: (sql: string, params?: unknown[]) => Promise<{ data: unknown; error: string | null; lastInsertRowid: number | null; changes: number }>;
      dbExec: (sql: string) => Promise<{ error: string | null }>;
      dbBackup: () => Promise<{ success: boolean; path?: string; size?: number; message: string }>;
      dbRestore: () => Promise<{ success: boolean; path?: string; message: string }>;
      dbInfo: () => Promise<{ path: string; size: number; modifiedAt: string | null; error?: string; connected?: boolean }>;
      debugLogPath: () => Promise<string>;
      debugDevtools: () => Promise<{ opened?: boolean; error?: string }>;
      debugEnv: () => Promise<{ platform: string; arch: string; electron: string; chrome: string; node: string; logFile: string; appPath: string; userData: string; desktop: string }>;
    };
  }
}