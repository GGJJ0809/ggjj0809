import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getCurrentMealType(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return '早餐';
  if (hour >= 11 && hour < 16) return '午餐';
  if (hour >= 16 && hour < 22) return '晚餐';
  return '夜宵';
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function handleWeightReport(req: Request, supabase: any) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ code: 400, message: '请求体格式错误', data: null }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { sn, key, weight } = body || {};

  if (!sn || !key || weight === undefined || weight === null) {
    return new Response(
      JSON.stringify({ code: 400, message: '缺少参数: sn、key 和 weight 必填', data: null }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const weightValue = Number(weight);
  if (isNaN(weightValue) || weightValue < 0) {
    return new Response(
      JSON.stringify({ code: 400, message: 'weight 参数无效', data: null }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // 1. 验证设备
  const { data: device, error: deviceErr } = await supabase
    .from('tray_display_devices')
    .select('id, name, sn, hw_key, station_id, status, device_type')
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

  // 2. 检查设备类型是否支持称重
  const deviceType = device.device_type || 'display_scale';
  if (deviceType === 'display') {
    return new Response(
      JSON.stringify({ code: 400, message: '该设备类型不支持称重上报', data: null }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // 3. 找到绑定的托盘
  let station: any = null;
  if (device.station_id) {
    const { data: stationData } = await supabase
      .from('tray_stations')
      .select('*')
      .eq('id', device.station_id)
      .maybeSingle();
    station = stationData;
  }

  if (!station) {
    return new Response(
      JSON.stringify({ code: 400, message: '该设备未绑定取餐托盘', data: null }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const now = new Date().toISOString();
  const lastWeight = Number(station.hw_last_weight) || 0;
  const tareWeight = Number(station.tare_weight) || 0;
  const pickupWeight = Math.max(0, lastWeight - weightValue);
  let logCreated = false;

  // 4. 如果重量下降且超过50g（防止抖动），自动记录取餐
  if (lastWeight > 0 && pickupWeight > 50) {
    const mealType = getCurrentMealType();
    const today = getTodayDate();
    const { error: logErr } = await supabase.from('tray_pickup_logs').insert({
      station_id: station.id,
      station_code: station.station_code,
      dish_name: station.dish_name || '未知菜品',
      category: station.category || '其他',
      meal_type: mealType,
      pickup_time: now,
      weight_before: lastWeight,
      weight_after: weightValue,
      pickup_weight: pickupWeight,
      pickup_portions: 1,
      person_id: null,
      notes: '自动记录（称重上报）',
      source: 'auto',
    });
    if (!logErr) {
      logCreated = true;
    }
  }

  // 5. 更新托盘最新重量和最后上报时间
  const { error: updateErr } = await supabase
    .from('tray_stations')
    .update({
      hw_last_weight: weightValue,
      hw_last_seen: now,
      hw_enabled: true,
    })
    .eq('id', station.id);

  if (updateErr) {
    return new Response(
      JSON.stringify({ code: 500, message: '重量更新失败', data: null }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // 6. 更新设备状态为在线
  await supabase
    .from('tray_display_devices')
    .update({ status: 'online', last_seen: now })
    .eq('id', device.id);

  const netWeight = Math.max(0, weightValue - tareWeight);

  return new Response(
    JSON.stringify({
      code: 200,
      message: 'success',
      data: {
        log_created: logCreated,
        pickup_weight: logCreated ? pickupWeight : 0,
        last_weight: lastWeight,
        current_weight: weightValue,
        net_weight: netWeight,
        tare_weight: tareWeight,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

async function handleGetWeight(req: Request, supabase: any) {
  const url = new URL(req.url);
  const sn = url.searchParams.get('sn') || '';
  const key = url.searchParams.get('key') || '';

  if (!sn || !key) {
    return new Response(
      JSON.stringify({ code: 400, message: '缺少参数: sn 和 key 必填', data: null }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // 验证设备
  const { data: device, error: deviceErr } = await supabase
    .from('tray_display_devices')
    .select('id, name, sn, hw_key, station_id, status')
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

  // 更新设备状态
  const now = new Date().toISOString();
  await supabase
    .from('tray_display_devices')
    .update({ status: 'online', last_seen: now })
    .eq('id', device.id);

  // 查询托盘信息
  let station: any = null;
  if (device.station_id) {
    const { data: stationData } = await supabase
      .from('tray_stations')
      .select('id, name, station_code, dish_name, category, hw_last_weight, tare_weight, hw_last_seen')
      .eq('id', device.station_id)
      .maybeSingle();
    station = stationData;
  }

  if (!station) {
    return new Response(
      JSON.stringify({ code: 200, message: 'success', data: { weight: null } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const netWeight = Math.max(0, (Number(station.hw_last_weight) || 0) - (Number(station.tare_weight) || 0));

  return new Response(
    JSON.stringify({
      code: 200,
      message: 'success',
      data: {
        device: {
          name: device.name,
          status: device.status,
        },
        station: {
          name: station.name,
          station_code: station.station_code,
          dish_name: station.dish_name,
          category: station.category,
        },
        weight: {
          current: Number(station.hw_last_weight) || 0,
          tare: Number(station.tare_weight) || 0,
          net: netWeight,
          last_seen: station.hw_last_seen,
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

  if (path.endsWith('/api/weight/report') && req.method === 'POST') {
    return handleWeightReport(req, supabase);
  }

  if (path.endsWith('/api/weight') && req.method === 'GET') {
    return handleGetWeight(req, supabase);
  }

  return new Response(
    JSON.stringify({ code: 404, message: '接口不存在', data: null }),
    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
