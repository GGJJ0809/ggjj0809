import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { generateReferralCode } from "@/lib/referral";
import SharePoster from "@/components/feature/SharePoster";

interface Profile {
  nickname: string;
  avatar_url: string | null;
  referral_code: string | null;
}

interface Affiliate {
  id: number;
  status: string;
  commission_rate: number | null;
  referred_count: number;
  created_at: string;
}

interface Earning {
  id: number;
  order_id: number;
  amount: number;
  points: number;
  status: string;
  created_at: string;
}

function buildShareUrl(code: string): string {
  const basePath = __BASE_PATH__.split("/").filter(Boolean).join("/");
  const pathPrefix = basePath ? `/${basePath}` : "";
  return `${window.location.origin}${pathPrefix}/?ref=${code}`;
}

const statusMeta: Record<string, { label: string; cls: string }> = {
  active: { label: "已开通", cls: "bg-primary-100 text-primary-700" },
  applying: { label: "审核中", cls: "bg-accent-100 text-accent-900" },
  inactive: { label: "已冻结", cls: "bg-background-200 text-foreground-500" },
};

export default function DistributionCenter() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [showApply, setShowApply] = useState(false);
  const [applyName, setApplyName] = useState("");
  const [applyPhone, setApplyPhone] = useState("");
  const [applying, setApplying] = useState(false);

  // 分享海报
  const [showShare, setShowShare] = useState(false);
  const [shareRewards, setShareRewards] = useState({ registerReward: 0, pointsRatio: 0 });

  // 登录守卫
  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/auth?redirect=${encodeURIComponent("/member/distribution")}`, { replace: true });
    }
  }, [authLoading, user, navigate]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      let { data: prof } = await supabase
        .from("user_profiles")
        .select("nickname, avatar_url, referral_code")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!prof) {
        prof = {
          nickname: (user.user_metadata?.nickname as string) || "用户",
          avatar_url: null,
          referral_code: null,
        };
      }

      let code = prof.referral_code;
      if (!code) {
        code = generateReferralCode();
        await supabase.from("user_profiles").upsert(
          { user_id: user.id, nickname: prof.nickname, referral_code: code },
          { onConflict: "user_id" },
        );
      }
      setProfile({ nickname: prof.nickname, avatar_url: prof.avatar_url, referral_code: code });

      const { data: settings } = await supabase.from("distribution_settings").select("key, value");
      if (settings) {
        const reg = settings.find((s: any) => s.key === "register_reward")?.value;
        const ratio = settings.find((s: any) => s.key === "default_points_ratio")?.value;
        setShareRewards({
          registerReward: Number(reg) || 0,
          pointsRatio: Number(ratio) || 0,
        });
      }

      const { data: aff } = await supabase
        .from("affiliates")
        .select("id, status, commission_rate, referred_count, created_at")
        .eq("user_id", user.id)
        .maybeSingle();
      setAffiliate((aff as Affiliate) || null);

      if (aff) {
        const { data: earns } = await supabase
          .from("distribution_earnings")
          .select("id, order_id, amount, points, status, created_at")
          .eq("distributor_id", aff.id)
          .order("created_at", { ascending: false });
        setEarnings((earns || []) as Earning[]);
      } else {
        setEarnings([]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const copyLink = async () => {
    if (!profile?.referral_code) return;
    try {
      await navigator.clipboard.writeText(buildShareUrl(profile.referral_code));
      showToast("分享链接已复制");
    } catch {
      showToast("复制失败，请手动复制");
    }
  };

  const openApply = () => {
    setApplyName(profile?.nickname || "");
    setApplyPhone("");
    setShowApply(true);
  };

  const submitApply = async () => {
    if (!applyName.trim()) {
      showToast("请填写姓名");
      return;
    }
    setApplying(true);
    try {
      await supabase.from("affiliates").insert({
        user_id: user?.id,
        name: applyName.trim(),
        phone: applyPhone.trim() || null,
        status: "applying",
        level: "general",
        commission_rate: null,
        applied_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
      setShowApply(false);
      await loadData();
      showToast("申请已提交，等待审核");
    } catch {
      showToast("提交失败，请重试");
    } finally {
      setApplying(false);
    }
  };

  const totalPoints = earnings.reduce((s, e) => s + (e.points || 0), 0);
  const settledPoints = earnings
    .filter((e) => e.status === "settled")
    .reduce((s, e) => s + (e.points || 0), 0);
  const pendingPoints = earnings
    .filter((e) => e.status === "pending")
    .reduce((s, e) => s + (e.points || 0), 0);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center bg-background-50">
        <div className="flex items-center gap-2 text-foreground-400">
          <i className="ri-loader-4-line animate-spin text-xl"></i>
          <span className="text-sm">加载中…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const meta = affiliate ? statusMeta[affiliate.status] || statusMeta.inactive : null;

  return (
    <main className="min-h-screen pt-16 pb-20 md:pb-8 bg-background-50">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-8">
        {toast && (
          <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm">
            {toast}
          </div>
        )}

        <button
          onClick={() => navigate("/member")}
          className="inline-flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-900 transition-colors mb-4"
        >
          <i className="ri-arrow-left-line"></i>
          返回个人中心
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-accent-100 flex items-center justify-center">
            <i className="ri-share-forward-line text-xl text-accent-600"></i>
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground-950">分销中心</h1>
            <p className="text-sm text-foreground-500 mt-0.5">分享推荐，好友购买你赚积分</p>
          </div>
        </div>

        {error ? (
          <div className="flex flex-col items-center py-16">
            <p className="text-sm text-foreground-500 mb-4">{error}</p>
            <button
              onClick={loadData}
              className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium whitespace-nowrap"
            >
              重试
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 分享卡片 */}
            <section className="bg-white rounded-xl border border-background-200/70 p-5">
              <div className="flex items-center gap-2 mb-3">
                <i className="ri-link text-primary-500 text-lg"></i>
                <h2 className="text-base font-bold text-foreground-950">我的分享链接</h2>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0 rounded-lg bg-background-50 border border-background-200/70 px-4 py-3">
                  <p className="text-[11px] text-foreground-400 mb-1">推荐码</p>
                  <p className="font-mono text-lg font-bold text-foreground-950 tracking-widest">
                    {profile?.referral_code || "—"}
                  </p>
                </div>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap"
                >
                  <i className="ri-file-copy-line"></i>
                  复制链接
                </button>
              </div>

              <p className="text-xs text-foreground-400 mt-3 leading-relaxed">
                好友通过你的链接注册或购买后，你将按比例获得返积分奖励。
              </p>

              <button
                onClick={() => setShowShare(true)}
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600 transition-all whitespace-nowrap"
              >
                <i className="ri-qr-code-line text-lg"></i>
                生成分享海报
              </button>
            </section>

            {/* 分销状态 / 申请 */}
            <section className="bg-white rounded-xl border border-background-200/70 p-5">
              {affiliate ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
                      <i className="ri-vip-diamond-line text-lg text-primary-500"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground-950">分销员身份</p>
                      <p className="text-xs text-foreground-400 mt-0.5">
                        返积分比例 {affiliate.commission_rate != null ? `${affiliate.commission_rate}%` : "默认"}
                      </p>
                    </div>
                  </div>
                  {meta && (
                    <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${meta.cls}`}>
                      {meta.label}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent-50 flex items-center justify-center">
                      <i className="ri-user-star-line text-lg text-accent-600"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground-950">成为分销员</p>
                      <p className="text-xs text-foreground-400 mt-0.5">
                        申请后审核通过即可开始赚返积分
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={openApply}
                    className="px-4 py-2 rounded-full bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600 transition-all whitespace-nowrap"
                  >
                    立即申请
                  </button>
                </div>
              )}
            </section>

            {/* 数据统计 */}
            {affiliate && (
              <section className="grid grid-cols-3 gap-3">
                {[
                  { label: "累计返积分", value: `${totalPoints.toLocaleString()}分`, color: "text-accent-600" },
                  { label: "已结算", value: `${settledPoints.toLocaleString()}分`, color: "text-primary-500" },
                  { label: "待结算", value: `${pendingPoints.toLocaleString()}分`, color: "text-secondary-600" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white rounded-xl border border-background-200/70 p-4">
                    <p className="text-xs text-foreground-500">{stat.label}</p>
                    <p className={`text-lg font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                  </div>
                ))}
              </section>
            )}

            {/* 分销明细 */}
            {affiliate && (
              <section className="bg-white rounded-xl border border-background-200/70 overflow-hidden">
                <div className="px-5 py-4 border-b border-background-200/70 flex items-center gap-2">
                  <i className="ri-list-check-2 text-foreground-500"></i>
                  <h2 className="text-sm font-bold text-foreground-950">分销明细</h2>
                </div>
                {earnings.length === 0 ? (
                  <div className="py-14 text-center text-sm text-foreground-400">
                    暂无分销收益，快去分享吧
                  </div>
                ) : (
                  <div className="divide-y divide-background-200/70">
                    {earnings.map((e) => (
                      <div key={e.id} className="px-5 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-accent-50 flex items-center justify-center">
                            <i className="ri-shopping-bag-3-line text-accent-600"></i>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground-900">
                              好友下单（订单 #{e.order_id}）
                            </p>
                            <p className="text-xs text-foreground-400 mt-0.5">
                              {new Date(e.created_at).toLocaleDateString("zh-CN")} · 成交金额 ¥{Number(e.amount).toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <span className="text-base font-bold text-accent-600 whitespace-nowrap">
                          +{e.points} 分
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {/* 申请弹窗 */}
      {showApply && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-foreground-950/40" onClick={() => setShowApply(false)}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-foreground-950">申请成为分销员</h3>
              <button
                onClick={() => setShowApply(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground-800">姓名</label>
                <input
                  type="text"
                  value={applyName}
                  onChange={(e) => setApplyName(e.target.value)}
                  placeholder="你的姓名"
                  className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground-800">手机号（选填）</label>
                <input
                  type="tel"
                  value={applyPhone}
                  onChange={(e) => setApplyPhone(e.target.value)}
                  placeholder="用于结算联系"
                  className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
            <div className="mt-6">
              <button
                onClick={submitApply}
                disabled={applying}
                className="w-full py-3 rounded-xl bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600 disabled:opacity-50 transition-all whitespace-nowrap flex items-center justify-center gap-2"
              >
                {applying && <i className="ri-loader-4-line animate-spin"></i>}
                {applying ? "提交中…" : "提交申请"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分享海报弹窗 */}
      <SharePoster
        open={showShare}
        onClose={() => setShowShare(false)}
        type="distribution"
        itemId={0}
        title="引力场 · 一起学习一起成长"
        coverImage="https://readdy.ai/api/search-image?query=Modern%20abstract%20flat%20illustration%20of%20a%20vibrant%20learning%20and%20growth%20community%2C%20warm%20orange%20and%20gold%20gradient%20background%20with%20floating%20books%2C%20light%20bulbs%2C%20rising%20growth%20arrows%20and%20connected%20people%20icons%2C%20representing%20knowledge%20sharing%20and%20personal%20development%2C%20clean%20minimalist%20geometric%20design%2C%20soft%20warm%20lighting%2C%20harmonious%20balanced%20composition%2C%20editorial%20quality%2C%20high%20detail&width=800&height=600&seq=distribution-poster-01&orientation=landscape"
        price={0}
        referralCode={profile?.referral_code || ""}
        userName={profile?.nickname || "用户"}
        userAvatar={profile?.avatar_url || ""}
        registerReward={shareRewards.registerReward}
        pointsRatio={shareRewards.pointsRatio}
      />
    </main>
  );
}