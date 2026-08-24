import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface Activity {
  id: number;
  title: string;
  description: string;
  cover_image: string;
  activity_type: string;
  location: string;
  start_time: string;
  price: number;
  max_participants: number;
  registered_count: number;
}

export default function ActivitiesSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
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
    const fetchActivities = async () => {
      try {
        const { data, error } = await supabase
          .from("activities")
          .select("id, title, description, cover_image, activity_type, location, start_time, price, max_participants, registered_count")
          .eq("status", "upcoming")
          .order("sort_order")
          .limit(3);

        if (error) throw error;
        setActivities(data || []);
      } catch {
        setActivities([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, []);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <section ref={sectionRef} className="py-16 md:py-24 bg-background-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between mb-8" data-animate>
          <div>
            <p className="text-xs font-medium tracking-widest text-primary-600 uppercase mb-1">
              Upcoming Events
            </p>
            <h2 className="font-heading font-bold text-2xl md:text-3xl text-foreground-950">
              近期活动
            </h2>
          </div>
          <Link
            to="/activities"
            className="text-sm text-primary-500 hover:text-primary-600 flex items-center gap-1 font-medium"
          >
            查看全部 <i className="ri-arrow-right-s-line"></i>
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden border border-background-200 animate-pulse">
                <div className="aspect-[16/9] bg-background-200" />
                <div className="p-5 space-y-2">
                  <div className="h-4 bg-background-200 rounded w-3/4" />
                  <div className="h-3 bg-background-200 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {activities.map((activity) => (
              <Link
                key={activity.id}
                to="/activities"
                className="group bg-white rounded-2xl overflow-hidden border border-background-200 hover:border-primary-200 hover:shadow-lg transition-all"
                data-animate
              >
                <div className="aspect-[16/9] overflow-hidden relative">
                  <img
                    src={activity.cover_image || "https://readdy.ai/api/search-image?query=Modern%20conference%20room%20with%20warm%20lighting%2C%20professional%20meeting%20setup%2C%20clean%20minimal%20aesthetic%2C%20editorial%20photography&width=600&height=338&seq=activity-fallback&orientation=landscape"}
                    alt={activity.title}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                  />
                  <span className={`absolute top-3 left-3 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    activity.activity_type === "online"
                      ? "bg-blue-500 text-white"
                      : "bg-primary-500 text-white"
                  }`}>
                    {activity.activity_type === "online" ? "线上" : "线下"}
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="text-sm font-semibold text-foreground-800 mb-2 line-clamp-1 group-hover:text-primary-600 transition-colors">
                    {activity.title}
                  </h3>
                  <p className="text-xs text-foreground-400 line-clamp-2 mb-3">
                    {activity.description}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-foreground-400">
                    <span className="flex items-center gap-1">
                      <i className="ri-calendar-line"></i>
                      {formatDate(activity.start_time)}
                    </span>
                    <span className="flex items-center gap-1">
                      <i className="ri-time-line"></i>
                      {formatTime(activity.start_time)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-background-100">
                    <span className="text-xs text-foreground-400 flex items-center gap-1">
                      <i className="ri-map-pin-line"></i>
                      {activity.location}
                    </span>
                    <span className="text-sm font-bold text-primary-500">
                      {activity.price === 0 ? "免费" : `¥${activity.price}`}
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="w-full h-1.5 bg-background-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all"
                        style={{
                          width: `${Math.min(
                            (activity.registered_count / activity.max_participants) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-foreground-400 mt-1">
                      已报名 {activity.registered_count} / {activity.max_participants} 人
                    </p>
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