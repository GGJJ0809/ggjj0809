import { loadEnvFromFileLocal, safeFetch } from './utils.js';
import { getMealNameByType, getCurrentMealType, getEffectiveMealPeriods } from './config-store.js';

// ═══ 过滤 base64 图片（防止 JSON 暴增导致乐牛闪退）═══
function sanitizeImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('data:')) return '';
  return url;
}

// ═══ 智能生成默认口味标签（兜底）═══
function generateDefaultTaste(categoryName, dishName) {
  const cat = (categoryName || '').toLowerCase();
  const name = (dishName || '').toLowerCase();
  // 按分类 + 菜名关键词匹配
  if (cat.includes('热菜') || cat.includes('荤') || cat.includes('肉') || cat.includes('炒')) {
    if (name.includes('辣') || name.includes('麻婆') || name.includes('宫保')) return ['麻辣', '香辣'];
    if (name.includes('酸甜') || name.includes('糖醋') || name.includes('番茄')) return ['酸甜', '浓郁'];
    if (name.includes('鱼香')) return ['咸辣', '微甜'];
    if (name.includes('孜然')) return ['孜然', '香烤'];
    if (name.includes('酱') || name.includes('卤')) return ['酱香', '浓郁'];
    if (name.includes('蒸') || name.includes('炖') || name.includes('煲')) return ['清淡', '鲜美'];
    if (name.includes('酸') || name.includes('醋')) return ['酸香', '开胃'];
    return ['咸鲜', '浓香'];
  }
  if (cat.includes('素') || cat.includes('蔬菜') || cat.includes('凉拌') || cat.includes('冷菜')) {
    if (name.includes('辣') || name.includes('蒜蓉')) return ['蒜香', '微辣'];
    if (name.includes('醋') || name.includes('酸')) return ['酸甜', '爽口'];
    return ['清淡', '爽脆'];
  }
  if (cat.includes('汤') || cat.includes('羹')) {
    if (name.includes('酸辣')) return ['酸辣', '浓郁'];
    return ['鲜美', '清淡'];
  }
  if (cat.includes('主食') || cat.includes('米') || cat.includes('面') || cat.includes('馒头') || cat.includes('花卷')) {
    return ['原味', '饱腹'];
  }
  if (cat.includes('小吃') || cat.includes('点心') || cat.includes('甜品')) {
    return ['香甜', '酥脆'];
  }
  return ['家常', '美味'];
}

// ═══ 智能生成默认功效标签（兜底）═══
function generateDefaultEffect(categoryName, dishName) {
  const cat = (categoryName || '').toLowerCase();
  const name = (dishName || '').toLowerCase();
  if (cat.includes('肉') || cat.includes('荤') || cat.includes('热菜')) {
    if (name.includes('排骨') || name.includes('骨')) return ['补钙', '强健骨骼'];
    if (name.includes('牛肉') || name.includes('牛')) return ['补铁补血', '增强体力'];
    if (name.includes('鸡') || name.includes('鸭')) return ['补充蛋白质', '增强免疫'];
    if (name.includes('鱼') || name.includes('虾') || name.includes('海鲜')) return ['补充蛋白质', '益智健脑'];
    if (name.includes('羊肉') || name.includes('羊')) return ['温补', '暖身驱寒'];
    if (name.includes('豆腐')) return ['补充蛋白质', '降脂降压'];
    return ['补充蛋白质', '增强体力'];
  }
  if (cat.includes('素') || cat.includes('蔬菜') || cat.includes('凉拌') || cat.includes('冷菜')) {
    if (name.includes('西兰花') || name.includes('花椰')) return ['抗氧化', '增强免疫'];
    if (name.includes('木耳')) return ['排毒养颜', '补铁'];
    if (name.includes('黄瓜')) return ['清热解暑', '补水'];
    if (name.includes('豆角') || name.includes('四季豆')) return ['补充膳食纤维', '健脾'];
    if (name.includes('土豆') || name.includes('马铃薯')) return ['补充碳水', '健脾养胃'];
    return ['补充维生素', '促进消化'];
  }
  if (cat.includes('汤') || cat.includes('羹')) {
    if (name.includes('排骨') || name.includes('骨')) return ['补钙', '滋阴润燥'];
    if (name.includes('紫菜') || name.includes('蛋花')) return ['补碘', '补充蛋白质'];
    return ['滋补养生', '暖胃'];
  }
  if (cat.includes('主食') || cat.includes('米') || cat.includes('面') || cat.includes('馒头')) {
    return ['补充碳水', '提供能量'];
  }
  if (cat.includes('小吃') || cat.includes('点心')) {
    return ['补充能量', '愉悦心情'];
  }
  return ['营养均衡', '健康美味'];
}

