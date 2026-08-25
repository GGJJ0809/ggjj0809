import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface KnowledgeConfig {
  productIds?: number[];
  displayCount?: number;
  layout?: string;
}

export default function KnowledgeProductRenderer({ config, isPreview = false }: { config: KnowledgeConfig; isPreview?: boolean }) {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        let query = supabase.from("courses").select("*").order("created_at", { ascending: false });
        if (config.productIds && config.productIds.length > 0) {
          query = query.in("id", config.productIds);
        } else {
          query = query.eq("status", "active");
        }
        query = query.limit(config.displayCount || 4);
        const { data } = await query;
        if (data) setCourses(data);
      } catch { /* silent */ }
      setLoading(false);
    };
    fetchCourses();
  }, [config.productIds, config.displayCount]);

  if (loading) return <section className={isPreview ? "py-4 px-3" : "py-10 px-4 md:px-6 max-w-7xl mx-auto"}><div className="flex items-center justify-center h-20"><i className="ri-loader-4-line animate-spin text-xl text-foreground-300"></i></div></section>;
  if (courses.length === 0) return null;

  return (
    <section className={isPreview ? "py-4 px-3" : "py-10 md:py-14 px-4 md:px-6 max-w-7xl mx-auto"}>
      <div className={`text-center ${isPreview ? "mb-4" : "mb-8 md:mb-10"}`}>
        <h2 className={`${isPreview ? "text-base" : "text-2xl md:text-3xl"} font-heading font-bold text-foreground-950`}>精选课程</h2>
        <p className={`mt-1 ${isPreview ? "text-[10px]" : "mt-2 text-sm"} text-foreground-500`}>系统化学习，打造你的影响力</p>
      </div>
      <div className={`grid ${config.layout === "list" ? "grid-cols-1" : isPreview ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"} ${isPreview ? "gap-2" : "gap-4 md:gap-5"}`}>
        {courses.map((course) => (
          <Link key={course.id} to={`/courses/${course.id}`} className={`group bg-background-50 rounded-2xl border border-background-200/70 overflow-hidden hover:shadow-sm hover:border-primary-200 transition-all ${isPreview ? "rounded-xl" : ""}`}>
            <div className={`${isPreview ? "aspect-[3/2]" : "aspect-[4/3]"} overflow-hidden`}>
              <img src={course.cover_image || "https://readdy.ai/api/search-image?query=Modern%20educational%20course%20cover%20with%20warm%20orange%20accents%2C%20clean%20minimalist%20design%2C%20professional%20corporate%20style%2C%20soft%20atmospheric%20lighting&width=800&height=600&seq=course-fallback&orientation=landscape"} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            </div>
            <div className={isPreview ? "p-2.5" : "p-4"}>
              <h3 className={`${isPreview ? "text-[11px] leading-tight" : "text-sm md:text-base"} font-semibold text-foreground-900 line-clamp-2 group-hover:text-primary-600 transition-colors`}>{course.title}</h3>
              <p className={`text-[10px] text-foreground-400 ${isPreview ? "mt-0.5" : "mt-1"} line-clamp-1`}>{course.instructor || ""}</p>
              <div className={`flex items-center justify-between ${isPreview ? "mt-1.5" : "mt-3"}`}>
                <span className={`${isPreview ? "text-xs" : "text-sm"} font-bold text-primary-600`}>{course.price ? `¥${course.price}` : "免费"}</span>
                <span className={`${isPreview ? "text-[8px]" : "text-[10px]"} text-foreground-400`}>{course.student_count || 0} 人已学</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}