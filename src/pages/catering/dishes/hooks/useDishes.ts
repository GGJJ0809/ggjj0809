import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { syncInsert, syncUpdate, syncDelete, syncBatchInsert } from '@/lib/dbSync';
import { localDb } from '@/lib/localDb';
import { loadDisplayConfig } from '@/lib/displayStore';
import { nowBeijing } from '@/lib/dateUtils';

// 判断是否在 Electron 环境（此时 supabase 已经是 localDb，不能再 sync）
function isElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

// Electron 下使用本地 SQLite，Web 下使用云端 Supabase
function getDb() {
  return isElectron() ? localDb : supabase;
}

export interface Dish {
  id: number;
  name: string;
  category_id: number;
  category: string;
  status: string;
  price: number;
  img: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  method: string;
  nutrition: string;
  contraindications: string;
  // ★ 新增：口味标签和功效
  taste: string;
  effect: string;
  station_name?: string;
}

export interface DishCategory {
  id: number;
  name: string;
  sort_order: number;
}

export interface TrayStation {
  id: number;
  name: string;
  product_item_id: number | null;
}

export interface CustomField {
  id: number;
  name: string;
}

interface RawCustomValue {
  field_id: number;
  value: string;
}

function mapDish(
  item: Record<string, unknown>,
  fieldMap: Record<number, string>,
  stationMap: Record<number, string>,
): Dish {
  const vals: Record<string, string> = {};
  const customValues = (item.product_custom_values as RawCustomValue[]) || [];
  customValues.forEach((v) => {
    const fieldName = fieldMap[v.field_id];
    if (fieldName) vals[fieldName] = v.value;
  });
  const media = item.media as Array<{ url: string; type: string }> | null;
  const productId = item.id as number;
  return {
    id: productId,
    name: item.name as string,
    category_id: item.category_id as number,
    category: (item.product_categories as { name: string } | null)?.name || '',
    status: item.status as string,
    price: Number(item.price) || 0,
    img: media?.[0]?.url || '',
    calories: Number(vals.calories) || 0,
    protein: Number(vals.protein) || 0,
    fat: Number(vals.fat) || 0,
    carbs: Number(vals.carbs) || 0,
    fiber: Number(vals.fiber) || 0,
    method: vals.method || '',
    nutrition: vals.nutrition || '',
    contraindications: vals.contraindications || '',
    taste: vals.taste || '',
    effect: vals.effect || '',
    station_name: stationMap[productId] || '',
  };
}

