import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// WebSocket 连接池: ws -> device info
const clients: Map<WebSocket, { id: number; name: string; sn: string; station_id: number | null; bind_mode: string | null; bind_value: string | null }> = new Map();

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, serviceKey);

/** 根据设备 bind_mode/bind_value/station_id 获取该设备应展示的菜品列表 */
async function getMenuForDevice(bindMode: string | null, bindValue: string | null, stationId: number | null): Promise<any[]> {
  const { data: customFields } = await supabase
    .from('product_custom_fields')
    .select('id, name')
    .in('name', ['calories', 'protein', 'fat', 'carbs']);
  const fieldMap: Record<string, number> = {};
  (customFields || []).forEach((f: any) => { fieldMap[f.name] = f.id; });

  const { data: categories } = await supabase
    .from('product_categories')
    .select('id, name')
    .order('sort_order');
  const catMap: Record<number, string> = {};
  (categories || []).forEach((c: any) => { catMap[c.id] = c.name; });

  const mode = bindMode || 'all';
  const value = bindValue || '';
  let query = supabase
    .from('product_items')
    .select('id, name, price, media, category_id')
    .eq('status', 'active');

  if (mode === 'category' && value) {
    query = query.eq('category_id', Number(value));
  } else if (mode === 'single' && value) {
    query = query.eq('id', Number(value));
  } else if (mode === 'dishes' && value) {
    const ids = value.split(',').map((s: string) => Number(s.trim())).filter((n: number) => !isNaN(n));
    if (ids.length > 0) query = query.in('id', ids);
  } else if (mode === 'station' && stationId) {
    const { data: stationData } = await supabase
      .from('tray_stations')
      .select('product_item_id')
      .eq('id', stationId)
      .maybeSingle();
    if (stationData?.product_item_id) {
      query = query.eq('id', stationData.product_item_id);
    }
  }

  const { data: products } = await query.order('id');
  const productIds = (products || []).map((p: any) => p.id);

  let customValues: any[] = [];
  if (productIds.length > 0) {
    const { data: cvData } = await supabase
      .from('product_custom_values')
      .select('product_id, field_id, value')
      .in('product_id', productIds);
    customValues = cvData || [];
  }

  return (products || []).map((product: any) => {
    const cv = customValues.filter((v: any) => v.product_id === product.id);
    const vals: Record<string, string> = {};
    cv.forEach((v: any) => {
      const fn = Object.keys(fieldMap).find((k) => fieldMap[k] === v.field_id);
      if (fn) vals[fn] = v.value;
    });
    const media = product.media as Array<{ url: string }> | null;
    return {
      dishId: String(product.id),
      name: product.name,
      price: Number(product.price) || 0,
      imageUrl: media?.[0]?.url || '',
      category: catMap[product.category_id] || '',
      nutrition: {
        calories: Number(vals.calories) || 0,
        protein: Number(vals.protein) || 0,
        fat: Number(vals.fat) || 0,
        carbs: Number(vals.carbs) || 0,
      },
    };
  });
}

/** 获取单个设备的完整配置 */
async function getDeviceConfig(deviceId: number): Promise<any> {
  const { data: device } = await supabase
    .from('tray_display_devices')
    .select('id, name, sn, status, station_id, bind_mode, bind_value, ui_template, max_price_temp_dish, interval_price_temp_dish, min_price_temp_dish, bind_plate_before_take, weigh_alarm_model, min_settlement_weight, stable_difference, alarm_below_grams, max_weight_dish')
    .eq('id', deviceId)
    .maybeSingle();
  if (!device) return null;

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

  return {
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
    station: stationInfo,
    bindMode: device.bind_mode || 'all',
    bindValue: device.bind_value || '',
  };
}

/** 按设备ID推送配置更新 */
async function pushConfigToDevice(deviceId: number) {
  const config = await getDeviceConfig(deviceId);
  if (!config) return;

  const dishes = await getMenuForDevice(config.bindMode, config.bindValue, config.station?.stationId || null);

  const msg = JSON.stringify({
    type: 'config_updated',
    data: { ...config, dishes },
    timestamp: new Date().toISOString(),
  });

  for (const [ws, info] of clients.entries()) {
    if (info.id === deviceId && ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch { /* ignore */ }
    }
  }
}

/** 按 station_id 推送菜品变更（当托盘绑定菜品变化时） */
async function pushMenuToStationDevices(stationId: number) {
  for (const [ws, info] of clients.entries()) {
    if (info.station_id === stationId && ws.readyState === WebSocket.OPEN) {
      try {
        const dishes = await getMenuForDevice(info.bind_mode, info.bind_value, info.station_id);
        ws.send(JSON.stringify({
          type: 'menu_updated',
          data: { dishes },
          timestamp: new Date().toISOString(),
        }));
      } catch { /* ignore */ }
    }
  }
}

// ==================== 实时监听 ====================

let productChannel: any = null;
let stationChannel: any = null;
let deviceChannel: any = null;

function setupRealtime() {
  // 1. 监听 product_items 变更 → 广播菜品更新给所有设备
  productChannel = supabase.channel('menu-db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'product_items' }, async () => {
      for (const [ws, info] of clients.entries()) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        try {
          const dishes = await getMenuForDevice(info.bind_mode, info.bind_value, info.station_id);
          ws.send(JSON.stringify({
            type: 'menu_updated',
            data: { dishes },
            timestamp: new Date().toISOString(),
          }));
        } catch { /* ignore */ }
      }
    })
    .subscribe();

  // 2. 监听 tray_stations 变更 → 推送菜单给绑定该托盘的设备
  stationChannel = supabase.channel('station-db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tray_stations' }, async (payload: any) => {
      const stationId = payload?.record?.id || payload?.old_record?.id;
      if (stationId) {
        await pushMenuToStationDevices(stationId);
      }
    })
    .subscribe();

  // 3. 监听 tray_display_devices 变更 → 推送配置给对应设备
  deviceChannel = supabase.channel('device-db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tray_display_devices' }, async (payload: any) => {
      const deviceId = payload?.record?.id || payload?.old_record?.id;
      if (deviceId) {
        // 稍微延迟，确保 DB 写入已完成
        await new Promise((r) => setTimeout(r, 200));
        await pushConfigToDevice(deviceId);
      }
    })
    .subscribe();

  // 心跳保活
  setInterval(() => {
    if (productChannel) productChannel.send({ type: 'heartbeat', timestamp: Date.now() });
  }, 30000);
}

