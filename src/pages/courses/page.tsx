import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

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
  computed_type?: string;
  asset_count?: number;
}

const TYPE_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "video_only", label: "视频" },
  { value: "audio_only", label: "音频" },
  { value: "text_only", label: "图文" },
  { value: "mixed", label: "混合" },
];

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

export default function Courses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeType, setActiveType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCourses = async () => {
    try {
      setLoading(true);
      setError("");

      const { data, error: dbError } = await supabase
        .from("courses")
        .select("*")
        .eq("is_published", true)
        .is("deleted_at", null)
        .order("sort_order")
        .order("created_at", { ascending: false });

      if (dbError) throw dbError;

      if (data) {
        const enriched = await Promise.all(
          (data as any[]).map(async (row) => {
            const { data: links } = await supabase
              .from("course_content_assets")
              .select("asset_id, content_assets(asset_type)")
              .eq("course_id", row.id)
              .order("sort_order");

            const types = new Set<string>();
            if (links) {
              links.forEach((l: any) => {
                if (l.content_assets?.asset_type) types.add(l.content_assets.asset_type);
              });
            }

            let computedType = "text_only";
            if (types.size === 1) {
              const t = [...types][0];
              if (t === "text") computedType = "text_only";
              else if (t === "audio") computedType = "audio_only";
              else if (t === "video") computedType = "video_only";
            } else if (types.size > 1) {
              computedType = "mixed";
            }

            return {
              ...row,
              computed_type: computedType,
              asset_count: links?.length || 0,
            };
          })
        );
        setCourses(enriched);
      }
    } catch (err: any) {
      console.error("Failed to load courses:", err);
      setError(err?.message || "加载课程失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const filtered = courses.filter((c) => {
    const matchType = activeType === "all" || c.computed_type === activeType;
    const matchSearch =
      !searchQuery ||
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.subtitle || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchType && matchSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen pt-16">
        <i className="ri-loader-4-line animate-spin text-3xl text-primary-500"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen pt-16">
        <div className="w-16 h-16 rounded-2xl bg-background-100 flex items-center justify-center mb-4">
          <i className="ri-error-warning-line text-2xl text-primary-500"></i>
        </div>
        <p className="text-sm text-foreground-500 mb-4">{error}</p>
        <button
          onClick={loadCourses}
          className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold whitespace-nowrap hover:bg-primary-600 transition-colors"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-16">
      {/* Banner Hero */}
      <section className="relative overflow-hidden h-[320px] md:h-[420px]">
        <img
          src="https://readdy.ai/api/search-image?query=Abstract%20geometric%20warm%20gradient%20background%20with%20soft%20overlapping%20circles%20and%20flowing%20organic%20shapes%2C%20warm%20beige%20and%20cream%20tones%20with%20subtle%20golden%20accents%2C%20modern%20minimalist%20design%2C%20smooth%20texture%2C%20editorial%20quality%2C%20clean%20aesthetic%2C%20luxurious%20feel%2C%20soft%20atmospheric%20lighting%2C%20no%20text%2C%20abstract%20composition&width=1600&height=900&seq=courses-banner-hero-2026&orientation=landscape"
          alt="课程中心"
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60"></div>
        <div className="relative max-w-7xl mx-auto px-4 md:px-6 h-full flex flex-col justify-end pb-10 md:pb-14">
          <p className="text-xs font-semibold text-primary-300 tracking-[0.2em] uppercase mb-3">
            NUCLECHAIN ACADEMY
          </p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <h1 className="text-3xl md:text-5xl font-display font-black text-white tracking-tight">
                课程中心
              </h1>
              <p className="mt-3 text-white/70 text-sm md:text-base max-w-lg leading-relaxed">
                系统化学习影响力打造、内容创作、商业变现等核心能力，找到你的成长路径
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm text-white/60">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{courses.length}</p>
                <p className="text-xs mt-0.5">精品课程</p>
              </div>
              <div className="w-px h-10 bg-white/20"></div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">
                  {courses.reduce((s, c) => s + (c.asset_count || 0), 0)}
                </p>
                <p className="text-xs mt-0.5">内容单元</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="sticky top-16 z-30 bg-background-50/95 backdrop-blur-md border-b border-background-200/70">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索课程..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm text-foreground-800 placeholder:text-foreground-300 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto flex-nowrap bg-background-50 rounded-full border border-background-200/70 px-1 py-1">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setActiveType(opt.value)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  activeType === opt.value
                    ? "bg-primary-500 text-white"
                    : "text-foreground-600 hover:text-foreground-950 hover:bg-background-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Course Grid */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12 pb-24 md:pb-12">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-background-100 flex items-center justify-center mx-auto mb-4">
              <i className="ri-inbox-line text-2xl text-foreground-300"></i>
            </div>
            <p className="text-sm text-foreground-500">没有找到相关课程</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
            {filtered.map((course) => {
              const ct = course.computed_type || "text_only";
              return (
                <Link
                  key={course.id}
                  to={`/courses/${course.id}`}
                  className="group bg-background-50 rounded-xl border border-background-200/70 hover:border-primary-300 overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary-500/5"
                >
                  {/* Cover */}
                  <div className="relative aspect-[3/2] overflow-hidden">
                    <img
                      src={course.cover_image}
                      alt={course.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-accent-950/60 to-transparent"></div>
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full bg-white/95 text-[10px] sm:text-[11px] font-semibold text-foreground-900 flex items-center gap-1">
                        <i className={`${TYPE_ICON[ct]} text-[10px]`}></i>
                        {TYPE_LABEL[ct]}
                      </span>
                      {course.price === 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-primary-500 text-[10px] sm:text-[11px] font-semibold text-foreground-900">
                          免费
                        </span>
                      )}
                    </div>
                    <div className="absolute bottom-2 left-2 text-[10px] text-white/80 flex items-center gap-1">
                      <i className="ri-play-list-2-line text-[10px]"></i>
                      <span className="hidden sm:inline">{course.asset_count || 0} 个内容单元</span>
                      <span className="sm:hidden">{course.asset_count || 0} 节</span>
                    </div>
                  </div>

                  <div className="p-3 md:p-4">
                    <h3 className="text-xs sm:text-sm font-semibold text-foreground-950 group-hover:text-primary-600 transition-colors line-clamp-1">
                      {course.title}
                    </h3>
                    <p className="mt-1 text-[10px] sm:text-xs text-foreground-500 line-clamp-1 sm:line-clamp-2">
                      {course.subtitle || course.description || "暂无简介"}
                    </p>

                    <div className="mt-2 md:mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1 text-[10px] sm:text-xs text-foreground-400">
                        <i className="ri-eye-line"></i>
                        <span>{course.view_count}</span>
                        <span className="mx-0.5">·</span>
                        <i className="ri-shopping-cart-line"></i>
                        <span>{course.sold_count}</span>
                      </div>
                      <div className="text-right">
                        {course.price === 0 ? (
                          <span className="text-xs sm:text-sm font-bold text-primary-600">免费</span>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className="text-xs sm:text-sm font-bold text-primary-600">
                              ¥{course.price}
                            </span>
                            {course.member_price && course.member_price < course.price && (
                              <span className="text-[10px] text-foreground-400">
                                会员 ¥{course.member_price}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}