// ═══ 智能解析 station → product_item_id ═══
export function resolveStationProductId(dbQuery, stationId) {
  if (!dbQuery || !stationId) return { bindMode: 'all', bindValue: '', dishName: '' };
  try {
    const sr = dbQuery('SELECT id, name, product_item_id, dish_name FROM tray_stations WHERE id = ?', [stationId]);
    if (!sr || sr.length === 0) return { bindMode: 'all', bindValue: '', dishName: '' };
    const st = sr[0];
    const pid = st.product_item_id;
    const dn = st.dish_name || '';
    if (pid) {
      const pr = dbQuery('SELECT id, name FROM product_items WHERE id = ?', [pid]);
      if (pr && pr.length > 0 && (!dn || dn === pr[0].name)) return { bindMode: 'single', bindValue: String(pid), dishName: pr[0].name };
    }
    if (dn) {
      const pr = dbQuery('SELECT id, name FROM product_items WHERE name = ?', [dn]);
      if (pr && pr.length > 0) return { bindMode: 'single', bindValue: String(pr[0].id), dishName: dn };
      const likeRows = dbQuery("SELECT id, name FROM product_items WHERE name LIKE ? LIMIT 1", [`%${dn}%`]);
      if (likeRows && likeRows.length > 0) return { bindMode: 'single', bindValue: String(likeRows[0].id), dishName: dn };
    }
    return { bindMode: 'all', bindValue: '', dishName: dn };
  } catch (err) { return { bindMode: 'all', bindValue: '', dishName: '' }; }
}

// ═══ 本地菜品查询 ═══
export function fetchLocalProductItems(dbQuery, bindMode = 'all', bindValue = '') {
  if (!dbQuery) return [];
  try {
    // 先统计总记录数
    const totalRes = dbQuery('SELECT COUNT(*) as cnt FROM product_items', []);
    const totalCount = totalRes?.[0]?.cnt || 0;
    if (totalCount === 0) return [];

    let sql = "SELECT * FROM product_items WHERE status = 'active'";
    const params = [];
    if (bindMode === 'single' && bindValue) { sql += " AND id = ?"; params.push(bindValue); }
    else if (bindMode === 'category' && bindValue) { sql += " AND category_id = ?"; params.push(bindValue); }
    else if (bindMode === 'dishes' && bindValue) {
      const ids = bindValue.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length > 0) { sql += " AND id IN (" + ids.map(() => '?').join(',') + ")"; params.push(...ids); }
    }
    let rows = dbQuery(sql, params);
    if (!rows || rows.length === 0) rows = dbQuery("SELECT * FROM product_items", []);
    if (!rows || rows.length === 0) return [];

    // ★ 获取自定义字段（v852行为：从 product_custom_values 读取营养/口味/禁忌）
    let fields = [];
    try { fields = dbQuery("SELECT id, name FROM product_custom_fields", []); } catch (e) { }
    const fieldMap = {};
    fields.forEach(f => { fieldMap[f.id] = f.name; });

    const productIds = rows.map(r => r.id);
    let customValues = [];
    if (productIds.length > 0) {
      try {
        const idsStr = productIds.join(',');
        customValues = dbQuery("SELECT product_id, field_id, value FROM product_custom_values WHERE product_id IN (" + idsStr + ")", []);
      } catch (e) { }
    }

    // ★ 获取分类名（v852行为）
    let categories = [];
    try { categories = dbQuery("SELECT id, name FROM product_categories", []); } catch (e) { }
    const categoryMap = {};
    categories.forEach(c => { categoryMap[c.id] = c.name; });

    return rows.map(item => {
      const cv = customValues.filter(v => v.product_id === item.id);
      const vals = {};
      cv.forEach(v => { const fn = fieldMap[v.field_id]; if (fn) vals[fn] = v.value; });

      let media = [];
      try { media = JSON.parse(item.media || '[]'); } catch { media = []; }
      const imageUrl = sanitizeImageUrl(media[0]?.url || '');
      const catName = categoryMap[item.category_id] || '';
      const calories = Number(vals.calories) || 0;
      const protein = Number(vals.protein) || 0;
      const fat = Number(vals.fat) || 0;
      const carbs = Number(vals.carbs) || 0;
      const fiber = Number(vals.fiber) || 0;
      const dishMethod = vals.method || '';
      const dishNutrition = vals.nutrition || '';
      const dishContraindications = vals.contraindications || '';
      // ★ taste 字段：专门存口味标签（如「咸甜,浓香」），逗号分隔
      const dishTaste = vals.taste || '';
      // ★ effect 字段：功效描述（如「补铁补血,增强体力」），逗号分隔
      const dishEffect = vals.effect || '';
      // tasteList 优先用 taste 字段，fallback 到 method（兼容旧数据）
      const tasteList = dishTaste
        ? dishTaste.split(/[,，、]+/).map(s => s.trim()).filter(Boolean)
        : (dishMethod ? dishMethod.split(/[,，、\s]+/).filter(s => s.length <= 6).slice(0, 4) : generateDefaultTaste(catName, item.name));
      // effectList 从 effect 字段解析，无数据时根据分类兜底
      const effectList = dishEffect
        ? dishEffect.split(/[,，、]+/).map(s => s.trim()).filter(Boolean)
        : generateDefaultEffect(catName, item.name);

      return {
        dishId: String(item.id), name: item.name, price: Number(item.price) || 0, unit: '份',
        imageUrl, nutrition: { calories, protein, fat, carbs },
        tags: catName ? [catName] : [],
        id: String(item.id), productName: item.name, dishName: item.name,
        imgUrl: imageUrl, foodImage: imageUrl,
        calories, protein, fat, carbohydrate: carbs, fiber,
        category: catName, typeName: catName,
        dishesId: Number(item.id),
        originalPrice: Math.round((Number(item.price) || 0) * 100),
        prefPrice: Math.round((Number(item.price) || 0) * 100),
        salePrice: Math.round((Number(item.price) || 0) * 100),
        salesMode: 2, salseMode: 2, unitPrice: 0, weight: 480.0, target_weight: 480,
        tasteList, cookingMethod: dishMethod,
        nutritionDesc: dishNutrition, contraindications: dishContraindications,
        // ★ 新增：口味列表（设备屏幕「口味」显示）
        taste: dishTaste,
        tasteListStr: dishTaste,
        // ★ 新增：功效列表（设备屏幕「功效」显示）
        effect: dishEffect,
        effectList,
        effectListStr: dishEffect,
        // 兼容乐牛APK字段名
        flavorList: tasteList,
        functionList: effectList,
      };
    });
  } catch (err) { return []; }
}