setupRealtime();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // ---- WebSocket 升级 ----
  if (req.headers.get('upgrade') === 'websocket') {
    const sn = url.searchParams.get('sn') || '';
    const key = url.searchParams.get('key') || '';

    if (!sn || !key) {
      return new Response(
        JSON.stringify({ code: 400, message: '缺少参数: sn 和 key', data: null }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: device } = await supabase
      .from('tray_display_devices')
      .select('id, name, sn, hw_key, device_type, station_id, bind_mode, bind_value')
      .eq('sn', sn)
      .maybeSingle();

    if (!device || device.hw_key !== key) {
      return new Response(
        JSON.stringify({ code: 403, message: '验证失败', data: null }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    clients.set(socket, {
      id: device.id,
      name: device.name,
      sn: device.sn,
      station_id: device.station_id || null,
      bind_mode: device.bind_mode || null,
      bind_value: device.bind_value || null,
    });

    const now = new Date().toISOString();
    supabase
      .from('tray_display_devices')
      .update({ status: 'online', last_seen: now })
      .eq('id', device.id)
      .then(() => {});

    // 连接成功后立即推送完整数据
    Promise.all([
      getMenuForDevice(device.bind_mode || null, device.bind_value || null, device.station_id || null),
      getDeviceConfig(device.id),
    ]).then(([dishes, config]) => {
      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: 'connected',
          message: '已连接实时推送服务',
          device: { name: device.name, id: device.id, stationId: device.station_id },
          data: { ...config, dishes },
          timestamp: now,
        }));
      };
    });

    socket.onclose = () => {
      clients.delete(socket);
      supabase
        .from('tray_display_devices')
        .update({ status: 'offline' })
        .eq('id', device.id)
        .then(() => {});
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        } else if (msg.type === 'get_menu') {
          const info = clients.get(socket);
          if (info) {
            getMenuForDevice(info.bind_mode, info.bind_value, info.station_id).then((dishes) => {
              socket.send(JSON.stringify({
                type: 'menu_updated',
                data: { dishes },
                timestamp: new Date().toISOString(),
              }));
            });
          }
        } else if (msg.type === 'get_config') {
          const info = clients.get(socket);
          if (info) {
            getDeviceConfig(info.id).then((config) => {
              socket.send(JSON.stringify({
                type: 'config_updated',
                data: config,
                timestamp: new Date().toISOString(),
              }));
            });
          }
        }
      } catch { /* ignore */ }
    };

    return response;
  }

  // ---- HTTP API ----

  // 广播消息给所有在线设备
  if (path.endsWith('/api/display/broadcast') && req.method === 'POST') {
    let body: any;
    try { body = await req.json(); } catch {
      return new Response(
        JSON.stringify({ code: 400, message: '请求体格式错误', data: null }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const msg = JSON.stringify({
      type: body.type || 'broadcast',
      data: body.data,
      timestamp: new Date().toISOString(),
    });

    let count = 0;
    for (const [ws] of clients.entries()) {
      if (ws.readyState === WebSocket.OPEN) { ws.send(msg); count++; }
    }

    return new Response(
      JSON.stringify({ code: 200, message: 'success', data: { broadcasted: count } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // 向指定设备推送配置 + 菜品更新（管理后台调用）
  if (path.endsWith('/api/display/push-device') && req.method === 'POST') {
    let body: any;
    try { body = await req.json(); } catch {
      return new Response(
        JSON.stringify({ code: 400, message: '请求体格式错误', data: null }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const deviceId = Number(body?.deviceId);
    if (!deviceId) {
      return new Response(
        JSON.stringify({ code: 400, message: '缺少 deviceId', data: null }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 找到该设备对应的 WebSocket
    let found = false;
    for (const [ws, info] of clients.entries()) {
      if (info.id === deviceId && ws.readyState === WebSocket.OPEN) {
        found = true;
        const config = await getDeviceConfig(deviceId);
        const dishes = await getMenuForDevice(
          config?.bindMode || null,
          config?.bindValue || null,
          config?.station?.stationId || null,
        );
        ws.send(JSON.stringify({
          type: 'config_updated',
          data: { ...config, dishes },
          timestamp: new Date().toISOString(),
        }));
      }
    }

    // 即使设备不在线，也从 DB 读最新配置返回给调用者
    const config = await getDeviceConfig(deviceId);

    return new Response(
      JSON.stringify({
        code: 200,
        message: found ? '配置已推送' : '设备不在线，但返回了最新配置供参考',
        data: { online: found, config },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // 获取在线设备列表
  if (path.endsWith('/api/display/online') && req.method === 'GET') {
    const onlineList: { id: number; name: string; sn: string }[] = [];
    for (const [, info] of clients.entries()) {
      onlineList.push({ id: info.id, name: info.name, sn: info.sn });
    }
    return new Response(
      JSON.stringify({ code: 200, message: 'success', data: { online: onlineList, count: onlineList.length } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ code: 404, message: '接口不存在', data: null }),
    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
