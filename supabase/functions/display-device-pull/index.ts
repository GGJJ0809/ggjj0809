import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const sn = url.searchParams.get('sn') || '';
  const key = url.searchParams.get('key') || '';

  if (!sn || !key) {
    return new Response(
      JSON.stringify({ code: 400, message: '缺少参数: sn 和 key 必填', data: null }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ code: 500, message: '服务器配置错误', data: null }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // 1. 验证设备
  const { data: device, error: deviceErr } = await supabase
    .from('tray_display_devices')
    .select('id, name, sn, hw_key, location, station_id, status, bind_mode, bind_value, ui_template, max_price_temp_dish, interval_price_temp_dish, min_price_temp_dish, bind_plate_before_take, weigh_alarm_model, min_settlement_weight, stable_difference, alarm_below_grams, max_weight_dish')
    .eq('sn', sn)
    .maybeSingle();

  if (deviceErr || !device) {
    return new Response(
      JSON.stringify({ code: 404, message: '设备不存在', data: null }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (device.hw_key !== key) {
    return new Response(
      JSON.stringify({ code: 403, message: '验证码错误', data: null }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // 2. 更新设备状态
  const now = new Date().toISOString();
  await supabase
    .from('tray_display_devices')
    .update({ last_pull_at: now, status: 'online' })
    .eq('id', device.id);

  // 3. 获取分类
  const { data: categories } = await supabase
    .from('product_categories')
    .select('id, name, sort_order')
    .order('sort_order');
  const catMap: Record<number, string> = {};
  (categories || []).forEach((c: any) => { catMap[c.id] = c.name; });

  // 4. 获取自定义字段（营养信息）
  const { data: customFields } = await supabase
    .from('product_custom_fields')
    .select('id, name')
    .in('name', ['calories', 'protein', 'fat', 'carbs']);
  const fieldMap: Record<string, number> = {};
  (customFields || []).forEach((f: any) => { fieldMap[f.name] = f.id; });

  // 5. 根据 bind_mode 获取菜品
  const bindMode = device.bind_mode || 'all';
  const bindValue = device.bind_value || '';
  let productQuery = supabase
    .from('product_items')
    .select('id, name, category_id, price, status, media')
    .eq('status', 'active');

  if (bindMode === 'category' && bindValue) {
    productQuery = productQuery.eq('category_id', Number(bindValue));
  } else if (bindMode === 'single' && bindValue) {
    productQuery = productQuery.eq('id', Number(bindValue));
  } else if (bindMode === 'dishes' && bindValue) {
    const ids = bindValue.split(',').map((s: string) => Number(s.trim())).filter((n: number) => !isNaN(n));
    if (ids.length > 0) productQuery = productQuery.in('id', ids);
  } else if (bindMode === 'station' && device.station_id) {
    // 从 tray_stations 获取绑定菜品
    const { data: stationData } = await supabase
      .from('tray_stations')
      .select('product_item_id')
      .eq('id', device.station_id)
      .maybeSingle();
    if (stationData?.product_item_id) {
      productQuery = productQuery.eq('id', stationData.product_item_id);
    }
  }

  const { data: products } = await productQuery.order('id');

  // 6. 获取自定义值
  const productIds = (products || []).map((p: any) => p.id);
  let customValues: any[] = [];
  if (productIds.length > 0) {
    const { data: cvData } = await supabase
      .from('product_custom_values')
      .select('product_id, field_id, value')
      .in('product_id', productIds);
    customValues = cvData || [];
  }

  // 7. 组装 dishes 数组 (与 device-api 格式一致)
  const dishes = (products || []).map((product: any) => {
    const cv = customValues.filter((v: any) => v.product_id === product.id);
    const vals: Record<string, string> = {};
    cv.forEach((v: any) => {
      const fn = Object.keys(fieldMap).find((k) => fieldMap[k] === v.field_id);
      if (fn) vals[fn] = v.value;
    });

    const media = product.media as Array<{ url: string; type: string }> | null;
    const imageUrl = media?.[0]?.url || '';
    const categoryName = catMap[product.category_id] || '';
    const tags: string[] = [];
    if (categoryName) tags.push(categoryName);

    return {
      dishId: String(product.id),
      name: product.name,
      price: Number(product.price) || 0,
      unit: '份',
      imageUrl,
      nutrition: {
        calories: Number(vals.calories) || 0,
        protein: Number(vals.protein) || 0,
        fat: Number(vals.fat) || 0,
        carbs: Number(vals.carbs) || 0,
      },
      tags,
    };
  });

  // 8. 获取托盘信息
  let stationInfo: any = null;
  if (device.station_id) {
    const { data: st } = await supabase
      .from('tray_stations')
      .select('id, name, station_code, category, dish_name, product_item_id, tare_weight, hw_last_weight')
      .eq('id', device.station_id)
      .maybeSingle();
    if (st) {
      stationInfo = {
        stationId: st.id,
        name: st.name,
        stationCode: st.station_code,
        category: st.category,
        dishName: st.dish_name || '',
        productItemId: st.product_item_id,
        tareWeight: Number(st.tare_weight) || 0,
        currentWeight: Number(st.hw_last_weight) || 0,
      };
    }
  }

  // 9. 按分类组织菜单 (兼容旧版 display-device-pull 调用方)
  const menuItemsMap: Record<string, any[]> = {};
  dishes.forEach((dish: any) => {
    const catName = dish.tags?.[0] || '其他';
    if (!menuItemsMap[catName]) menuItemsMap[catName] = [];
    menuItemsMap[catName].push({
      name: dish.name,
      price: dish.price,
      calories: dish.nutrition.calories,
      protein: dish.nutrition.protein,
      fat: dish.nutrition.fat,
      carbs: dish.nutrition.carbs,
      image: dish.imageUrl,
      category: catName,
    });
  });

  const catOrder = new Map<string, number>();
  (categories || []).forEach((c: any) => catOrder.set(c.name, c.sort_order));
  const sortedCats = Object.keys(menuItemsMap).sort((a, b) => (catOrder.get(a) || 999) - (catOrder.get(b) || 999));
  const menuCategories = sortedCats.map((catName) => ({
    name: catName,
    items: menuItemsMap[catName],
  }));

  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  return new Response(
    JSON.stringify({
      code: 200,
      message: 'success',
      data: {
        device: {
          id: device.id,
          name: device.name,
          location: device.location || '',
          status: device.status,
          bindMode,
          bindValue,
        },
        station: stationInfo,
        menu: { date: today, categories: menuCategories },
        dishes,
        deviceConfig: {
          maxPriceListForTemporaryDishes: device.max_price_temp_dish ?? 100,
          intervalPriceListForTemporaryDishes: device.interval_price_temp_dish ?? 0.5,
          mixPriceListForTemporaryDishes: device.min_price_temp_dish ?? 0,
          ifBindplatebeforetakefood: device.bind_plate_before_take ?? 1,
          deviceUITemplate: device.ui_template ?? 1,
          weighAlarmModel: device.weigh_alarm_model ?? 1,
          minimumsettlementweigh: device.min_settlement_weight ?? 10,
          stabledifference: device.stable_difference ?? 2,
          alarmBelowHowGrams: device.alarm_below_grams ?? -1000,
          maxWeightDish: device.max_weight_dish ?? 5000,
        },
        timestamp: now,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
