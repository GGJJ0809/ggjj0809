import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface UserProfile {
  nickname: string;
  avatar: string | null;
  growth_points: number;
  total_points: number;
  member_level_id: number | null;
}

interface MemberLevel {
  name: string;
  badge: string;
  sort_order: number;
  points_threshold: number;
}

interface AssessmentResult {
  id: number;
  overall_score: number;
  grade: string;
  created_at: string;
}

interface UserPoints {
  available_points: number;
  lifetime_points: number;
}

/* ─── 顶部用户卡片 ─── */
function ProfileHeader({
  profile,
  level,
  points,
}: {
  profile: UserProfile;
  level: MemberLevel | null;
  points: UserPoints | null;
}) {
  const navigate = useNavigate();
  return (
    <div className="relative rounded-2xl overflow-hidden bg-foreground-950 text-white">
      {/* 背景装饰 */}
      <div className="absolute top-0 right-0 w-48 h-48 md:w-72 md:h-72 opacity-10">
        <div className="absolute top-6 right-6 w-20 h-20 rounded-full bg-primary-500"></div>
        <div className="absolute top-20 right-28 w-10 h-10 rounded-full bg-primary-400"></div>
        <div className="absolute bottom-10 right-10 w-6 h-6 rounded-full bg-primary-500"></div>
      </div>

      <div className="relative px-5 pt-5 pb-5 md:px-8 md:pt-8 md:pb-8 flex items-start md:items-center gap-4 md:gap-6">
        {/* 左侧信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 flex items-center justify-center">
              <i className="ri-share-line text-primary-500 text-sm"></i>
            </div>
            <span className="text-[10px] md:text-xs text-white/50 tracking-wide">Nuclechain / 引力场</span>
          </div>

          <h2 className="text-xl md:text-2xl font-bold text-white mt-1">
            {profile.nickname || "学员"}
          </h2>

          <div className="mt-3 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:text-sm text-white/70">
              <div className="w-4 h-4 flex items-center justify-center">
                <i className="ri-medal-line text-primary-500 text-xs"></i>
              </div>
              <span>会员等级 <span className="text-white font-medium">{level?.name || "会员"}</span></span>
              <span className="text-white/30 mx-1">|</span>
              <span>成长级别 <span className="text-primary-400 font-semibold">L{level?.sort_order || 1}</span></span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:text-sm text-white/70">
              <div className="w-4 h-4 flex items-center justify-center">
                <i className="ri-coin-line text-primary-500 text-xs"></i>
              </div>
              <span>累计积分 <span className="text-primary-400 font-semibold">{(points?.lifetime_points ?? profile.total_points ?? 0).toLocaleString()}</span> 分</span>
              <span className="text-white/30 mx-1">|</span>
              <span>等级门槛 {(level?.points_threshold ?? 0).toLocaleString()} 分</span>
            </div>
          </div>

          <p className="text-[10px] md:text-xs text-white/40 mt-3">持续成长 · 共创影响力</p>
        </div>

        {/* 右侧头像 */}
        <div className="shrink-0">
          <div className="w-16 h-16 md:w-24 md:h-24 rounded-xl md:rounded-2xl overflow-hidden border-2 border-white/20 bg-white/10">
            <img
              src={
                profile.avatar ||
                "https://readdy.ai/api/search-image?query=Professional%20headshot%20portrait%20of%20a%20confident%20Asian%20business%20person%20in%20smart%20casual%20attire%2C%20neutral%20warm%20background%2C%20soft%20studio%20lighting%2C%20clean%20and%20modern%20style%2C%20friendly%20expression&width=400&height=400&seq=avatar-default&orientation=squarish"
              }
              alt="avatar"
              className="w-full h-full object-cover object-top"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── 打卡卡片 ─── */
function CheckInCard() {
  return (
    <div className="bg-white rounded-xl border border-background-200/70 px-4 py-3 md:px-5 md:py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-primary-50 flex items-center justify-center">
          <i className="ri-calendar-check-line text-primary-500 text-base md:text-lg"></i>
        </div>
        <div>
          <p className="text-sm md:text-base font-semibold text-foreground-950">今日打卡</p>
          <p className="text-[11px] md:text-xs text-foreground-400">已连续打卡 12 天</p>
        </div>
      </div>
      <div className="w-8 h-8 flex items-center justify-center text-foreground-300">
        <i className="ri-arrow-right-s-line text-lg"></i>
      </div>
    </div>
  );
}

/* ─── 功能入口网格 ─── */
function QuickGrid({
  courseCount,
  points,
}: {
  courseCount: number;
  points: UserPoints | null;
}) {
  const navigate = useNavigate();
  const items = [
    { icon: "ri-graduation-cap-line", label: "我的课程", sub: `${courseCount} 门课程`, path: "/courses" },
    { icon: "ri-calendar-event-line", label: "我的活动", sub: "6 个活动", path: "/activities" },
    { icon: "ri-file-list-3-line", label: "我的订单", sub: "查看订单", path: "/shop/orders" },
    { icon: "ri-coin-line", label: "我的积分", sub: `${(points?.available_points ?? 0).toLocaleString()} 分`, path: "#" },
    { icon: "ri-share-line", label: "分享赚积分", sub: "邀请友得积分", path: "/member/distribution" },
    { icon: "ri-folder-3-line", label: "我的资料库", sub: "12 个资料", path: "#" },
    { icon: "ri-shopping-cart-2-line", label: "我的购物车", sub: "3 件商品", path: "#" },
    { icon: "ri-apps-line", label: "更多", sub: "更多功能", path: "#" },
  ];

  return (
    <div className="bg-white rounded-xl border border-background-200/70 p-4 md:p-5">
      <div className="grid grid-cols-4 gap-y-4 md:gap-y-5 gap-x-2 md:gap-x-4">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => item.path !== "#" && navigate(item.path)}
            className="flex flex-col items-center gap-1.5 md:gap-2 group"
          >
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary-50 flex items-center justify-center transition-colors group-hover:bg-primary-100">
              <i className={`${item.icon} text-primary-500 text-lg md:text-xl`}></i>
            </div>
            <span className="text-xs md:text-sm font-medium text-foreground-800 text-center leading-tight">
              {item.label}
            </span>
            <span className="text-[10px] md:text-xs text-foreground-400 text-center leading-tight">
              {item.sub}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── 成长档案 ─── */
function GrowthArchive({ assessment }: { assessment: AssessmentResult | null }) {
  const navigate = useNavigate();
  const items = [
    {
      icon: "ri-bar-chart-box-line",
      title: "职称成长报告",
      sub: "更新于 05-14",
      color: "text-primary-600",
      bg: "bg-primary-50",
      path: "#",
    },
    {
      icon: "ri-pie-chart-line",
      title: "学习进度",
      sub: "已完成 72%",
      color: "text-primary-600",
      bg: "bg-primary-50",
      path: "#",
    },
    {
      icon: "ri-star-line",
      title: "能力测评",
      sub: assessment?.grade || "优秀",
      color: "text-primary-600",
      bg: "bg-primary-50",
      path: "/agents",
    },
    {
      icon: "ri-time-line",
      title: "成长记录",
      sub: "128 条记录",
      color: "text-foreground-600",
      bg: "bg-background-100",
      path: "#",
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <h3 className="text-sm md:text-base font-bold text-foreground-950">我的成长档案</h3>
        <button
          onClick={() => navigate("/agents")}
          className="flex items-center gap-0.5 text-xs text-foreground-400 hover:text-foreground-600 transition-colors"
        >
          查看全部
          <i className="ri-arrow-right-s-line"></i>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {items.map((item) => (
          <button
            key={item.title}
            onClick={() => item.path !== "#" && navigate(item.path)}
            className="bg-white rounded-xl border border-background-200/70 p-3 md:p-4 text-left transition-all hover:border-primary-300 hover:shadow-sm"
          >
            <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg ${item.bg} flex items-center justify-center mb-2 md:mb-3`}>
              <i className={`${item.icon} ${item.color} text-base md:text-lg`}></i>
            </div>
            <p className="text-xs md:text-sm font-semibold text-foreground-800">{item.title}</p>
            <p className="text-[10px] md:text-xs text-foreground-400 mt-0.5">{item.sub}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── 会员升级入口 ─── */
function UpgradeBanner() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate("/member/plans")}
      className="w-full bg-gradient-to-r from-primary-500 to-primary-300 rounded-xl px-4 py-3 md:px-6 md:py-4 flex items-center justify-between text-white transition-all hover:shadow-lg hover:scale-[1.01]"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-white/20 flex items-center justify-center">
          <i className="ri-vip-crown-line text-white text-base md:text-lg"></i>
        </div>
        <div className="text-left">
          <p className="text-sm md:text-base font-bold">升级会员，解锁更多权益</p>
          <p className="text-[10px] md:text-xs text-white/70">专属课程 · AI工具无限 · 私董社群</p>
        </div>
      </div>
      <div className="w-8 h-8 flex items-center justify-center bg-white/20 rounded-full">
        <i className="ri-arrow-right-line text-white text-sm"></i>
      </div>
    </button>
  );
}

/* ─── 设置菜单（含退出登录） ─── */
function SettingsMenu({
  triggerClassName,
  onLogout,
}: {
  triggerClassName?: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName ?? "w-8 h-8 flex items-center justify-center text-foreground-500"}
      >
        <i className="ri-settings-3-line text-lg"></i>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg border border-background-200/70 shadow-sm z-50 overflow-hidden">
            <button
              type="button"
              onClick={onLogout}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-foreground-600 hover:text-foreground-950 hover:bg-background-50 transition-colors whitespace-nowrap"
            >
              <span className="w-4 h-4 flex items-center justify-center">
                <i className="ri-logout-box-r-line text-base"></i>
              </span>
              退出登录
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── 主页面 ─── */
export default function MemberPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [level, setLevel] = useState<MemberLevel | null>(null);
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [points, setPoints] = useState<UserPoints | null>(null);
  const [courseCount, setCourseCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // 登录守卫：未登录跳转登录页
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth?redirect=/member", { replace: true });
    }
  }, [authLoading, user, navigate]);

  const fetchData = useCallback(async () => {
    const uid = user?.id;
    // 退出登录后清空数据，避免残留上一用户信息
    if (!uid) {
      setProfile(null);
      setLevel(null);
      setAssessment(null);
      setPoints(null);
      setCourseCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 用户档案
      let profileData: UserProfile | null = null;
      let levelData: MemberLevel | null = null;

      const { data: p } = await supabase
        .from("user_profiles")
        .select("nickname, avatar, growth_points, total_points, member_level_id")
        .eq("user_id", uid)
        .maybeSingle();

      if (p) {
        profileData = p as UserProfile;
        if (p.member_level_id) {
          const { data: l } = await supabase
            .from("member_levels")
            .select("name, badge, sort_order, points_threshold")
            .eq("id", p.member_level_id)
            .maybeSingle();
          if (l) levelData = l as MemberLevel;
        }
      }

      // 真实积分（可用积分 + 累计积分）
      let pointsData: UserPoints | null = null;
      const { data: pt } = await supabase
        .from("user_points")
        .select("available_points, lifetime_points")
        .eq("user_id", uid)
        .maybeSingle();
      if (pt) pointsData = pt as UserPoints;

      // 我的课程数（去重后的已学习课程）
      let enrolledCount = 0;
      const { data: prog } = await supabase
        .from("user_learning_progress")
        .select("course_id")
        .eq("user_id", uid);
      if (prog && prog.length > 0) {
        enrolledCount = new Set(prog.map((r) => r.course_id)).size;
      }

      // 能力测评最新结果
      let assessData: AssessmentResult | null = null;
      const { data: a } = await supabase
        .from("assessment_results")
        .select("id, overall_score, grade, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (a) assessData = a as AssessmentResult;

      setProfile(
        profileData ?? {
          nickname: "",
          avatar: null,
          growth_points: 0,
          total_points: 0,
          member_level_id: null,
        }
      );
      setLevel(levelData);
      setPoints(pointsData);
      setCourseCount(enrolledCount);
      setAssessment(assessData);
    } catch (_e) {
      setProfile({
        nickname: "",
        avatar: null,
        growth_points: 0,
        total_points: 0,
        member_level_id: null,
      });
      setLevel(null);
      setPoints(null);
      setCourseCount(0);
      setAssessment(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

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
  if (!profile) return null;

  return (
    <main className="min-h-screen pt-14 md:pt-16 pb-20 md:pb-8 bg-background-50">
      {/* 移动端顶部标题栏 */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-background-200/70 sticky top-14 z-30">
        <h1 className="text-lg font-bold text-foreground-950">我的</h1>
        <div className="flex items-center gap-3">
          <SettingsMenu onLogout={handleLogout} />
          <button className="w-8 h-8 flex items-center justify-center text-foreground-500 relative">
            <i className="ri-notification-3-line text-lg"></i>
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary-500"></span>
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* PC端标题 */}
        <div className="hidden md:flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground-950">个人中心</h1>
          <div className="flex items-center gap-2">
            <SettingsMenu
              onLogout={handleLogout}
              triggerClassName="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-background-200/70 text-foreground-500 hover:bg-background-100 transition-colors"
            />
            <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-background-200/70 text-foreground-500 hover:bg-background-100 transition-colors relative">
              <i className="ri-notification-3-line text-lg"></i>
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary-500"></span>
            </button>
          </div>
        </div>

        {/* 两栏布局：移动端单列，PC端左窄右宽 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
          {/* 左栏 */}
          <div className="lg:col-span-5 space-y-4 md:space-y-5">
            <ProfileHeader profile={profile} level={level} points={points} />
            <CheckInCard />
            <QuickGrid courseCount={courseCount} points={points} />
          </div>

          {/* 右栏 */}
          <div className="lg:col-span-7 space-y-4 md:space-y-5">
            <UpgradeBanner />
            <GrowthArchive assessment={assessment} />
          </div>
        </div>
      </div>
    </main>
  );
}