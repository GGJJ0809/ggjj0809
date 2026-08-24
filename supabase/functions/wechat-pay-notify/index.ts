import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function aeadDecrypt(
  apiV3Key: string,
  nonce: string,
  ciphertext: string,
  associatedData: string,
): Promise<string> {
  const keyBytes = new TextEncoder().encode(apiV3Key);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  const nonceBytes = new TextEncoder().encode(nonce);
  const ctBytes = base64ToBytes(ciphertext);
  const adBytes = new TextEncoder().encode(associatedData);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonceBytes, additionalData: adBytes },
    key,
    ctBytes,
  );
  return new TextDecoder().decode(pt);
}

async function rsaVerify(message: string, signature: string, publicKeyPem: string): Promise<boolean> {
  const pem = publicKeyPem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(pem);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const key = await crypto.subtle.importKey(
    "spki",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sigBytes = base64ToBytes(signature);
  const enc = new TextEncoder().encode(message);
  return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sigBytes, enc);
}

async function creditDistributionPoints(
  admin: any,
  orderId: number,
  buyerId: string | null,
  cashAmount: number,
): Promise<void> {
  if (!buyerId || cashAmount <= 0) return;

  try {
    const { data: existing } = await admin
      .from("distribution_earnings")
      .select("id")
      .eq("order_id", orderId)
      .limit(1);
    if (existing && existing.length > 0) return;

    const { data: settingsRows } = await admin.from("distribution_settings").select("*");
    const settings: Record<string, string> = {};
    (settingsRows || []).forEach((s: any) => {
      settings[s.key] = s.value;
    });
    if (settings.distribution_enabled === "false") return;

    const { data: buyer } = await admin
      .from("user_profiles")
      .select("referred_by")
      .eq("user_id", buyerId)
      .maybeSingle();
    const inviterId = buyer?.referred_by;
    if (!inviterId) return;

    const { data: affiliate } = await admin
      .from("affiliates")
      .select("*")
      .eq("user_id", inviterId)
      .eq("status", "active")
      .maybeSingle();
    if (!affiliate) return;

    const ratio = Number(affiliate.commission_rate ?? settings.default_points_ratio ?? 0);
    const points = Math.round((cashAmount * ratio) / 100);
    if (points <= 0) return;

    const { data: wallet } = await admin
      .from("user_points")
      .select("*")
      .eq("user_id", inviterId)
      .maybeSingle();
    const curAvailable = wallet ? Number(wallet.available_points) || 0 : 0;
    const newAvailable = curAvailable + points;
    if (wallet) {
      await admin
        .from("user_points")
        .update({
          available_points: newAvailable,
          total_points: (Number(wallet.total_points) || 0) + points,
          lifetime_points: (Number(wallet.lifetime_points) || 0) + points,
          updated_at: new Date().toISOString(),
        })
        .eq("id", wallet.id);
    } else {
      await admin.from("user_points").insert({
        user_id: inviterId,
        available_points: points,
        total_points: points,
        frozen_points: 0,
        lifetime_points: points,
        updated_at: new Date().toISOString(),
      });
    }

    await admin.from("points_transactions").insert({
      user_id: inviterId,
      amount: points,
      type: "earn",
      ref_id: String(orderId),
      note: `分销返积分（订单 #${orderId}）`,
      balance_after: newAvailable,
      source: "referral",
      created_at: new Date().toISOString(),
    });

    await admin.from("distribution_earnings").insert({
      distributor_id: affiliate.id,
      referred_user_id: buyerId,
      order_id: orderId,
      target_type: "product",
      amount: cashAmount,
      points,
      status: "settled",
      settled_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("credit distribution error:", err);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ code: "FAIL", message: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiV3Key = Deno.env.get("WECHAT_API_V3_KEY");
    if (!apiV3Key) {
      return new Response(JSON.stringify({ code: "FAIL", message: "not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timestamp = req.headers.get("wechatpay-timestamp") || "";
    const nonce = req.headers.get("wechatpay-nonce") || "";
    const signature = req.headers.get("wechatpay-signature") || "";
    const rawBody = await req.text();

    const platformPublicKey = Deno.env.get("WECHAT_PLATFORM_PUBLIC_KEY");
    if (platformPublicKey && signature) {
      const verifyMessage = `${timestamp}\n${nonce}\n${rawBody}\n`;
      const ok = await rsaVerify(verifyMessage, signature, platformPublicKey);
      if (!ok) {
        return new Response(JSON.stringify({ code: "FAIL", message: "signature verify failed" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const parsed = JSON.parse(rawBody);
    const resource = parsed?.resource;
    if (!resource || !resource.nonce || !resource.ciphertext) {
      return new Response(JSON.stringify({ code: "FAIL", message: "invalid resource" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const plaintext = await aeadDecrypt(
      apiV3Key,
      resource.nonce,
      resource.ciphertext,
      resource.associated_data || "",
    );
    const result = JSON.parse(plaintext);

    const outTradeNo = result.out_trade_no;
    const transactionId = result.transaction_id;
    const tradeState = result.trade_state;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    if (tradeState === "SUCCESS" && outTradeNo) {
      const { data: order } = await admin
        .from("order_headers")
        .select("id, customer_id, subtotal_items, status")
        .eq("payment_provider", "wechat_h5")
        .eq("checkout_session_id", outTradeNo)
        .maybeSingle();

      if (order) {
        if (order.status !== "paid") {
          await admin
            .from("order_headers")
            .update({ status: "paid", payment_id: transactionId || null })
            .eq("id", order.id);

          await creditDistributionPoints(
            admin,
            order.id,
            order.customer_id,
            Number(order.subtotal_items) || 0,
          );
        }
      } else {
        console.error("Order not found for out_trade_no:", outTradeNo);
      }
    }

    return new Response(JSON.stringify({ code: "SUCCESS", message: "成功" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("wechat-pay-notify error:", error);
    return new Response(JSON.stringify({ code: "FAIL", message: error.message || "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