// ═══ 从 tray_stations 构建兜底菜品列表 ═══
export function fetchAllStationDishesFallback(dbQuery) {
  if (!dbQuery) return [];
  try {
    const rows = dbQuery("SELECT id, name, dish_name, category, station_code FROM tray_stations WHERE dish_name IS NOT NULL AND dish_name != '' ORDER BY id", []);
    if (!rows || rows.length === 0) return [];
    const seen = new Set();
    return rows.reduce((dishes, st) => {
      const dn = (st.dish_name || '').trim();
      if (!dn || seen.has(dn)) return dishes;
      seen.add(dn);
      const cat = st.category || '';
      const fakeId = -1 * (st.id || dishes.length + 1);
      // ★ weight 兜底值 150g：此兜底路径无法从 product_items 读取真实份量
      // 真实菜品数据会通过 fetchTodayDishNutrition / fetchLocalProductItems 路径返回，那里有正确的 target_weight
      dishes.push({
        dishId: String(fakeId), name: dn, price: 0, unit: '份', imageUrl: '',
        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
        tags: cat ? [cat] : [], id: String(fakeId), productName: dn, dishName: dn,
        imgUrl: '', foodImage: '',
        calories: 0, protein: 0, fat: 0, carbohydrate: 0, fiber: 0,
        category: cat, typeName: cat, dishesId: fakeId,
        originalPrice: 0, prefPrice: 0, salePrice: 0,
        salesMode: 2, salseMode: 2, unitPrice: 0, weight: 150.0, target_weight: 150,
        tasteList: [], cookingMethod: '', nutritionDesc: '', contraindications: '',
        // ★ 新增：口味/功效字段兜底（设备兼容性）
        taste: '', tasteListStr: '', effect: '', effectList: [], effectListStr: '',
        flavorList: [], functionList: [],
      });
      return dishes;
    }, []);
  } catch (e) { return []; }
}

