import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import SharePoster from "@/components/feature/SharePoster";

interface Course {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  cover_image: string;
  price: number;
  member_price: number | null;
  member_level_required: number;
  is_published: boolean;
  is_featured: boolean;
  sort_order: number;
  view_count: number;
  sold_count: number;
  column_id: number | null;
  column_title?: string;
  computed_type?: string;
}

interface AssetLink {
  asset_id: number;
  sort_order: number;
  is_free_trial: boolean;
  content_assets: {
    id: number;
    asset_type: string;
    title: string;
    category_id: number | null;
    chapter_id: number | null;
    content_text: string | null;
    audio_url: string | null;
    audio_duration: number | null;
    video_url: string | null;
    video_duration: number | null;
    video_cover: string | null;
    is_free_preview: boolean;
  };
}

const TYPE_LABEL: Record<string, string> = {
  text_only: "图文课",
  audio_only: "音频课",
  video_only: "视频课",
  mixed: "混合课程",
};

const TYPE_ICON: Record<string, string> = {
  text_only: "ri-article-line",
  audio_only: "ri-music-line",
  video_only: "ri-play-circle-line",
  mixed: "ri-stack-line",
};

const UNIT_ICON: Record<string, string> = {
  text: "ri-article-line",
  audio: "ri-music-line",
  video: "ri-play-circle-line",
};

const UNIT_LABEL: Record<string, string> = {
  text: "图文",
  audio: "音频",
  video: "视频",
};

