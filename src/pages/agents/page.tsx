import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface AgentItem {
  id: number;
  agent_type: string;
  name: string;
  short_desc: string;
  avatar: string;
  tags: string[];
  used_count: number;
}

const QUICK_TAGS = [
  "我不知道从哪开始",
  "我的内容没人看怎么办",
  "如何把粉丝变成客户",
];

const TOOL_ICONS: Record<number, string> = {
  1: "ri-flashlight-line",
  2: "ri-user-star-line",
  3: "ri-lightbulb-line",
  4: "ri-compass-3-line",
  5: "ri-bar-chart-line",
  6: "ri-heart-pulse-line",
};

function resolveAvatar(avatar: string): string {
  if (!avatar) return "";
  return avatar;
}

function cleanName(name: string): string {
  return name || "智能体";
}

function cleanDesc(desc: string): string {
  if (!desc) return "";
  return desc.length > 20 ? desc.slice(0, 20) + "…" : desc;
}

function resolveToolIcon(id: number): string {
  return TOOL_ICONS[id] || "ri-apps-line";
}

export default function AgentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "";

  const [featuredCoach, setFeaturedCoach] = useState<AgentItem | null>(null);
  const [toolAgents, setToolAgents] = useState<AgentItem[]>([]);
  const [consultantAgents, setConsultantAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [coachInput, setCoachInput] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: qErr } = await supabase
        .from("agents")
        .select("id, agent_type, name, short_desc, avatar, tags, used_count")
        .eq("status", "published")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });

      if (qErr) throw qErr;

      const all = (data || []).map((a: any): AgentItem => ({
        id: a.id,
        agent_type: a.agent_type || "tool",
        name: a.name || "",
        short_desc: a.short_desc || "",
        avatar: a.avatar || "",
        tags: Array.isArray(a.tags) ? a.tags : [],
        used_count: a.used_count || 0,
      }));

      const consultants = all.filter((a) => a.agent_type === "consultant");
      const tools = all.filter((a) => a.agent_type === "tool");

      setConsultantAgents(consultants);
      setToolAgents(tools);
      setFeaturedCoach(consultants[0] || null);
    } catch (e: any) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const goToCoach = (presetText?: string) => {
    if (!featuredCoach) return;
    const msg = presetText || coachInput;
    navigate(`/agents/${featuredCoach.id}`, {
      state: msg ? { initialMessage: msg } : undefined,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-foreground-400">
          <i className="ri-loader-4-line animate-spin text-xl"></i>
          <span className="text-sm">加载中…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background-50 flex flex-col items-center justify-center px-4">
        <i className="ri-error-warning-line text-3xl text-foreground-400 mb-2"></i>
        <p className="text-sm text-foreground-600">{error}</p>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 bg-primary-500 text-white text-sm rounded-lg"
        >
          重试
        </button>
      </div>
    );
  }

  const coachAvatar = featuredCoach ? resolveAvatar(featuredCoach.avatar) : "";
  const coachName = featuredCoach ? cleanName(featuredCoach.name) : "";

  return (
    <div className="min-h-screen pt-16 bg-background-50 pb-8">
      {/* ==================== 顶部 AI 教练入口 ==================== */}
      {!activeTab && (
        <section className="relative bg-foreground-900 px-4 pt-6 pb-5 overflow-hidden">
          {/* 背景装饰圆点 */}
          <div className="absolute top-4 right-8 w-2 h-2 rounded-full bg-primary-500/60"></div>
          <div className="absolute top-12 right-20 w-1.5 h-1.5 rounded-full bg-primary-500/40"></div>
          <div className="absolute bottom-20 left-6 w-1 h-1 rounded-full bg-accent-400/30"></div>
          <div className="absolute top-8 left-12 w-1 h-1 rounded-full bg-white/10"></div>

          <div className="relative flex items-start gap-3">
            {/* 左侧文字 */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-white leading-tight">
                和{coachName}聊一聊
              </h2>
              {featuredCoach && (
                <p className="text-white/50 text-xs mt-1">
                  {featuredCoach.short_desc || "首席影响力增长教练"}
                </p>
              )}
              <p className="text-white/30 text-[11px] mt-2 leading-relaxed">
                我是{coachName}，也是你的AI教练伙伴。我会逐渐了解你，帮你看清真正的问题，找到值得长期投入的方向，并把知识和经验转化为持续增长的影响力。
              </p>
            </div>

            {/* 右侧头像 */}
            {coachAvatar && (
              <div className="shrink-0 w-24 h-32 md:w-28 md:h-36 rounded-xl overflow-hidden">
                <img
                  src={coachAvatar}
                  alt={coachName}
                  className="w-full h-full object-cover object-top"
                />
              </div>
            )}
            {!coachAvatar && featuredCoach && (
              <div className="shrink-0 w-24 h-32 md:w-28 md:h-36 rounded-xl bg-primary-700 flex items-center justify-center">
                <i className="ri-user-smile-line text-3xl text-primary-300"></i>
              </div>
            )}
          </div>

          {/* 输入框 */}
          <div className="relative mt-4">
            <input
              type="text"
              value={coachInput}
              onChange={(e) => setCoachInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && coachInput.trim()) {
                  e.preventDefault();
                  goToCoach();
                }
              }}
              placeholder={`有什么想法或问题？和${coachName}聊一聊吧…`}
              className="w-full bg-white rounded-xl px-4 py-3 pr-12 text-sm text-foreground-800 placeholder:text-foreground-300 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
            />
            <button
              onClick={() => goToCoach()}
              disabled={!coachInput.trim() || !featuredCoach}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center text-white hover:bg-primary-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <i className="ri-send-plane-fill text-sm"></i>
            </button>
          </div>

          {/* 快捷标签 */}
          <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-none">
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => goToCoach(tag)}
                className="px-3 py-1.5 bg-white/10 text-white/60 text-[11px] rounded-full whitespace-nowrap hover:bg-white/15 hover:text-white/80 transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Tab 返回栏 */}
      {activeTab && (
        <div className="sticky top-0 z-40 bg-background-50/95 backdrop-blur-sm border-b border-background-200/70">
          <div className="px-4 h-12 flex items-center gap-3">
            <button
              onClick={() => setSearchParams({})}
              className="flex items-center gap-1 text-sm text-foreground-600 hover:text-primary-600 transition-colors"
            >
              <i className="ri-arrow-left-line"></i>
              <span>返回</span>
            </button>
            <h2 className="text-base font-bold text-foreground-950">
              {activeTab === "tools" ? "全部工具" : "全部顾问"}
            </h2>
          </div>
        </div>
      )}

      {/* ==================== 实用工具 ==================== */}
      {(!activeTab || activeTab === "tools") && (
        <section className="px-4 pt-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-foreground-950">
              {activeTab === "tools" ? "全部工具" : "实用工具"}
            </h3>
            {!activeTab && (
              <Link
                to="/agents?tab=tools"
                className="text-xs text-foreground-500 flex items-center gap-0.5 hover:text-primary-600 transition-colors"
              >
                查看全部 <i className="ri-arrow-right-s-line"></i>
              </Link>
            )}
          </div>

          {toolAgents.length === 0 ? (
            <div className="text-center py-8 text-foreground-400">
              <i className="ri-apps-line text-2xl mb-2 block"></i>
              <span className="text-xs">暂无工具</span>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-x-3 gap-y-4">
              {toolAgents.map((agent) => {
                const iconClass = resolveToolIcon(agent.id);
                return (
                  <Link
                    key={agent.id}
                    to={`/agents/${agent.id}`}
                    className="flex flex-col items-center text-center group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-2 group-hover:bg-primary-100 transition-colors">
                      <i className={`${iconClass} text-xl text-primary-500`}></i>
                    </div>
                    <span className="text-xs font-medium text-foreground-800 leading-tight line-clamp-2">
                      {cleanName(agent.name)}
                    </span>
                    <span className="text-[10px] text-foreground-400 mt-0.5 leading-tight line-clamp-1">
                      {cleanDesc(agent.short_desc)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ==================== 我的顾问团 ==================== */}
      {(!activeTab || activeTab === "advisors") && (
        <section className="px-4 pt-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-bold text-foreground-950">
              {activeTab === "advisors" ? "全部顾问" : "我的顾问团"}
            </h3>
            {!activeTab && (
              <Link
                to="/agents?tab=advisors"
                className="text-xs text-foreground-500 flex items-center gap-0.5 hover:text-primary-600 transition-colors"
              >
                查看全部 <i className="ri-arrow-right-s-line"></i>
              </Link>
            )}
          </div>
          <p className="text-[11px] text-foreground-400 mb-4">
            顾问筛选，为你匹配的专业顾问团
          </p>

          {consultantAgents.length === 0 ? (
            <div className="text-center py-6 text-foreground-400">
              <i className="ri-user-line text-2xl mb-2 block"></i>
              <span className="text-xs">暂无顾问</span>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto scrollbar-none pb-2">
              {consultantAgents.map((agent) => {
                const avatarUrl = resolveAvatar(agent.avatar);
                return (
                  <Link
                    key={agent.id}
                    to={`/agents/${agent.id}`}
                    className="flex flex-col items-center text-center shrink-0 w-[72px] group"
                  >
                    <div className="w-14 h-14 rounded-full overflow-hidden mb-2 border-2 border-transparent group-hover:border-primary-300 transition-colors">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={agent.name}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full bg-primary-100 flex items-center justify-center">
                          <i className="ri-user-smile-line text-lg text-primary-500"></i>
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-medium text-foreground-800 leading-tight line-clamp-1">
                      {cleanName(agent.name)}
                    </span>
                    <span className="text-[10px] text-foreground-400 leading-tight line-clamp-1 mt-0.5">
                      {cleanDesc(agent.short_desc)}
                    </span>
                  </Link>
                );
              })}

              {/* 更多顾问入口 */}
              {!activeTab && (
                <Link
                  to="/agents?tab=advisors"
                  className="flex flex-col items-center text-center shrink-0 w-[72px] group"
                >
                  <div className="w-14 h-14 rounded-full bg-background-100 flex items-center justify-center mb-2 group-hover:bg-background-200 transition-colors">
                    <i className="ri-more-fill text-lg text-foreground-400"></i>
                  </div>
                  <span className="text-xs font-medium text-foreground-800 leading-tight">
                    更多顾问
                  </span>
                  <span className="text-[10px] text-foreground-400 leading-tight line-clamp-1 mt-0.5">
                    探索更多专业支持
                  </span>
                </Link>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}