export async function fetchActiveProductItems(supabaseUrl, supabaseAnonKey, dbQuery, bindMode = 'all', bindValue = '') {
  if (!supabaseUrl) {
    const envData = loadEnvFromFileLocal();
    if (envData && envData.supabaseUrl) { supabaseUrl = envData.supabaseUrl; supabaseAnonKey = envData.supabaseAnonKey; }
  }
  if (dbQuery) {
    const li = fetchLocalProductItems(dbQuery, bindMode, bindValue);
    if (li.length > 0) return li;
    // ★ all-status fallback（含自定义字段数据）
    try {
      const allRows = dbQuery("SELECT * FROM product_items ORDER BY id", []);
      if (allRows && allRows.length > 0) {
        // 同样从自定义字段读取数据
        let fields = [];
        try { fields = dbQuery("SELECT id, name FROM product_custom_fields", []); } catch (e) { }
        const fieldMap = {};
        fields.forEach(f => { fieldMap[f.id] = f.name; });
        const productIds = allRows.map(r => r.id);
        let customValues = [];
        if (productIds.length > 0) {
          try {
            customValues = dbQuery("SELECT product_id, field_id, value FROM product_custom_values WHERE product_id IN (" + productIds.join(',') + ")", []);
          } catch (e) { }
        }
        let categories = [];
        try { categories = dbQuery("SELECT id, name FROM product_categories", []); } catch (e) { }
        const categoryMap = {};
        categories.forEach(c => { categoryMap[c.id] = c.name; });

        return allRows.map(item => {
          const cv = customValues.filter(v => v.product_id === item.id);
          const vals = {};
          cv.forEach(v => { const fn = fieldMap[v.field_id]; if (fn) vals[fn] = v.value; });
          let media = [];
          try { media = JSON.parse(item.media || '[]'); } catch { media = []; }
          const imageUrl = sanitizeImageUrl(media[0]?.url || '');
          const catName = categoryMap[item.category_id] || '';
          const dishTasteFallback = vals.taste || '';
          const dishEffectFallback = vals.effect || '';
          const tasteListFallback = dishTasteFallback
            ? dishTasteFallback.split(/[,，、]+/).map(s => s.trim()).filter(Boolean)
            : generateDefaultTaste(catName, item.name);
          const effectListFallback = dishEffectFallback
            ? dishEffectFallback.split(/[,，、]+/).map(s => s.trim()).filter(Boolean)
            : generateDefaultEffect(catName, item.name);
          return {
            dishId: String(item.id), name: item.name, price: Number(item.price) || 0, unit: '份',
            imageUrl, nutrition: { calories: Number(vals.calories) || 0, protein: Number(vals.protein) || 0, fat: Number(vals.fat) || 0, carbs: Number(vals.carbs) || 0 },
            tags: catName ? [catName] : [],
            id: String(item.id), productName: item.name, dishName: item.name,
            imgUrl: imageUrl, foodImage: imageUrl,
            calories: Number(vals.calories) || 0, protein: Number(vals.protein) || 0, fat: Number(vals.fat) || 0, carbohydrate: Number(vals.carbs) || 0, fiber: Number(vals.fiber) || 0,
            category: catName, typeName: catName, dishesId: Number(item.id),
            originalPrice: Math.round((Number(item.price) || 0) * 100),
            prefPrice: Math.round((Number(item.price) || 0) * 100),
            salePrice: Math.round((Number(item.price) || 0) * 100),
            salesMode: 2, salseMode: 2, unitPrice: 0, weight: 480.0, target_weight: 480,
            tasteList: tasteListFallback, cookingMethod: '', nutritionDesc: '', contraindications: '',
            taste: dishTasteFallback, tasteListStr: dishTasteFallback,
            effect: dishEffectFallback, effectList: effectListFallback, effectListStr: dishEffectFallback,
            flavorList: tasteListFallback, functionList: effectListFallback,
          };
        });
      }
    } catch (e) { }
    const fallback = fetchAllStationDishesFallback(dbQuery);
    if (fallback.length > 0) return fallback;
  }
  return [];
}

