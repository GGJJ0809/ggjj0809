import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function sanitizeImageUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('data:')) return '';
  return url;
}

async function handleRegister(req: Request, supabase: any) {
  const url = new URL(req.url);
  let body: any;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const sn = body?.sn || url.searchParams.get('sn');
  const key = body?.key || url.searchParams.get('key');

  if (!sn || !key) {
    return new Response(
      JSON.stringify({ code: 400, message: '缺少参数: sn 和 key 必填', data: null }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { data: device, error: deviceErr } = await supabase
    .from('tray_display_devices')
    .select('id, name, sn, hw_key, location, status, station_id, bind_mode, bind_value, device_type, max_price_temp_dish, interval_price_temp_dish, min_price_temp_dish, bind_plate_before_take, ui_template, weigh_alarm_model, min_settlement_weight, stable_difference, alarm_below_grams, max_weight_dish')
    .eq('sn', String(sn))
    .maybeSingle();

  if (deviceErr || !device) {
    return new Response(
      JSON.stringify({ code: 404, message: '设备不存在', data: null }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (device.hw_key !== String(key)) {
    return new Response(
      JSON.stringify({ code: 403, message: '验证码错误', data: null }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const token = generateToken();
  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('tray_display_devices')
    .update({ token, status: 'online', last_seen: now, last_pull_at: now })
    .eq('id', device.id);

  if (updateErr) {
    return new Response(
      JSON.stringify({ code: 500, message: 'Token 保存失败', data: null }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

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

  return new Response(
    JSON.stringify({
      code: 200,
      message: 'success',
      data: {
        token,
        deviceId: device.id,
        station: stationInfo,
        bindMode: device.bind_mode || 'station',
        bindValue: device.bind_value || '',
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
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

async function handleDishes(req: Request, supabase: any) {
  const url = new URL(req.url);
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || url.searchParams.get('token');

  if (!token) {
    return new Response(
      JSON.stringify({ code: 401, message: '缺少 Authorization Token', data: null }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { data: device, error: deviceErr } = await supabase
    .from('tray_display_devices')
    .select('id, name, status, station_id, bind_mode, bind_value, max_price_temp_dish, interval_price_temp_dish, min_price_temp_dish, bind_plate_before_take, ui_template, weigh_alarm_model, min_settlement_weight, stable_difference, alarm_below_grams, max_weight_dish')
    .eq('token', token)
    .maybeSingle();

  if (deviceErr || !device) {
    return new Response(
      JSON.stringify({ code: 401, message: 'Token 无效', data: null }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const now = new Date().toISOString();
  await supabase
    .from('tray_display_devices')
    .update({ last_pull_at: now, status: 'online' })
    .eq('id', device.id);

  const { data: customFields } = await supabase
    .from('product_custom_fields')
    .select('id, name')
    .in('name', ['calories', 'protein', 'fat', 'carbs']);
  const fieldMap: Record<string, number> = {};
  (customFields || []).forEach((f: any) => { fieldMap[f.name] = f.id; });

  const { data: categories } = await supabase
    .from('product_categories')
    .select('id, name, sort_order')
    .order('sort_order');
  const catMap: Record<number, string> = {};
  (categories || []).forEach((c: any) => { catMap[c.id] = c.name; });

  const bindMode = device.bind_mode || 'station';
  const bindValue = device.bind_value || '';
  let products: any[] = [];

  if (bindMode === 'all') {
    const { data: allProducts } = await supabase
      .from('product_items')
      .select('id, name, price, media, category_id')
      .eq('status', 'active')
      .order('id');
    products = allProducts || [];
  } else if (bindMode === 'station') {
    if (device.station_id) {
      const { data: stationData } = await supabase
        .from('tray_stations')
        .select('product_item_id, dish_name')
        .eq('id', device.station_id)
        .maybeSingle();
      if (stationData?.product_item_id) {
        const { data: productData } = await supabase
          .from('product_items')
          .select('id, name, price, media, category_id')
          .eq('id', stationData.product_item_id)
          .eq('status', 'active')
          .maybeSingle();
        if (productData) products = [productData];
      }
    }
  } else if (bindMode === 'category' && bindValue) {
    const { data: catProducts } = await supabase
      .from('product_items')
      .select('id, name, price, media, category_id')
      .eq('status', 'active')
      .eq('category_id', Number(bindValue))
      .order('id');
    products = catProducts || [];
  } else if (bindMode === 'single' && bindValue) {
    const { data: singleProduct } = await supabase
      .from('product_items')
      .select('id, name, price, media, category_id')
      .eq('id', Number(bindValue))
      .eq('status', 'active')
      .maybeSingle();
    if (singleProduct) products = [singleProduct];
  } else if (bindMode === 'dishes' && bindValue) {
    const ids = bindValue.split(',').map((s: string) => Number(s.trim())).filter((n: number) => !isNaN(n));
    if (ids.length > 0) {
      const { data: dishProducts } = await supabase
        .from('product_items')
        .select('id, name, price, media, category_id')
        .eq('status', 'active')
        .in('id', ids)
        .order('id');
      products = dishProducts || [];
    }
  } else {
    if (device.station_id) {
      const { data: stationData } = await supabase
        .from('tray_stations')
        .select('product_item_id')
        .eq('id', device.station_id)
        .maybeSingle();
      if (stationData?.product_item_id) {
        const { data: productData } = await supabase
          .from('product_items')
          .select('id, name, price, media, category_id')
          .eq('id', stationData.product_item_id)
          .eq('status', 'active')
          .maybeSingle();
        if (productData) products = [productData];
      }
    }
  }

  const productIds = products.map((p: any) => p.id);

  let customValues: any[] = [];
  if (productIds.length > 0) {
    const { data: cvData } = await supabase
      .from('product_custom_values')
      .select('product_id, field_id, value')
      .in('product_id', productIds);
    customValues = cvData || [];
  }

  const dishes = products.map((product: any) => {
    const cv = customValues.filter((v: any) => v.product_id === product.id);
    const vals: Record<string, string> = {};
    cv.forEach((v: any) => {
      const fn = Object.keys(fieldMap).find((k) => fieldMap[k] === v.field_id);
      if (fn) vals[fn] = v.value;
    });

    const media = product.media as Array<{ url: string; type: string }> | null;
    const imageUrl = sanitizeImageUrl(media?.[0]?.url || '');
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

  return new Response(
    JSON.stringify({
      code: 200,
      message: 'success',
      data: {
        dishes,
        station: stationInfo,
        bindMode,
        bindValue,
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
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ code: 500, message: '服务器配置错误', data: null }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  if (path.endsWith('/api/device/register') && req.method === 'POST') {
    return handleRegister(req, supabase);
  }

  if (path.endsWith('/api/dishes') && req.method === 'GET') {
    return handleDishes(req, supabase);
  }

  return new Response(
    JSON.stringify({ code: 404, message: '接口不存在', data: null }),
    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