export function useDishes() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [categories, setCategories] = useState<DishCategory[]>([]);
  const [stations, setStations] = useState<TrayStation[]>([]);
  const [fieldMap, setFieldMap] = useState<Record<number, string>>();
  const [fieldIdMap, setFieldIdMap] = useState<Record<string, number>>();
  const fieldIdMapRef = useRef<Record<string, number>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = getDb();
      const [
        { data: catData },
        { data: fieldData },
        { data: dishData },
        { data: stationData },
      ] = await Promise.all([
        db.from('product_categories').select('*').order('sort_order'),
        db.from('product_custom_fields').select('id, name').order('sort_order'),
        db
          .from('product_items')
          .select('*, product_categories(id, name), product_custom_values(field_id, value)')
          .order('id'),
        db.from('tray_stations').select('id, name, product_item_id').order('id'),
      ]);

      const fMap: Record<number, string> = {};
      const fIdMap: Record<string, number> = {};
      (fieldData || []).forEach((f: CustomField) => {
        fMap[f.id] = f.name;
        fIdMap[f.name] = f.id;
      });
      setFieldMap(fMap);
      setFieldIdMap(fIdMap);
      fieldIdMapRef.current = fIdMap;
      setCategories(catData || []);
      setStations(stationData || []);

      const stationMap: Record<number, string> = {};
      (stationData || []).forEach((s: TrayStation) => {
        if (s.product_item_id != null) {
          stationMap[s.product_item_id] = s.name;
        }
      });
      setDishes((dishData || []).map((d) => mapDish(d as Record<string, unknown>, fMap, stationMap)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addDish = useCallback(async (form: {
    name: string;
    category_id: number;
    status: string;
    price: number;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    fiber: number;
    method: string;
    nutrition: string;
    contraindications: string;
    taste?: string;
    effect?: string;
    imgBase64?: string;
  }, opts?: { skipRefetch?: boolean }): Promise<{ success: boolean; error?: string }> => {
    let imgUrl = '';
    if (form.imgBase64) {
      imgUrl = form.imgBase64;
    } else {
      const seq = `new${Date.now()}`;
      const query = encodeURIComponent(form.name + ' chinese food dish beautiful plating food photography white background');
      imgUrl = `https://readdy.ai/api/search-image?query=$%7Bquery%7D&width=200&height=200&seq=${seq}&orientation=squarish`;
    }

    const itemRow = {
      name: form.name,
      category_id: form.category_id,
      status: form.status,
      price: form.price,
      media: [{ url: imgUrl, type: 'image' }],
    };

    const db = getDb();
    const result = await db
      .from('product_items')
      .insert(itemRow)
      .select('id')
      .maybeSingle();
    const inserted = result.data as any;
    const insertErr = result.error;

    if (insertErr || !inserted) return { success: false, error: insertErr?.message || '添加失败' };

    const productId = inserted.id as number;

    // 仅在非 Electron 环境（云端写入后）才同步到本地
    if (!isElectron()) {
      await syncInsert('product_items', itemRow as Record<string, unknown>, productId);
    }

    // 用 ref 取最新 fieldIdMap，避免闭包捕获到 undefined
    const currentFieldIdMap = fieldIdMapRef.current || fieldIdMap;
    const numericFields = ['calories', 'protein', 'fat', 'carbs', 'fiber'] as const;
    const textFields = ['method', 'nutrition', 'contraindications'] as const;
    const extraTextFields = ['taste', 'effect'] as const;
    const cvRows = [
      ...numericFields.map((k) => {
        const fid = currentFieldIdMap?.[k];
        return fid != null ? { product_id: productId, field_id: fid, value: String(form[k]) } : null;
      }),
      ...textFields.map((k) => {
        const fid = currentFieldIdMap?.[k];
        return fid != null && form[k] ? { product_id: productId, field_id: fid, value: form[k] } : null;
      }),
      ...extraTextFields.map((k) => {
        const fid = currentFieldIdMap?.[k];
        const val = form[k];
        return fid != null && val ? { product_id: productId, field_id: fid, value: val } : null;
      }),
    ].filter((r): r is NonNullable<typeof r> => r != null);

    if (cvRows.length > 0) {
      const upsertResult = await db.from('product_custom_values').upsert(cvRows, { onConflict: 'product_id,field_id' });
      const upsertErr = upsertResult.error;
      if (upsertErr) {
        console.warn('Custom values upsert failed:', upsertErr.message);
      } else if (!isElectron()) {
        const { data: insertedCv } = await db.from('product_custom_values').select('id').eq('product_id', productId);
        await syncBatchInsert(
          'product_custom_values',
          cvRows,
          (insertedCv || []).map((c: { id: number }) => c.id),
        );
      }
    }

    // 批量导入时跳过单条刷新，由调用方统一刷新
    if (!opts?.skipRefetch) {
      await fetchAll();
      // MQTT 实时推送：菜品变更后推送给所有在线设备
      if (isElectron()) {
        const api = (window as any).electronAPI;
        if (api?.mqttPushDishesUpdate) {
          api.mqttPushDishesUpdate().catch(() => {});
        }
      }
    }
    return { success: true };
  }, [fieldIdMap, fetchAll]);

  const updateDish = useCallback(async (id: number, form: Partial<{
    name: string;
    category_id: number;
    status: string;
    price: number;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    fiber: number;
    method: string;
    nutrition: string;
    contraindications: string;
    taste: string;
    effect: string;
    imgBase64: string;
  }>): Promise<{ success: boolean; error?: string }> => {
    const db = getDb();
    const itemUpdate: Record<string, unknown> = {};
    if (form.name !== undefined) itemUpdate.name = form.name;
    if (form.category_id !== undefined) itemUpdate.category_id = form.category_id;
    if (form.status !== undefined) itemUpdate.status = form.status;
    if (form.price !== undefined) itemUpdate.price = form.price;
    if (form.imgBase64 !== undefined) {
      itemUpdate.media = [{ url: form.imgBase64, type: 'image' }];
    }

    if (Object.keys(itemUpdate).length > 0) {
      const upResult = await db.from('product_items').update(itemUpdate).eq('id', id);
      if (upResult.error) return { success: false, error: upResult.error.message };
      if (!isElectron()) {
        await syncUpdate('product_items', itemUpdate, id);
      }
    }

    // Update dish_name on tray station if name changed
    if (form.name !== undefined) {
      await db.from('tray_stations').update({ dish_name: form.name }).eq('product_item_id', id);
    }

    // 用 ref 取最新 fieldIdMap
    const currentFieldIdMap = fieldIdMapRef.current || fieldIdMap;
    const fieldKeys = ['calories', 'protein', 'fat', 'carbs', 'fiber', 'method', 'nutrition', 'contraindications', 'taste', 'effect'] as const;
    for (const key of fieldKeys) {
      if (form[key] !== undefined) {
        const fieldId = currentFieldIdMap?.[key];
        if (!fieldId) continue;
        const upsertResult = await db.from('product_custom_values').upsert(
          { product_id: id, field_id: fieldId, value: String(form[key]) },
          { onConflict: 'product_id,field_id' },
        );
        if (upsertResult.error) console.warn('Custom value upsert failed:', upsertResult.error.message);
        // 仅在非 Electron 环境才同步到本地
        else if (!isElectron()) {
          const localUpsert = { product_id: id, field_id: fieldId, value: String(form[key]) };
          await localDb.from('product_custom_values').upsert(localUpsert, { onConflict: 'product_id,field_id' }).execute();
        }
      }
    }

    await fetchAll();
    // MQTT 实时推送：菜品变更后推送给所有在线设备
    if (isElectron()) {
      const api = (window as any).electronAPI;
      if (api?.mqttPushDishesUpdate) {
        api.mqttPushDishesUpdate().catch(() => {});
      }
    }
    return { success: true };
  }, [fieldIdMap, fetchAll]);

  const deleteDish = useCallback(async (id: number): Promise<{ success: boolean; error?: string }> => {
    const db = getDb();
    // Clear tray station binding first
    await db.from('tray_stations').update({ product_item_id: null, dish_name: null }).eq('product_item_id', id);

    const delResult = await db.from('product_items').delete().eq('id', id);
    if (delResult.error) return { success: false, error: delResult.error.message };

    // 仅在非 Electron 环境才同步到本地
    if (!isElectron()) {
      await syncDelete('product_items', id);
    }

    await fetchAll();
    // MQTT 实时推送：菜品变更后推送给所有在线设备
    if (isElectron()) {
      const api = (window as any).electronAPI;
      if (api?.mqttPushDishesUpdate) {
        api.mqttPushDishesUpdate().catch(() => {});
      }
    }
    return { success: true };
  }, [fetchAll]);

  const batchDeleteDish = useCallback(async (ids: number[]): Promise<{ success: boolean; deleted: number; failed: number; errors: string[] }> => {
    let deleted = 0;
    let failed = 0;
    const errors: string[] = [];
    const db = getDb();

    for (const id of ids) {
      try {
        // Clear tray station binding first
        await db.from('tray_stations').update({ product_item_id: null, dish_name: null }).eq('product_item_id', id);

        const delResult = await db.from('product_items').delete().eq('id', id);
        if (delResult.error) {
          failed++;
          errors.push(delResult.error.message);
        } else {
          deleted++;
          // 仅在非 Electron 环境才同步到本地
          if (!isElectron()) {
            await syncDelete('product_items', id);
          }
        }
      } catch (e) {
        failed++;
        errors.push(e instanceof Error ? e.message : '删除失败');
      }
    }

    await fetchAll();
    // MQTT 实时推送：菜品变更后推送给所有在线设备
    if (isElectron()) {
      const api = (window as any).electronAPI;
      if (api?.mqttPushDishesUpdate) {
        api.mqttPushDishesUpdate().catch(() => {});
      }
    }
    return { success: failed === 0, deleted, failed, errors };
  }, [fetchAll]);

  const syncToDisplay = useCallback(async (menuDate: string): Promise<{ success: boolean; message: string }> => {
    try {
      const db = getDb();

      // 读取今日开品菜单（与 display3/display4 优先级一致）
      // ★ 修复：保留 meal_type（0=早餐, 1=午餐, 2=晚餐）
      let menuItems: { name: string; category: string; calories: number; img: string; meal_type: number }[] = [];

      if (isElectron()) {
        const loadedConfig = await loadDisplayConfig('default');
        const menu = loadedConfig?.menu as any;
        if (menu) {
          const seen = new Set<string>();
          const sections: { items: any[]; mealType: number }[] = [
            { items: menu.breakfast || [], mealType: 0 },
            { items: menu.lunch || [], mealType: 1 },
            { items: menu.dinner || [], mealType: 2 },
          ];
          for (const section of sections) {
            for (const item of section.items) {
              if (!item.name || seen.has(item.name + '_' + section.mealType)) continue;
              seen.add(item.name + '_' + section.mealType);
              menuItems.push({
                name: item.name,
                category: item.category || '其他',
                calories: item.calories || 0,
                img: item.img || '',
                meal_type: section.mealType,
              });
            }
          }
        }
      } else {
        // 浏览器模式：从 Supabase 读取 display_configs
        const { data: configRow } = await db
          .from('display_configs')
          .select('config_data')
          .eq('config_key', 'display_config')
          .maybeSingle();
        const configData = (configRow as any)?.config_data;
        const menu = configData?.menu;
        if (menu) {
          const seen = new Set<string>();
          const sections: { items: any[]; mealType: number }[] = [
            { items: menu.breakfast || [], mealType: 0 },
            { items: menu.lunch || [], mealType: 1 },
            { items: menu.dinner || [], mealType: 2 },
          ];
          for (const section of sections) {
            for (const item of section.items) {
              if (!item.name || seen.has(item.name + '_' + section.mealType)) continue;
              seen.add(item.name + '_' + section.mealType);
              menuItems.push({
                name: item.name,
                category: item.category || '其他',
                calories: item.calories || 0,
                img: item.img || '',
                meal_type: section.mealType,
              });
            }
          }
        }
      }

      // 如果菜单为空，回退到全部 active 菜品（默认午餐）
      if (menuItems.length === 0) {
        if (!dishes.length) return { success: false, message: '暂无菜品可同步' };
        menuItems = dishes
          .filter((d) => true)
          .map((d) => ({
            name: d.name,
            category: d.category,
            calories: d.calories,
            img: d.img || '',
            meal_type: 1,
          }));
      }

      // 先清空当天所有记录
      const { error: deleteErr } = await db
        .from('dish_nutrition')
        .delete()
        .eq('menu_date', menuDate);
      if (deleteErr) {
        console.warn('sync dish_nutrition delete error:', deleteErr.message);
      }

      const now = nowBeijing();
      const rows = menuItems.map((item) => ({
        dish_name: item.name,
        category: item.category,
        calories_per_100g: item.calories,
        protein_per_100g: 0,
        fat_per_100g: 0,
        carbs_per_100g: 0,
        unit: '100g',
        img: item.img,
        menu_date: menuDate,
        meal_type: item.meal_type,
        updated_at: now,
        method: '',
        nutrition_notes: '',
        dietary_restrictions: '',
      }));

      const { error: insertErr } = await db
        .from('dish_nutrition')
        .insert(rows);

      if (insertErr) {
        return { success: false, message: `同步失败：${insertErr.message}` };
      }

      // MQTT 实时推送
      if (isElectron()) {
        const api = (window as any).electronAPI;
        if (api?.mqttPushDishesUpdate) {
          api.mqttPushDishesUpdate().catch(() => {});
        }
      }

      const mealCounts = { 0: 0, 1: 0, 2: 0 };
      menuItems.forEach((item) => { mealCounts[item.meal_type] = (mealCounts[item.meal_type] || 0) + 1; });
      const summary = [];
      if (mealCounts[0] > 0) summary.push(`早餐${mealCounts[0]}道`);
      if (mealCounts[1] > 0) summary.push(`午餐${mealCounts[1]}道`);
      if (mealCounts[2] > 0) summary.push(`晚餐${mealCounts[2]}道`);

      return { success: true, message: `成功同步 ${rows.length} 道菜品到 ${menuDate}（${summary.join('、')}）` };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : '同步失败' };
    }
  }, [dishes]);

  return { dishes, categories, stations, loading, error, addDish, updateDish, deleteDish, batchDeleteDish, refetch: fetchAll, syncToDisplay };
}