function mapDishNutritionRows(rows, dbQuery) {
  return rows.map(row => {
    const calories = Number(row.calories_per_100g) || 0;
    const protein = Number(row.protein_per_100g) || 0;
    const fat = Number(row.fat_per_100g) || 0;
    const carbs = Number(row.carbs_per_100g) || 0;
    const mealType = row.meal_type != null ? Number(row.meal_type) : 1;
    const catName = row.category || '';
    const imageUrl = sanitizeImageUrl(row.img || '');
    const dishName = row.dish_name || '';
    // ★ target_weight: 每餐目标取餐量(g)，从数据库读取，默认 480g
    const targetWeight = row.target_weight != null ? Number(row.target_weight) : 480;
    // ★ 尝试从 product_custom_values 读取 taste/effect
    let dishTaste = '';
    let dishEffect = '';
    if (dbQuery && dishName) {
      try {
        const tasteRows = dbQuery(
          "SELECT pcv.value FROM product_custom_values pcv JOIN product_custom_fields pcf ON pcv.field_id = pcf.id JOIN product_items pi ON pcv.product_id = pi.id WHERE pcf.name = 'taste' AND pi.name = ?",
          [dishName]
        );
        if (tasteRows && tasteRows.length > 0) dishTaste = tasteRows[0].value || '';
        const effectRows = dbQuery(
          "SELECT pcv.value FROM product_custom_values pcv JOIN product_custom_fields pcf ON pcv.field_id = pcf.id JOIN product_items pi ON pcv.product_id = pi.id WHERE pcf.name = 'effect' AND pi.name = ?",
          [dishName]
        );
        if (effectRows && effectRows.length > 0) dishEffect = effectRows[0].value || '';
      } catch (e) { /* ignore */ }
    }
    const tasteList = dishTaste
      ? dishTaste.split(/[,，、]+/).map(s => s.trim()).filter(Boolean)
      : generateDefaultTaste(catName, dishName);
    const effectList = dishEffect
      ? dishEffect.split(/[,，、]+/).map(s => s.trim()).filter(Boolean)
      : generateDefaultEffect(catName, dishName);
    return {
      dishId: String(row.id), name: dishName, price: 0, unit: '份',
      imageUrl, nutrition: { calories, protein, fat, carbs },
      tags: catName ? [catName] : [],
      id: String(row.id), productName: dishName, dishName,
      imgUrl: imageUrl, foodImage: imageUrl,
      calories, protein, fat, carbohydrate: carbs, fiber: 0,
      category: catName, typeName: catName,
      mealType, mealName: getMealNameByType(mealType),
      dishesId: Number(row.id),
      originalPrice: 0, prefPrice: 0, salePrice: 0,
      salesMode: 2, salseMode: 2, unitPrice: 0,
      weight: targetWeight,
      target_weight: targetWeight,
      tasteList, cookingMethod: '', nutritionDesc: '', contraindications: '',
      taste: dishTaste, tasteListStr: dishTaste,
      effect: dishEffect, effectList, effectListStr: dishEffect,
      flavorList: tasteList, functionList: effectList,
    };
  });
}