function computeType(links: AssetLink[]): string {
  const types = new Set(links.map((l) => l.content_assets?.asset_type).filter(Boolean));
  if (types.size === 1) {
    const t = [...types][0];
    if (t === "text") return "text_only";
    if (t === "audio") return "audio_only";
    if (t === "video") return "video_only";
  }
  if (types.size > 1) return "mixed";
  return "text_only";
}

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [assetLinks, setAssetLinks] = useState<AssetLink[]>([]);
  const [chapNames, setChapNames] = useState<Map<number, string>>(new Map());
  const [catNames, setCatNames] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseDone, setPurchaseDone] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");

  // Share poster states
  const [showShare, setShowShare] = useState(false);
  const [shareUserName, setShareUserName] = useState("");
  const [shareUserAvatar, setShareUserAvatar] = useState("");
  const [shareRefCode, setShareRefCode] = useState("");
  const [shareRewards, setShareRewards] = useState({ registerReward: 0, pointsRatio: 0 });

  const loadCourse = async () => {
    try {
      setLoading(true);
      setError("");

      const { data, error: dbError } = await supabase
        .from("courses")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();

      if (dbError) throw dbError;
      if (!data) throw new Error("课程不存在");

      const row = data as any;

      let columnTitle: string | undefined;
      if (row.column_id) {
        const { data: colData } = await supabase
          .from("columns")
          .select("title")
          .eq("id", row.column_id)
          .maybeSingle();
        columnTitle = colData?.title;
      }

      const { data: links } = await supabase
        .from("course_content_assets")
        .select("asset_id, sort_order, is_free_trial, content_assets(*)")
        .eq("course_id", row.id)
        .order("sort_order");

      const validLinks: AssetLink[] = (links || []).filter((l: any) => l.content_assets);
      const computedType = computeType(validLinks);

      const chapterIds = [...new Set(validLinks.map((l) => l.content_assets.chapter_id).filter(Boolean))] as number[];
      const categoryIds = [...new Set(validLinks.map((l) => l.content_assets.category_id).filter(Boolean))] as number[];

      if (chapterIds.length > 0) {
        const { data: chapters } = await supabase.from("content_chapters").select("id, name").in("id", chapterIds);
        const m = new Map<number, string>();
        (chapters || []).forEach((ch: any) => m.set(ch.id, ch.name));
        setChapNames(m);
      }
      if (categoryIds.length > 0) {
        const { data: cats } = await supabase.from("content_categories").select("id, name").in("id", categoryIds);
        const m = new Map<number, string>();
        (cats || []).forEach((c: any) => m.set(c.id, c.name));
        setCatNames(m);
      }

      setCourse({ ...row, column_title: columnTitle, computed_type: computedType });
      setAssetLinks(validLinks);

      const firstChId = validLinks[0]?.content_assets?.chapter_id;
      if (firstChId) setExpandedSection(`ch_${firstChId}`);
    } catch (err: any) {
      console.error("Failed to load course:", err);
      setError(err?.message || "加载课程失败");
    } finally {
      setLoading(false);
    }
  };

  // Load share-related data when user is logged in
  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    (async () => {
      try {
        // User profile
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
        // Distribution settings
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

  useEffect(() => {
    if (id) loadCourse();
  }, [id]);

  const handlePurchase = async () => {
    if (!course || purchasing) return;
    setPurchasing(true);
    setPurchaseError("");
    try {
      // Create order
      const { data: orderData, error: orderErr } = await supabase
        .from("order_headers")
        .insert({
          currency: "USD",
          payment_provider: "none",
          status: course.price === 0 ? "paid" : "pending_payment",
          subtotal_items: course.price,
        })
        .select("id")
        .single();

      if (orderErr) throw orderErr;

      // Create order item
      await supabase.from("order_items").insert({
        order_id: orderData.id,
        product_id: String(course.id),
        product_name: course.title,
        quantity: 1,
        unit_price: course.price,
        final_price: course.price,
        subtotal: course.price,
      });

      setPurchaseDone(true);
    } catch (e: any) {
      setPurchaseError(e.message || "下单失败，请重试");
    } finally {
      setPurchasing(false);
    }
  };

  const handleShareClick = () => {
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(`/courses/${id}`)}`);
      return;
    }
    setShowShare(true);
  };

  const chapterGroups: { chapterKey: string; chapterName: string; links: AssetLink[] }[] = [];
  let currentKey = "";
  for (const link of assetLinks) {
    const chId = link.content_assets?.chapter_id;
    const key = chId ? `ch_${chId}` : "__none__";
    const name = chId ? (chapNames.get(chId) || "课程内容") : "课程内容";
    if (key !== currentKey) {
      currentKey = key;
      chapterGroups.push({ chapterKey: key, chapterName: name, links: [] });
    }
    chapterGroups[chapterGroups.length - 1].links.push(link);
  }

  const totalSeconds = assetLinks.reduce((sum, l) => {
    const a = l.content_assets;
    return sum + (a.video_duration || 0) + (a.audio_duration || 0);
  }, 0);

  const ct = course?.computed_type || "text_only";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen pt-16">
        <i className="ri-loader-4-line animate-spin text-3xl text-primary-500"></i>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen pt-16">
        <div className="w-16 h-16 rounded-2xl bg-background-100 flex items-center justify-center mb-4">
          <i className="ri-error-warning-line text-2xl text-primary-500"></i>
        </div>
        <p className="text-sm text-foreground-500 mb-4">{error || "课程未找到"}</p>
        <Link
          to="/courses"
          className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold whitespace-nowrap hover:bg-primary-600 transition-colors"
        >
          返回课程列表
        </Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-16">
      {/* Breadcrumb + Share */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-6 pb-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-xs text-foreground-400 flex-wrap min-w-0">
            <Link to="/" className="hover:text-foreground-600 transition-colors">首页</Link>
            <i className="ri-arrow-right-s-line"></i>
            <Link to="/courses" className="hover:text-foreground-600 transition-colors">课程中心</Link>
            {course.column_title && (
              <>
                <i className="ri-arrow-right-s-line"></i>
                <span className="text-foreground-500">{course.column_title}</span>
              </>
            )}
            <i className="ri-arrow-right-s-line"></i>
            <span className="text-foreground-700 truncate">{course.title}</span>
          </div>
          <button
            onClick={handleShareClick}
            className="w-10 h-10 rounded-full border border-background-200/70 bg-white text-foreground-600 hover:bg-background-50 hover:text-primary-500 transition-all flex items-center justify-center shrink-0"
            aria-label="分享"
          >
            <i className="ri-share-forward-line text-lg"></i>
          </button>
        </div>
      </div>

      {/* Hero */}
      <section className="relative brand-navy-section overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/2 right-0 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-30"
            style={{
              background: `repeating-radial-gradient(
                circle at center,
                transparent 0,
                transparent 40px,
                oklch(var(--primary-500) / 0.06) 40px,
                oklch(var(--primary-500) / 0.06) 41px
              )`,
            }}
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-14">
          <div className="flex flex-col lg:flex-row gap-8 md:gap-12 items-start">
            {/* Cover */}
            <div className="w-full lg:w-[400px] shrink-0">
              <div className="aspect-[3/2] rounded-xl overflow-hidden shadow-2xl shadow-accent-500/20">
                <img src={course.cover_image} alt={course.title} className="w-full h-full object-cover" />
              </div>
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-500/20 text-xs font-semibold text-primary-400">
                  <i className={`${TYPE_ICON[ct]} text-xs`}></i>
                  {TYPE_LABEL[ct]}
                </span>
                {course.price === 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-primary-500/20 text-xs font-semibold text-primary-400">
                    免费
                  </span>
                )}
                {course.member_level_required > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-white/10 text-xs font-semibold text-foreground-300">
                    {["", "会员免费学", "黄金会员免费学", "VIP会员免费学", "SVIP会员免费学"][course.member_level_required]}
                  </span>
                )}
              </div>

              <h1 className="text-2xl md:text-3xl font-display font-black text-white tracking-tight">
                {course.title}
              </h1>
              {course.subtitle && (
                <p className="mt-2 text-foreground-300 text-sm md:text-base">{course.subtitle}</p>
              )}

              <div className="flex flex-wrap items-center gap-5 mt-5">
                <div className="flex items-center gap-1.5 text-sm text-foreground-300">
                  <i className="ri-play-list-2-line text-primary-400"></i>
                  <span>{assetLinks.length} 个内容单元</span>
                </div>
                {totalSeconds > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-foreground-300">
                    <i className="ri-time-line text-primary-400"></i>
                    <span>
                      {Math.floor(totalSeconds / 3600) > 0 ? `${Math.floor(totalSeconds / 3600)} 小时 ` : ""}
                      {Math.floor((totalSeconds % 3600) / 60)} 分钟
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-sm text-foreground-300">
                  <i className="ri-eye-line text-primary-400"></i>
                  <span>{course.view_count} 次浏览</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-foreground-300">
                  <i className="ri-shopping-cart-line text-primary-400"></i>
                  <span>{course.sold_count} 人已购</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12 pb-24 md:pb-12">
        <div className="flex flex-col lg:flex-row gap-8 md:gap-12">
          {/* Left */}
          <div className="flex-1">
            {course.description && (
              <div className="bg-white rounded-xl border border-background-200/70 p-5 md:p-6 mb-6">
                <h2 className="text-lg font-display font-bold text-foreground-900 mb-4">课程介绍</h2>
                <div className="text-sm text-foreground-600 leading-relaxed whitespace-pre-line">
                  {course.description}
                </div>
              </div>
            )}

            {assetLinks.length > 0 && (
              <div className="bg-white rounded-xl border border-background-200/70 p-5 md:p-6">
                <h2 className="text-lg font-display font-bold text-foreground-900 mb-4">课程目录</h2>
                <div className="space-y-2">
                  {chapterGroups.map((group, gIdx) => (
                    <div key={gIdx} className="border border-background-200/70 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedSection(expandedSection === group.chapterName ? null : group.chapterName)}
                        className="w-full flex items-center justify-between p-3.5 hover:bg-background-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-accent-500 text-white flex items-center justify-center text-xs font-bold">
                            {gIdx + 1}
                          </span>
                          <span className="text-sm font-semibold text-foreground-900">{group.chapterName}</span>
                          <span className="text-xs text-foreground-400">{group.links.length} 个单元</span>
                        </div>
                        <i className={`${expandedSection === group.chapterName ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-foreground-400`}></i>
                      </button>
                      {expandedSection === group.chapterName && (
                        <div className="border-t border-background-200/70 divide-y divide-background-100">
                          {group.links.map((link) => {
                            const a = link.content_assets;
                            return (
                              <div key={link.asset_id} className="flex items-center justify-between px-5 py-3 hover:bg-background-50/50 transition-colors">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="w-7 h-7 rounded-lg bg-background-100 flex items-center justify-center shrink-0">
                                    <i className={`${UNIT_ICON[a.asset_type] || "ri-article-line"} text-foreground-500 text-sm`}></i>
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-foreground-800 truncate">{a.title}</span>
                                      {link.is_free_trial && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary-100 text-primary-700 font-medium shrink-0">试看</span>
                                      )}
                                    </div>
                                    <span className="text-[11px] text-foreground-400">
                                      {UNIT_LABEL[a.asset_type] || "图文"}
                                      {a.video_duration && a.video_duration > 0 && ` · ${Math.floor(a.video_duration / 60)}分${a.video_duration % 60}秒`}
                                      {a.audio_duration && a.audio_duration > 0 && ` · ${Math.floor(a.audio_duration / 60)}分${a.audio_duration % 60}秒`}
                                    </span>
                                  </div>
                                </div>
                                <Link
                                  to={`/learn/${course.id}`}
                                  className="shrink-0 ml-3 px-3 py-1 rounded-full text-[11px] font-semibold bg-primary-500 text-white hover:bg-primary-600 transition-all whitespace-nowrap"
                                >
                                  学习
                                </Link>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {assetLinks.length === 0 && (
              <div className="bg-white rounded-xl border border-background-200/70 p-5 md:p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-background-100 flex items-center justify-center mx-auto mb-3">
                  <i className="ri-inbox-line text-xl text-foreground-300"></i>
                </div>
                <p className="text-sm text-foreground-500">课程内容正在筹备中</p>
              </div>
            )}
          </div>

          {/* Right: Purchase Card */}
          <div className="w-full lg:w-[320px] shrink-0">
            <div className="sticky top-24 bg-white rounded-xl border border-background-200/70 p-5">
              <div className="text-center pb-5 border-b border-background-200/70">
                {course.price === 0 ? (
                  <>
                    <p className="text-3xl font-bold text-primary-500">免费</p>
                    <p className="mt-1 text-xs text-foreground-400">无需付费即可学习</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline justify-center gap-1.5">
                      <span className="text-sm text-foreground-500">¥</span>
                      <span className="text-3xl font-bold text-primary-500">{course.price}</span>
                    </div>
                    {course.member_price && course.member_price < course.price && (
                      <p className="mt-1 text-xs text-foreground-400">
                        会员价 <span className="font-semibold text-foreground-900">¥{course.member_price}</span>
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="py-4 border-b border-background-200/70">
                <ul className="space-y-2.5">
                  {[
                    { icon: "ri-play-list-2-line", text: `${assetLinks.length} 个内容单元` },
                    ...(totalSeconds > 0 ? [{ icon: "ri-time-line", text: `约 ${Math.floor(totalSeconds / 60)} 分钟学习时长` }] : []),
                    { icon: "ri-smartphone-line", text: "手机 / 电脑多端学习" },
                    { icon: "ri-refresh-line", text: "购买后永久有效" },
                  ].map((item) => (
                    <li key={item.text} className="flex items-center gap-2.5 text-xs text-foreground-600">
                      <i className={`${item.icon} text-primary-500 text-sm w-4 flex items-center justify-center`}></i>
                      {item.text}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 space-y-2">
                <button
                  onClick={handlePurchase}
                  disabled={purchasing || purchaseDone}
                  className="w-full py-2.5 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap disabled:opacity-50"
                >
                  {purchasing ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <i className="ri-loader-4-line animate-spin"></i>处理中...
                    </span>
                  ) : purchaseDone ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <i className="ri-check-line"></i>{course.price === 0 ? "已报名" : "已下单"}
                    </span>
                  ) : (
                    course.price === 0 ? "免费报名" : "立即购买"
                  )}
                </button>
                {purchaseError && (
                  <p className="text-xs text-center text-red-500 mt-2">{purchaseError}</p>
                )}
                {purchaseDone && (
                  <button
                    onClick={() => navigate(`/learn/${course.id}`)}
                    className="w-full py-2.5 rounded-full border border-primary-300 text-primary-600 text-sm font-semibold hover:bg-primary-50 transition-all whitespace-nowrap"
                  >
                    开始学习 <i className="ri-arrow-right-line ml-1"></i>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Share Poster Modal */}
      <SharePoster
        open={showShare}
        onClose={() => setShowShare(false)}
        type="course"
        itemId={course.id}
        title={course.title}
        coverImage={course.cover_image}
        price={course.price}
        referralCode={shareRefCode}
        userName={shareUserName}
        userAvatar={shareUserAvatar}
        registerReward={shareRewards.registerReward}
        pointsRatio={shareRewards.pointsRatio}
      />
    </main>
  );
}