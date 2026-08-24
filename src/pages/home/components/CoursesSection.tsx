import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface Course {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  cover_image: string;
  course_type: string;
  price: number;
  original_price: number | null;
  is_free: boolean;
  total_lessons: number;
  duration_minutes: number;
  instructor_name: string;
}

export default function CoursesSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

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
    const fetchCourses = async () => {
      try {
        const { data, error } = await supabase
          .from("courses")
          .select("id, title, subtitle, description, cover_image, course_type, price, original_price, is_free, total_lessons, duration_minutes, instructor_name")
          .eq("status", "active")
          .order("sort_order")
          .limit(6);

        if (error) throw error;
        setCourses(data || []);
      } catch {
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

  const formatPrice = (course: Course) => {
    if (course.is_free) return "免费";
    return `¥${course.price}`;
  };

  return (
    <section ref={sectionRef} className="py-16 md:py-24 bg-background-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between mb-8" data-animate>
          <div>
            <p className="text-xs font-medium tracking-widest text-primary-600 uppercase mb-1">
              Featured Courses
            </p>
            <h2 className="font-heading font-bold text-2xl md:text-3xl text-foreground-950">
              精选课程
            </h2>
          </div>
          <Link
            to="/courses"
            className="text-sm text-primary-500 hover:text-primary-600 flex items-center gap-1 font-medium"
          >
            查看全部 <i className="ri-arrow-right-s-line"></i>
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden border border-background-200 animate-pulse">
                <div className="aspect-[16/10] bg-background-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-background-200 rounded w-3/4" />
                  <div className="h-3 bg-background-200 rounded w-full" />
                  <div className="h-3 bg-background-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {courses.map((course) => (
              <Link
                key={course.id}
                to="/courses"
                className="group bg-white rounded-2xl overflow-hidden border border-background-200 hover:border-primary-200 hover:shadow-lg transition-all"
                data-animate
              >
                <div className="aspect-[16/10] overflow-hidden relative">
                  <img
                    src={course.cover_image || "https://readdy.ai/api/search-image?query=Modern%20minimal%20workspace%20with%20laptop%20and%20coffee%2C%20warm%20natural%20lighting%2C%20clean%20aesthetic%2C%20editorial%20photography&width=600&height=375&seq=course-fallback&orientation=landscape"}
                    alt={course.title}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                  />
                  {course.is_free && (
                    <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-green-500 text-white text-[10px] font-semibold">
                      免费
                    </span>
                  )}
                  <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-medium backdrop-blur-sm">
                    {course.total_lessons} 课时
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-foreground-800 mb-1 line-clamp-1 group-hover:text-primary-600 transition-colors">
                    {course.title}
                  </h3>
                  <p className="text-xs text-foreground-400 line-clamp-2 mb-3">
                    {course.subtitle || course.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center">
                        <i className="ri-user-line text-primary-500 text-[10px]"></i>
                      </div>
                      <span className="text-[10px] text-foreground-400">
                        {course.instructor_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {course.original_price && course.original_price > course.price && (
                        <span className="text-[10px] text-foreground-300 line-through">
                          ¥{course.original_price}
                        </span>
                      )}
                      <span className="text-sm font-bold text-primary-500">
                        {formatPrice(course)}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}