export async function fetchTodayDishNutrition(supabaseUrl, supabaseAnonKey, dbQuery, applyDate) {
  // ★ 优先用调用方传入的 applyDate（设备 bind-info-config/page 接口里的日期）
  // ★★★ 统一使用北京时间 UTC+8 计算日期字符串
  // 之前 tsLocal 用 new Date() 取本地时间，非 UTC+8 服务器会得到错误日期
  const nowBeijing = new Date(Date.now() + 8 * 3600 * 1000);
  const tsBeijing = `${nowBeijing.getUTCFullYear()}-${String(nowBeijing.getUTCMonth() + 1).padStart(2, '0')}-${String(nowBeijing.getUTCDate()).padStart(2, '0')}`;
  const ts = applyDate || tsBeijing;

  if (!supabaseUrl) {
    const envData = loadEnvFromFileLocal();
    if (envData && envData.supabaseUrl) { supabaseUrl = envData.supabaseUrl; supabaseAnonKey = envData.supabaseAnonKey; }
  }

  if (dbQuery) {
    try {
      // ★★★ 确保本地 SQLite dish_nutrition 表有 dietary_fiber_per_100g 列
      // 旧版本同步时未包含此列，导致 mqtt-broker 营养查询报 "no such column" 错误
      try { dbQuery('ALTER TABLE dish_nutrition ADD COLUMN dietary_fiber_per_100g NUMERIC DEFAULT 0', []); }
      catch (e) { /* 列已存在则忽略 */ }
      try { dbQuery('ALTER TABLE dish_nutrition ADD COLUMN sodium_per_100g NUMERIC DEFAULT 0', []); }
      catch (e) { /* 列已存在则忽略 */ }
      try { dbQuery('ALTER TABLE dish_nutrition ADD COLUMN target_weight REAL DEFAULT 480', []); }
      catch (e) { /* 列已存在则忽略 */ }

      let rows = dbQuery('SELECT * FROM dish_nutrition WHERE menu_date = ? ORDER BY meal_type, id', [ts]);
      if (rows && rows.length > 0) {
        console.log('[fetchTodayDishNutrition] ★ SQLite 命中 ' + rows.length + ' 条菜品，日期=' + (rows[0]?.menu_date || ts));
        return mapDishNutritionRows(rows, dbQuery);
      }
      // ★★★ 兜底：今天没有数据时，返回最近一天的菜品（避免设备「切换菜品」显示空）
      // 本地局域网环境中菜品数据不每天更新很正常，兜底最新日期让设备始终有菜可选
      if (!applyDate) {
        const lr = dbQuery('SELECT menu_date FROM dish_nutrition ORDER BY menu_date DESC LIMIT 1', []);
        if (lr && lr.length > 0 && lr[0].menu_date) {
          const latestDate = lr[0].menu_date;
          console.log('[fetchTodayDishNutrition] 今天(' + ts + ')无数据，兜底最近日期 ' + latestDate);
          const fr = dbQuery('SELECT * FROM dish_nutrition WHERE menu_date = ? ORDER BY meal_type, id', [latestDate]);
          if (fr && fr.length > 0) {
            console.log('[fetchTodayDishNutrition] ★ 兜底命中 ' + fr.length + ' 条菜品，日期=' + latestDate);
            return mapDishNutritionRows(fr, dbQuery);
          }
        }
      }
    } catch (e) { console.warn('[fetchTodayDishNutrition] SQLite 查询失败:', e.message); }
  }

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const baseUrl = supabaseUrl.replace(/\/+$/, '');
      const headers = { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` };
      const dateFilter = `menu_date=eq.${ts}`;
      const res = await Promise.race([
        safeFetch(`${baseUrl}/rest/v1/dish_nutrition?select=*&${dateFilter}&order=meal_type.asc,id.asc`, { headers }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          if (dbQuery) {
            try {
              for (const row of data) {
                dbQuery(
                  `INSERT OR REPLACE INTO dish_nutrition (id, dish_name, category, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g, dietary_fiber_per_100g, sodium_per_100g, unit, img, menu_date, meal_type, target_weight, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                  [row.id, row.dish_name, row.category || '', row.calories_per_100g || 0, row.protein_per_100g || 0, row.fat_per_100g || 0, row.carbs_per_100g || 0, row.dietary_fiber_per_100g || 0, row.sodium_per_100g || 0, row.unit || '100g', row.img || '', row.menu_date, row.meal_type || 1, row.target_weight ?? 480]
                );
              }
            } catch (syncErr) { }
          }
          return mapDishNutritionRows(data, dbQuery);
        }
      }
    } catch (e) { }
  }

  if (dbQuery) {
    try {
      const lr = dbQuery('SELECT menu_date FROM dish_nutrition ORDER BY menu_date DESC LIMIT 1', []);
      if (lr && lr.length > 0 && lr[0].menu_date) {
        const latestDate = lr[0].menu_date;
        // ★★★ 返回最新日期的菜品，不限制必须是今天
        // 本地局域网环境中菜品不每天更新很正常，设备应始终能看到菜品
        const fr = dbQuery('SELECT * FROM dish_nutrition WHERE menu_date = ? ORDER BY meal_type, id', [latestDate]);
        if (fr && fr.length > 0) {
          console.log('[fetchTodayDishNutrition] ★ SQLite 最新日期兜底 ' + latestDate + '，返回 ' + fr.length + ' 条');
          return mapDishNutritionRows(fr, dbQuery);
        }
      } else {
        console.log('[fetchTodayDishNutrition] dish_nutrition 表为空，返回 null');
      }
    } catch (e) { console.warn('[fetchTodayDishNutrition] 最新日期查询失败:', e.message); }
  }
  return null;
}

// ═══ 传感器 MQTT 数据写入 ═══
export async function writeSensorReading(supabaseUrl, supabaseAnonKey, sensorId, payload, dbQuery) {
  const now = new Date().toISOString();

  const PRESET_ZONE_MAP = {
    'TH_MIANDIAN_01': '面点加工间', 'TH_LENGCAI_01': '冷菜加工间',
    'TH_CAOZUO_01': '操作间', 'TH_SHUCAI_01': '蔬菜加工间',
    'TH_ROULEI_01': '肉类加工间', 'TH_ZHUSHI_01': '主食库房',
    'TH_OFFICE_01': '管理办公室',
    'SMOKE_CAOZUO_01': '操作间', 'SMOKE_ZHUSHI_01': '主食库房',
    'SMOKE_OFFICE_01': '管理办公室', 'AQ_CAOZUO_01': '操作间',
  };

  let zone = PRESET_ZONE_MAP[sensorId] || null;
  if (!zone && dbQuery) {
    try {
      const bindingRows = dbQuery('SELECT zone, device_name FROM gateway_sensor_bindings WHERE device_sn = ? LIMIT 1', [sensorId]);
      if (bindingRows && bindingRows.length > 0) zone = bindingRows[0].zone || bindingRows[0].device_name || null;
    } catch (e) { }
  }
  if (!zone) zone = /^\d+$/.test(sensorId) && sensorId.length > 6 ? `传感器-${sensorId.slice(-5)}` : sensorId;

  const reading = {
    zone, sensor_id: sensorId,
    pm25: payload.pm25 != null ? Number(payload.pm25) : null,
    pm10: payload.pm10 != null ? Number(payload.pm10) : null,
    temp: payload.temp != null ? Number(payload.temp) : null,
    humidity: payload.humidity != null ? Number(payload.humidity) : null,
    co2: payload.co2 != null ? Number(payload.co2) : null,
    recorded_at: now, source: 'mqtt', created_at: now, updated_at: now,
  };

  if (dbQuery) {
    try {
      const cols = Object.keys(reading);
      const vals = Object.values(reading);
      dbQuery(`INSERT INTO "environment_readings" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${vals.map(() => '?').join(',')})`, vals);
    } catch (err) { }
  }

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const baseUrl = supabaseUrl.replace(/\/+$/, '');
      const headers = { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
      await safeFetch(`${baseUrl}/rest/v1/environment_readings`, { method: 'POST', headers, body: JSON.stringify(reading) });
    } catch (err) { }
  }
}

