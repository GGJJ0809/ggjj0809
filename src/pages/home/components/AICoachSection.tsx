import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface AITool {
  id: number;
  name: string;
  description: string;
  icon: string;
  category: string;
}

const aiCategories = [
  { key: "all", label: "全部" },
  { key: "assessment", label: "测评" },
  { key: "chat", label: "对话" },
  { key: "generate", label: "生成" },
];

const mockMessages = [
  { role: "ai", text: "Hi, I\'m your AI Coach. I\'m here to help you discover your core, grow your network and expand your influence." },
  { role: "user", text: "Great! Where should I start?" },
  { role: "ai", text: "Let\'s begin with discovering your core. I\'ll ask you a few questions about your strengths, passions, and what makes you unique." },
];

const quickQuestions = [
  "如何找到我的价值定位？",
  "我的项目如何验证商业可能性？",
  "如何提升我的内容影响力？",
];

export default function AICoachSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [tools, setTools] = useState<AITool[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-fade-in-up");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    const elements = sectionRef.current?.querySelectorAll("[data-animate]");
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const fetchTools = async () => {
      try {
        const { data, error } = await supabase
          .from("ai_tools")
          .select("id, name, description, icon, category")
          .eq("status", "active")
          .order("sort_order");

        if (error) throw error;
        setTools(data || []);
      } catch {
        setTools([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTools();
  }, []);

  const filteredTools = activeCategory === "all"
    ? tools
    : tools.filter((t) => t.category === activeCategory);

  const categoryLabels: Record<string, { icon: string; label: string; desc: string }> = {
    strategy: { icon: "ri-route-line", label: "Strategy", desc: "策略定位" },
    marketing: { icon: "ri-megaphone-line", label: "Marketing", desc: "营销传播" },
    sales: { icon: "ri-shopping-bag-line", label: "Sales", desc: "销售增长" },
    assessment: { icon: "ri-pie-chart-line", label: "Assessments", desc: "测评洞察" },
  };

  return (
    <section ref={sectionRef} className="py-16 md:py-24 bg-background-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-12" data-animate>
          <p className="text-xs font-medium tracking-widest text-primary-600 uppercase mb-2">
            Talk to the AI Coach
          </p>
          <h2 className="font-heading font-bold text-2xl md:text-3xl text-foreground-950">
            与 AI 教练对话
          </h2>
          <p className="mt-2 text-sm text-foreground-400">
            凯特教练为你提供个性化的影响力增长辅导
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 md:gap-8">
          {/* Chat Preview */}
          <div
            data-animate
            className="lg:col-span-3 bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-background-200"
          >
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-background-100">
              <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center">
                <i className="ri-robot-2-line text-white text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground-800">AI Coach</p>
                <p className="text-xs text-foreground-400">IP 引力教练</p>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-green-600">在线</span>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              {mockMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary-500 text-white rounded-br-md"
                        : "bg-background-100 text-foreground-700 rounded-bl-md"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Questions */}
            <div className="flex flex-wrap gap-2 mb-4">
              {quickQuestions.map((q) => (
                <span
                  key={q}
                  className="px-3 py-1.5 rounded-full bg-background-100 text-xs text-foreground-500 border border-background-200 hover:border-primary-300 hover:text-primary-600 cursor-pointer transition-all"
                >
                  {q}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-full bg-background-100 border border-background-200">
                <input
                  type="text"
                  placeholder="Ask me anything..."
                  className="flex-1 bg-transparent text-sm text-foreground-700 placeholder-foreground-400 outline-none"
                  readOnly
                />
              </div>
              <Link
                to="/ai-agent"
                className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white hover:bg-primary-600 transition-all shrink-0"
              >
                <i className="ri-send-plane-fill"></i>
              </Link>
            </div>
          </div>

          {/* Categories */}
          <div className="lg:col-span-2 flex flex-col gap-3">
            {Object.values(categoryLabels).map((cat) => (
              <div
                key={cat.label}
                data-animate
                className="opacity-0 bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-background-200 flex items-center gap-4 hover:border-primary-200 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                  <i className={`${cat.icon} text-xl text-primary-500`}></i>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground-800">{cat.label}</p>
                  <p className="text-xs text-foreground-400">{cat.desc}</p>
                </div>
                <i className="ri-arrow-right-s-line text-foreground-300 ml-auto"></i>
              </div>
            ))}
          </div>
        </div>

        {/* Tools Grid */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-heading font-semibold text-lg text-foreground-950">实用工具</h3>
            <Link to="/ai-agent" className="text-sm text-primary-500 hover:text-primary-600 flex items-center gap-1">
              查看全部 <i className="ri-arrow-right-s-line"></i>
            </Link>
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
            {aiCategories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  activeCategory === cat.key
                    ? "bg-primary-500 text-white"
                    : "bg-white text-foreground-500 border border-background-200 hover:border-primary-300"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 border border-background-200 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-background-200 mb-3" />
                  <div className="h-4 bg-background-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-background-200 rounded w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {filteredTools.slice(0, 8).map((tool) => (
                <Link
                  key={tool.id}
                  to="/ai-agent"
                  className="bg-white rounded-2xl p-4 md:p-5 border border-background-200 hover:border-primary-300 hover:shadow-md transition-all group"
                >
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-3 group-hover:bg-primary-100 transition-all">
                    <i className={`${tool.icon || "ri-tools-line"} text-lg md:text-xl text-primary-500`}></i>
                  </div>
                  <p className="text-sm font-semibold text-foreground-800 mb-1 line-clamp-1">{tool.name}</p>
                  <p className="text-xs text-foreground-400 line-clamp-2">{tool.description}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}