import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import SharePoster from "@/components/feature/SharePoster";

interface Product {
  id: number;
  name: string;
  cover_image: string;
  description: string;
  category: string;
  price: number;
  member_price: number | null;
  points_required: number;
  points_plus_price: number | null;
  stock: number;
  is_virtual: boolean;
  delivery_content: string | null;
  sold_count: number;
}

function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return `¥${Number(n).toLocaleString("zh-CN")}`;
}

/* 购买方式 */
type BuyMode = "cash" | "points" | "combo";

export default function ShopDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<BuyMode>("cash");
  const [quantity, setQuantity] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState("");
  const [redeemSuccess, setRedeemSuccess] = useState<{
    pointsSpent: number;
    newBalance: number;
    delivery: string | null;
    isVirtual: boolean;
  } | null>(null);
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);

  // Share poster states
  const [showShare, setShowShare] = useState(false);
  const [shareUserName, setShareUserName] = useState("");
  const [shareUserAvatar, setShareUserAvatar] = useState("");
  const [shareRefCode, setShareRefCode] = useState("");
  const [shareRewards, setShareRewards] = useState({ registerReward: 0, pointsRatio: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: qErr } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (qErr) throw qErr;
      if (data) {
        const p = data as Product;
        setProduct(p);
        // 默认购买方式
        if (p.price > 0) setMode("cash");
        else if (p.points_plus_price != null && p.points_plus_price > 0) setMode("combo");
        else if (p.points_required > 0) setMode("points");
      }
    } catch (e: any) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!user) {
      setPointsBalance(null);
      return;
    }
    supabase
      .from("user_points")
      .select("available_points")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setPointsBalance(data ? Number(data.available_points) || 0 : 0);
      });
  }, [user]);

  // Load share-related data when user is logged in
  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: prof } = await supabase
          .from("user_profiles")
          .select("nickname, avatar_url, referral_code")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled) {
          setShareUserName(prof?.nickname || user.user_metadata?.nickname || "用户");
          setShareUserAvatar(prof?.avatar_url || "");
          setShareRefCode(prof?.referral_code || "");
        }
        const { data: settings } = await supabase.from("distribution_settings").select("key, value");
        if (!cancelled && settings) {
          const reg = settings.find((s: any) => s.key === "register_reward")?.value;
          const ratio = settings.find((s: any) => s.key === "default_points_ratio")?.value;
          setShareRewards({
            registerReward: Number(reg) || 0,
            pointsRatio: Number(ratio) || 0,
          });
        }
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [user, id]);

  const handleRedeem = async () => {
    if (!product) return;
    setRedeemError("");
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(`/shop/${product.id}`)}`, { replace: true });
      return;
    }
    setRedeeming(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("points-redeem", {
        body: { product_id: product.id, quantity },
      });
      if (fnErr) {
        setRedeemError(fnErr.message || "兑换失败");
        return;
      }
      if (!data || data.error) {
        setRedeemError(data?.error || "兑换失败");
        return;
      }
      setRedeemSuccess({
        pointsSpent: data.points_spent,
        newBalance: data.new_balance,
        delivery: data.delivery,
        isVirtual: data.is_virtual,
      });
      setPointsBalance(data.new_balance);
    } catch (e: unknown) {
      setRedeemError(e instanceof Error ? e.message : "兑换失败");
    } finally {
      setRedeeming(false);
    }
  };

  const handleShareClick = () => {
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(`/shop/${id}`)}`);
      return;
    }
    setShowShare(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center bg-background-50">
        <div className="flex items-center gap-2 text-foreground-400">
          <i className="ri-loader-4-line animate-spin text-xl"></i>
          <span className="text-sm">加载中…</span>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen pt-16 flex flex-col items-center justify-center bg-background-50 px-4">
        <i className="ri-error-warning-line text-3xl text-foreground-400 mb-2"></i>
        <p className="text-sm text-foreground-600">{error || "商品不存在"}</p>
        <button
          onClick={() => navigate("/shop")}
          className="mt-4 px-4 py-2 bg-primary-500 text-white text-sm rounded-lg"
        >
          返回商城
        </button>
      </div>
    );
  }

  const p = product;
  const hasCash = p.price > 0;
  const hasCombo = p.points_plus_price != null && p.points_plus_price > 0;
  const hasPoints = p.points_required > 0 && !hasCombo;
  const soldOut = p.stock === 0;

  // 结算金额
  const cashTotal = mode === "cash" ? p.price * quantity : (p.points_plus_price ?? 0) * quantity;
  const pointsTotal = mode === "points" ? p.points_required * quantity : p.points_required * quantity;

  return (
    <main className="min-h-screen pt-16 pb-20 md:pb-8 bg-background-50">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8">
        {/* 返回 + 分享 */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <button
            onClick={() => navigate("/shop")}
            className="inline-flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-900 transition-colors"
          >
            <i className="ri-arrow-left-line"></i>
            返回商城
          </button>
          <button
            onClick={handleShareClick}
            className="w-10 h-10 rounded-full border border-background-200/70 bg-white text-foreground-600 hover:bg-background-50 hover:text-primary-500 transition-all flex items-center justify-center shrink-0"
            aria-label="分享"
          >
            <i className="ri-share-forward-line text-lg"></i>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10">
          {/* 封面 */}
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-background-100">
            <img
              src={p.cover_image}
              alt={p.name}
              className="w-full h-full object-cover object-top"
            />
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-black/40 text-white backdrop-blur-sm">
                {p.category}
              </span>
              {p.is_virtual && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-accent-500 text-white">
                  虚拟商品
                </span>
              )}
            </div>
          </div>

          {/* 信息 + 购买 */}
          <div className="flex flex-col">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground-950">{p.name}</h1>
            <p className="mt-3 text-sm md:text-base text-foreground-600 leading-relaxed">
              {p.description}
            </p>

            <div className="mt-4 flex items-center gap-4 text-sm text-foreground-400">
              <span>已售 {p.sold_count} 件</span>
              <span>
                库存 {p.stock === -1 ? "不限量" : p.stock}
              </span>
            </div>

            {/* 购买方式选择 */}
            <div className="mt-6">
              <p className="text-sm font-semibold text-foreground-800 mb-3">选择购买方式</p>
              <div className="space-y-2.5">
                {hasCash && (
                  <button
                    onClick={() => setMode("cash")}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                      mode === "cash"
                        ? "border-primary-400 bg-primary-50"
                        : "border-background-200/70 bg-white hover:border-background-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        mode === "cash" ? "border-primary-500" : "border-foreground-300"
                      }`}>
                        {mode === "cash" && <div className="w-2 h-2 rounded-full bg-primary-500"></div>}
                      </div>
                      <span className="text-sm font-medium text-foreground-800">现金购买</span>
                    </div>
                    <span className="text-base font-bold text-foreground-950">
                      {formatMoney(p.price)}
                      {p.member_price != null && p.member_price > 0 && p.member_price < p.price && (
                        <span className="ml-2 text-xs font-medium text-accent-600">
                          会员 {formatMoney(p.member_price)}
                        </span>
                      )}
                    </span>
                  </button>
                )}

                {hasPoints && (
                  <button
                    onClick={() => setMode("points")}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                      mode === "points"
                        ? "border-primary-400 bg-primary-50"
                        : "border-background-200/70 bg-white hover:border-background-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        mode === "points" ? "border-primary-500" : "border-foreground-300"
                      }`}>
                        {mode === "points" && <div className="w-2 h-2 rounded-full bg-primary-500"></div>}
                      </div>
                      <span className="text-sm font-medium text-foreground-800">积分兑换</span>
                    </div>
                    <span className="text-base font-bold text-accent-600">
                      <i className="ri-vip-crown-line mr-0.5"></i>
                      {p.points_required.toLocaleString("zh-CN")}积分
                    </span>
                  </button>
                )}

                {hasCombo && (
                  <button
                    onClick={() => setMode("combo")}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                      mode === "combo"
                        ? "border-primary-400 bg-primary-50"
                        : "border-background-200/70 bg-white hover:border-background-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        mode === "combo" ? "border-primary-500" : "border-foreground-300"
                      }`}>
                        {mode === "combo" && <div className="w-2 h-2 rounded-full bg-primary-500"></div>}
                      </div>
                      <span className="text-sm font-medium text-foreground-800">积分 + 现金</span>
                    </div>
                    <span className="text-base font-bold text-foreground-950">
                      <span className="text-accent-600 text-sm font-semibold">
                        {p.points_required.toLocaleString("zh-CN")}积分
                      </span>
                      <span className="mx-1">+</span>
                      {formatMoney(p.points_plus_price)}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* 数量 */}
            <div className="mt-6 flex items-center gap-3">
              <span className="text-sm font-semibold text-foreground-800">数量</span>
              <div className="flex items-center border border-background-200/70 rounded-lg overflow-hidden">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 flex items-center justify-center text-foreground-500 hover:bg-background-100"
                >
                  <i className="ri-subtract-line"></i>
                </button>
                <span className="w-12 text-center text-sm font-semibold text-foreground-950">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-9 h-9 flex items-center justify-center text-foreground-500 hover:bg-background-100"
                >
                  <i className="ri-add-line"></i>
                </button>
              </div>
            </div>

            {/* 结算 + 立即购买 */}
            <div className="mt-8 pt-6 border-t border-background-200/70">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-foreground-500">合计</span>
                <div className="text-right">
                  {mode === "points" ? (
                    <span className="text-xl font-bold text-accent-600">
                      {pointsTotal.toLocaleString("zh-CN")}积分
                    </span>
                  ) : (
                    <span className="text-xl font-bold text-foreground-950">
                      {formatMoney(cashTotal)}
                      {mode === "combo" && (
                        <span className="ml-1 text-sm font-semibold text-accent-600">
                          + {pointsTotal.toLocaleString("zh-CN")}积分
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              {mode === "points" && pointsBalance !== null && (
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-foreground-500">我的积分</span>
                  <span className={`font-semibold ${pointsBalance >= pointsTotal ? "text-accent-600" : "text-red-500"}`}>
                    {pointsBalance.toLocaleString("zh-CN")}
                    {pointsBalance < pointsTotal && "（不足）"}
                  </span>
                </div>
              )}
              {redeemError && (
                <div className="mb-3 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
                  <i className="ri-error-warning-line mt-0.5"></i>
                  <span>{redeemError}</span>
                </div>
              )}
              <button
                disabled={soldOut || redeeming}
                onClick={() => {
                  if (soldOut || redeeming) return;
                  if (mode === "cash") {
                    navigate(`/shop/checkout?product_id=${p.id}&qty=${quantity}`);
                  } else if (mode === "points") {
                    handleRedeem();
                  } else {
                    setShowModal(true);
                  }
                }}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  soldOut || redeeming
                    ? "bg-background-100 text-foreground-400 cursor-not-allowed"
                    : "bg-primary-500 text-white hover:bg-primary-600"
                }`}
              >
                {soldOut ? "已售罄" : redeeming ? "兑换中…" : mode === "points" ? "立即兑换" : "立即购买"}
              </button>
            </div>
          </div>
        </div>

        {/* 商品详情 */}
        <div className="mt-10 md:mt-14">
          <h2 className="text-lg md:text-xl font-bold text-foreground-950 mb-4">商品详情</h2>
          <div className="bg-white rounded-xl border border-background-200/70 p-5 md:p-8">
            <p className="text-sm md:text-base text-foreground-600 leading-relaxed whitespace-pre-line">
              {p.description}
            </p>
            {p.is_virtual && p.delivery_content && (
              <div className="mt-6 p-4 rounded-lg bg-accent-50 border border-accent-200/50">
                <p className="text-xs font-semibold text-accent-700 mb-1">交付说明</p>
                <p className="text-sm text-accent-800">{p.delivery_content}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 下单提示弹窗 */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-foreground-950/40"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-4">
              <i className="ri-shopping-bag-3-line text-2xl text-primary-500"></i>
            </div>
            <h3 className="text-lg font-bold text-foreground-950">功能即将上线</h3>
            <p className="mt-2 text-sm text-foreground-500 leading-relaxed">
              「积分 + 现金」组合购买方式正在接入中，敬请期待。
            </p>
            <button
              onClick={() => setShowModal(false)}
              className="mt-5 w-full py-2.5 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all"
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {/* 兑换成功弹窗 */}
      {redeemSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-foreground-950/40" onClick={() => setRedeemSuccess(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-accent-50 flex items-center justify-center mx-auto mb-4">
              <i className="ri-check-line text-2xl text-accent-600"></i>
            </div>
            <h3 className="text-lg font-bold text-foreground-950 text-center">兑换成功</h3>
            <p className="mt-2 text-sm text-foreground-500 text-center">
              已扣除 {redeemSuccess.pointsSpent.toLocaleString("zh-CN")} 积分，剩余 {redeemSuccess.newBalance.toLocaleString("zh-CN")} 积分
            </p>
            {redeemSuccess.isVirtual && redeemSuccess.delivery && (
              <div className="mt-4 p-3 rounded-lg bg-accent-50 border border-accent-200/50">
                <p className="text-xs font-semibold text-accent-700 mb-1">交付内容</p>
                <p className="text-sm text-accent-800 break-all">{redeemSuccess.delivery}</p>
              </div>
            )}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => { setRedeemSuccess(null); navigate("/shop"); }}
                className="flex-1 py-2.5 rounded-lg border border-background-200/70 text-foreground-600 text-sm font-semibold hover:bg-background-50 transition-all"
              >
                继续逛逛
              </button>
              <button
                onClick={() => { setRedeemSuccess(null); navigate("/shop/orders"); }}
                className="flex-1 py-2.5 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all"
              >
                查看订单
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Poster Modal */}
      <SharePoster
        open={showShare}
        onClose={() => setShowShare(false)}
        type="product"
        itemId={p.id}
        title={p.name}
        coverImage={p.cover_image}
        price={p.price}
        referralCode={shareRefCode}
        userName={shareUserName}
        userAvatar={shareUserAvatar}
        registerReward={shareRewards.registerReward}
        pointsRatio={shareRewards.pointsRatio}
      />
    </main>
  );
}