// ═══ 解析 content 字段 ═══
export function parseContent(body) {
  const c = body?.content || body?.Content || '';
  if (c && typeof c === 'string' && c.length > 2 && c.startsWith('{')) {
    try { return JSON.parse(c); } catch (e) { return {}; }
  }
  return {};
}

// ═══ 从 tray_pickup_logs 查找实际取餐重量，缩放营养值 ═══
// 每个菜品按 dish_name 匹配最近一次取餐记录中的 pickup_weight
// 营养值（calories/protein/fat/carbohydrate/fiber）以每100g为基准缩放
// 无取餐数据 → weight 设为 0，营养成分归零
export function enrichWithPickupData(dbQuery, dishes) {
  if (!dbQuery || !dishes || dishes.length === 0) return dishes;
  try {
    const uniqueNames = [...new Set(dishes.map(d => (d.dishName || d.name || '').trim()).filter(Boolean))];
    if (uniqueNames.length === 0) return dishes;
    const pickupMap = {};
    for (const name of uniqueNames) {
      try {
        const rows = dbQuery(
          'SELECT pickup_weight FROM tray_pickup_logs WHERE dish_name = ? ORDER BY pickup_time DESC LIMIT 1',
          [name]
        );
        if (rows && rows.length > 0) {
          const pw = Number(rows[0].pickup_weight) || 0;
          if (pw > 0) pickupMap[name] = pw;
        }
      } catch (e) { /* 单条查询失败不影响其他 */ }
    }
    return dishes.map(dish => {
      const dishName = (dish.dishName || dish.name || '').trim();
      const pw = pickupMap[dishName];
      if (pw && pw > 0) {
        // nutrition is per 100g in dish_nutrition, scale by actual weight
        const ratio = pw / 100;
        return {
          ...dish,
          weight: pw,
          calories: Math.round((Number(dish.calories) || 0) * ratio * 10) / 10,
          protein: Math.round((Number(dish.protein) || 0) * ratio * 10) / 10,
          fat: Math.round((Number(dish.fat) || 0) * ratio * 10) / 10,
          carbohydrate: Math.round((Number(dish.carbohydrate) || 0) * ratio * 10) / 10,
          fiber: Math.round((Number(dish.fiber) || 0) * ratio * 10) / 10,
        };
      }
      // no pickup data → weight 0, nutrition stays (will be || 0 in response)
      return { ...dish, weight: 0 };
    });
  } catch (e) {
    console.warn('[enrichWithPickupData] 失败: ' + e.message);
    return dishes;
  }
}

// ═══ 构建 API 文档格式的 mealList ═══
export function buildMealListFromProducts(products) {
  if (!products || products.length === 0) return [];
  return products.map((item, idx) => ({
    dishesId: Number(item.id) || (100000 + idx), customId: 0,
    productName: item.name || item.dishName || '',
    originalPrice: Math.round((Number(item.price) || 0) * 100),
    salseMode: 2, salesMode: 2, weightDeviation: 0.0, weight: Number(item.weight) || Number(item.target_weight) || 480.0,
    typeId: 0, typeName: (item.tags && item.tags[0]) || item.category || '',
    pinyinInitials: '', pinyinFull: '', purine: 0.0, iodine: 0.0, initialScore: 0,
    calories: Number(item.calories) || 0.0, protein: Number(item.protein) || 0.0,
    fat: Number(item.fat) || 0.0, carbohydrate: Number(item.carbohydrate) || 0.0,
    dietaryFiber: Number(item.fiber) || 0.0, cholesterol: 0.0, calcium: 0.0, sodium: 0.0,
    caloriesNrv: 0.0, proteinNrv: 0.0, fatNrv: 0.0, carbohydrateNrv: 0.0,
    dietaryFiberNrv: 0.0, cholesterolNrv: 0.0, calciumNrv: 0.0, sodiumNrv: 0.0,
    foodImage: sanitizeImageUrl(item.imageUrl || item.imgUrl || ''),
    intro: item.nutritionDesc || '',
    labelList: item.tags || [],
    // ★ 口味列表：优先用菜品的 tasteList（已经是数组）
    tasteList: item.tasteList || [],
    taste: item.taste || '',
    flavorList: item.tasteList || [],
    // ★ 功效列表：优先用新的 effectList，其次用 contraindications
    effectList: item.effectList || [],
    effect: item.effect || '',
    functionList: item.effectList || [],
    mainList: [], auxList: [], dosList: [],
    contraList: item.contraindications ? [item.contraindications] : [],
    monthlySales: 0, goodProbability: 0.0,
  }));
}

