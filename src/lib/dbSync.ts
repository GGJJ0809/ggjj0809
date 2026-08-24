import { localDb } from './localDb';

function isLocalDbAvailable(): boolean {
  const api = (window as any).electronAPI;
  return !!api?.dbQuery && !!api?.dbRun;
}

/**
 * 将 INSERT 数据同步到本地 SQLite
 * 使用云端返回的 id 作为本地主键，确保两边一致
 */
export async function syncInsert(
  table: string,
  data: Record<string, unknown>,
  cloudId?: number,
): Promise<void> {
  if (!isLocalDbAvailable()) return;
  try {
    const row = { ...data };
    if (cloudId != null) {
      row.id = cloudId;
    }
    await localDb.from(table).insert(row).execute();
  } catch (e) {
    console.warn(`[syncInsert] ${table} failed:`, e);
  }
}

/**
 * 批量 INSERT 同步到本地
 */
export async function syncBatchInsert(
  table: string,
  rows: Record<string, unknown>[],
  cloudIds?: number[],
): Promise<void> {
  if (!isLocalDbAvailable() || rows.length === 0) return;
  try {
    const localRows = rows.map((row, i) => {
      const r = { ...row };
      if (cloudIds?.[i] != null) {
        r.id = cloudIds[i];
      }
      return r;
    });
    await localDb.from(table).insert(localRows).execute();
  } catch (e) {
    console.warn(`[syncBatchInsert] ${table} failed:`, e);
  }
}

/**
 * 将 UPDATE 数据同步到本地 SQLite
 */
export async function syncUpdate(
  table: string,
  data: Record<string, unknown>,
  id: number,
): Promise<void> {
  if (!isLocalDbAvailable()) return;
  try {
    const updateData = { ...data };
    delete updateData.id; // 避免误更新 id
    await localDb.from(table).update(updateData).eq('id', id).execute();
  } catch (e) {
    console.warn(`[syncUpdate] ${table} id=${id} failed:`, e);
  }
}

/**
 * 将 DELETE 同步到本地 SQLite
 */
export async function syncDelete(table: string, id: number): Promise<void> {
  if (!isLocalDbAvailable()) return;
  try {
    await localDb.from(table).delete().eq('id', id).execute();
  } catch (e) {
    console.warn(`[syncDelete] ${table} id=${id} failed:`, e);
  }
}

/**
 * 通用：先执行云端操作，成功后同步到本地
 * 返回云端操作的结果
 */
export async function cloudFirst<T>(
  table: string,
  action: 'insert' | 'update' | 'delete',
  cloudFn: () => Promise<T>,
  syncData?: Record<string, unknown>,
  syncId?: number,
): Promise<T> {
  const result = await cloudFn();
  if (action === 'insert' && syncData) {
    // 尝试从 result 提取 id
    const cloudId = (result as any)?.id ?? syncId;
    await syncInsert(table, syncData, cloudId);
  } else if (action === 'update' && syncData && syncId) {
    await syncUpdate(table, syncData, syncId);
  } else if (action === 'delete' && syncId) {
    await syncDelete(table, syncId);
  }
  return result;
}