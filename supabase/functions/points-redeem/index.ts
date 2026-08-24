import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 用用户 JWT 校验登录身份
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: authData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !authData.user) {
      return new Response(JSON.stringify({ error: "请先登录" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = authData.user.id;

    // 服务端管理客户端，绕过 RLS 更新商品库存/销量
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const productId = Number(body.product_id);
    const qty = Math.max(1, Math.floor(Number(body.quantity) || 1));

    if (!productId) {
      return new Response(JSON.stringify({ error: "缺少商品信息" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. 读取商品
    const { data: product } = await admin
      .from("products")
      .select("*")
      .eq("id", productId)
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
    const pointsPerUnit = Number(product.points_required) || 0;
    if (pointsPerUnit <= 0) {
      return new Response(JSON.stringify({ error: "该商品不支持纯积分兑换" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (product.stock !== -1 && (Number(product.stock) || 0) < qty) {
      return new Response(JSON.stringify({ error: "库存不足" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const needPoints = pointsPerUnit * qty;

    // 2. 读取用户积分
    const { data: wallet } = await admin
      .from("user_points")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    const available = wallet ? Number(wallet.available_points) || 0 : 0;
    if (available < needPoints) {
      return new Response(JSON.stringify({ error: `积分不足，当前可用 ${available} 积分，需要 ${needPoints} 积分` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newAvailable = available - needPoints;

    // 3. 扣减积分
    if (wallet) {
      const { error: updErr } = await admin
        .from("user_points")
        .update({ available_points: newAvailable, updated_at: new Date().toISOString() })
        .eq("id", wallet.id);
      if (updErr) throw updErr;
    }

    // 4. 创建订单
    const { data: order, error: orderErr } = await admin
      .from("order_headers")
      .insert({
        customer_id: userId,
        status: "paid",
        currency: "CNY",
        subtotal_items: 0,
        payment_provider: "points",
        points_total: needPoints,
        recipient: {},
      })
      .select("id")
      .single();
    if (orderErr || !order) {
      throw orderErr || new Error("创建订单失败");
    }

    // 5. 订单商品
    const { error: itemErr } = await admin.from("order_items").insert({
      order_id: order.id,
      product_id: String(product.id),
      product_name: String(product.name),
      quantity: qty,
      unit_price: 0,
      final_price: 0,
      subtotal: 0,
      points: needPoints,
    });
    if (itemErr) throw itemErr;

    // 6. 记录积分流水（ref_id 关联订单）
    const { error: txErr } = await admin.from("points_transactions").insert({
      user_id: userId,
      amount: -needPoints,
      type: "spend",
      ref_id: String(order.id),
      note: `积分兑换「${product.name}」`,
      balance_after: newAvailable,
      source: "redeem",
      created_at: new Date().toISOString(),
    });
    if (txErr) throw txErr;

    // 7. 更新商品销量与库存
    const soldCount = (Number(product.sold_count) || 0) + qty;
    const updatePayload: Record<string, unknown> = {
      sold_count: soldCount,
      updated_at: new Date().toISOString(),
    };
    if (product.stock !== -1) {
      updatePayload.stock = (Number(product.stock) || 0) - qty;
    }
    await admin.from("products").update(updatePayload).eq("id", product.id);

    // 虚拟商品交付内容
    const delivery = product.is_virtual && product.delivery_content ? product.delivery_content : null;

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        points_spent: needPoints,
        new_balance: newAvailable,
        delivery,
        is_virtual: !!product.is_virtual,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("points-redeem error:", error);
    return new Response(JSON.stringify({ error: error.message || "兑换失败" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