// ═══ 构建 dateList + intervalList + productList ═══
export function buildRecipeDateList(products) {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const todayStr = d.toISOString().slice(0, 10);
  const periods = getEffectiveMealPeriods();
  const currentMeal = getCurrentMealType();
  const currentPeriod = periods.find(p => p.mealType === currentMeal) || periods[0];
  const productList = (products || []).map((item, idx) => ({
    detailId: idx + 1, dishesId: Number(item.id) || (100000 + idx),
    prefPrice: Math.round((Number(item.price) || 0) * 100),
    salePrice: Math.round((Number(item.price) || 0) * 100),
    salesMode: 2, weight: Number(item.weight) || Number(item.target_weight) || 480.0,
  }));
  const intervalList = [{
    intervalId: currentMeal,
    intervalName: currentPeriod.mealName,
    startTime: { hour: currentPeriod.startHour, minute: currentPeriod.startMinute, second: 0, nano: 0 },
    endTime: { hour: currentPeriod.endHour, minute: currentPeriod.endMinute, second: 0, nano: 0 },
    productList,
  }];
  return [{ applyDate: todayStr, intervalList }];
}

export function buildRecipeDateListFromDishNutrition(products) {
  // ★★★ 使用北京时间 UTC+8，与 buildRecipeDateList 保持一致
  // 老版本 new Date() 在非北京时区机器上会生成错误日期，导致新APK设备查不到菜品
  const nowBeijing = new Date(Date.now() + 8 * 3600 * 1000);
  const todayStr = `${nowBeijing.getUTCFullYear()}-${String(nowBeijing.getUTCMonth() + 1).padStart(2, '0')}-${String(nowBeijing.getUTCDate()).padStart(2, '0')}`;
  const mealGroups = { 0: [], 1: [], 2: [] };
  (products || []).forEach((item, idx) => {
    const mt = item.mealType != null ? Number(item.mealType) : 1;
    (mealGroups[mt] || mealGroups[1]).push({
      detailId: idx + 1, dishesId: Number(item.id) || (100000 + idx),
      prefPrice: 0, salePrice: 0, salesMode: 2, weight: Number(item.weight) || Number(item.target_weight) || 480.0,
    });
  });
  const periods = getEffectiveMealPeriods();
  const intervalList = [];
  for (const p of periods) {
    if (mealGroups[p.mealType] && mealGroups[p.mealType].length > 0) {
      intervalList.push({
        intervalId: p.mealType, intervalName: p.mealName,
        startTime: { hour: p.startHour, minute: p.startMinute, second: 0, nano: 0 },
        endTime: { hour: p.endHour, minute: p.endMinute, second: 0, nano: 0 },
        productList: mealGroups[p.mealType],
      });
    }
  }
  if (intervalList.length === 0) {
    const currentMeal = getCurrentMealType();
    const currentPeriod = periods.find(p => p.mealType === currentMeal) || periods[0];
    const productList = (products || []).map((item, idx) => ({
      detailId: idx + 1, dishesId: Number(item.id) || (100000 + idx),
      prefPrice: 0, salePrice: 0, salesMode: 2, weight: Number(item.weight) || Number(item.target_weight) || 480.0,
    }));
    intervalList.push({
      intervalId: currentMeal, intervalName: currentPeriod.mealName,
      startTime: { hour: currentPeriod.startHour, minute: currentPeriod.startMinute, second: 0, nano: 0 },
      endTime: { hour: currentPeriod.endHour, minute: currentPeriod.endMinute, second: 0, nano: 0 },
      productList,
    });
  }
  return [{ applyDate: todayStr, intervalList }];
}