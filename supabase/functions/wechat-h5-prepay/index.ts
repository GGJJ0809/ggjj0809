import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Recipient {
  name?: string;
  phone?: string;
  state?: string;
  city?: string;
  address?: string;
}

interface PrepayRequest {
  product_id: number;
  quantity: number;
  recipient: Recipient;
}

/** 微信支付 v3 请求签名（RSA-SHA256，商户私钥） */
async function rsaSign(message: string, privateKeyPem: string): Promise<string> {
  const pem = privateKeyPem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(pem);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const enc = new TextEncoder().encode(message);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    const { data: authData, error: authErr } = await supabaseClient.auth.getUser();
    if (authErr || !authData.user) {
      return new Response(JSON.stringify({ error: "请先登录" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = authData.user.id;

    const body: PrepayRequest = await req.json();
    const { product_id, quantity, recipient } = body;
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));

    // 服务端读取商品并校验价格
    const { data: product } = await supabaseClient
      .from("products")
      .select("id, name, price, stock, is_published")
      .eq("id", product_id)
      .maybeSingle();

    if (!product) {
      return new Response(JSON.stringify({ error: "商品不存在" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!product.is_published) {
      return new Response(JSON.stringify({ error: "商品已下架" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (product.stock !== -1 && product.stock < qty) {
      return new Response(JSON.stringify({ error: "库存不足" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const priceYuan = Number(product.price);
    if (!priceYuan || priceYuan <= 0) {
      return new Response(JSON.stringify({ error: "商品价格异常" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalYuan = Math.round(priceYuan * qty * 100) / 100;
    const totalCents = Math.round(priceYuan * qty * 100); // 分

    // 读取微信支付商户配置（密钥）
    const appId = Deno.env.get("WECHAT_APP_ID");
    const mchId = Deno.env.get("WECHAT_MCH_ID");
    const serialNo = Deno.env.get("WECHAT_SERIAL_NO");
    const privateKey = Deno.env.get("WECHAT_PRIVATE_KEY");

    if (!appId || !mchId || !serialNo || !privateKey) {
      return new Response(JSON.stringify({ error: "微信支付尚未配置，请联系管理员" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 生成商户订单号（微信要求 6-32 位）
    const outTradeNo = `rdy${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
    const notifyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/wechat-pay-notify`;

    // 客户端 IP（H5 必填）
    const payerIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    // 构造微信 H5 下单请求
    const wechatBody = {
      appid: appId,
      mchid: mchId,
      description: String(product.name).slice(0, 127),
      out_trade_no: outTradeNo,
      notify_url: notifyUrl,
      amount: { total: totalCents, currency: "CNY" },
      scene_info: {
        payer_client_ip: payerIp,
        h5_info: {
          type: "Wap",
          app_name: "引力场",
          app_url: req.headers.get("origin") || notifyUrl,
        },
      },
    };

    const urlPath = "/v3/pay/transactions/h5";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const rawBody = JSON.stringify(wechatBody);
    const message = `POST\n${urlPath}\n${timestamp}\n${nonce}\n${rawBody}\n`;
    const signature = await rsaSign(message, privateKey);
    const authorization =
      `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonce}",` +
      `timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`;

    const wechatResp = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": authorization,
      },
      body: rawBody,
    });

    const wechatJson = await wechatResp.json();
    if (!wechatResp.ok || !wechatJson.h5_url) {
      const errMsg = wechatJson.message || wechatJson.code || "微信下单失败";
      console.error("WeChat prepay error:", JSON.stringify(wechatJson));
      return new Response(JSON.stringify({ error: `支付发起失败：${errMsg}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 创建本地订单
    const { data: order, error: orderErr } = await supabaseClient
      .from("order_headers")
      .insert({
        customer_id: userId,
        status: "pending_payment",
        currency: "CNY",
        subtotal_items: totalYuan,
        payment_provider: "wechat_h5",
        checkout_session_id: outTradeNo,
        recipient: recipient || {},
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      console.error("Order create error:", orderErr?.message);
      return new Response(JSON.stringify({ error: "创建订单失败" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: itemErr } = await supabaseClient
      .from("order_items")
      .insert({
        order_id: order.id,
        product_id: String(product.id),
        product_name: String(product.name),
        quantity: qty,
        unit_price: priceYuan,
        final_price: priceYuan,
        subtotal: totalYuan,
      });

    if (itemErr) {
      console.error("Order item create error:", itemErr.message);
    }

    return new Response(JSON.stringify({ h5_url: wechatJson.h5_url, order_id: order.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("wechat-h5-prepay error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
