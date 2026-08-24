import { useState, useEffect, useCallback } from "react";
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
  end_time: string;
  price: number;
  status: string;
  max_participants: number;
  registered_count: number;
}

function formatDate(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

function formatTime(d: string): string {
  const date = new Date(d);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWeekDay(d: string): string {
  const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return days[new Date(d).getDay()];
}

function activityStatusLabel(s: string): string {
  const map: Record<string, string> = {
    upcoming: "即将开始",
    ongoing: "进行中",
    ended: "已结束",
  };
  return map[s] || s;
}

function activityTypeIcon(t: string): string {
  return t === "online" ? "ri-global-line" : "ri-map-pin-line";
}

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"upcoming" | "ended">("upcoming");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const now = new Date().toISOString();
      let query = supabase
        .from("activities")
        .select("*")
        .is("deleted_at", null);

      if (filter === "upcoming") {
        query = query.gte("start_time", now);
      } else {
        query = query.lt("start_time", now);
      }

      const { data, error: qErr } = await query.order("start_time", { ascending: filter === "upcoming" });

      if (qErr) throw qErr;
      setActivities((data || []) as Activity[]);
    } catch (e: any) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getRegistrationProgress = (a: Activity) => {
    if (!a.max_participants) return 0;
    return Math.round((a.registered_count / a.max_participants) * 100);
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

  if (error) {
    return (
      <div className="min-h-screen pt-16 flex flex-col items-center justify-center bg-background-50 px-4">
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

  return (
    <main className="min-h-screen pt-16 bg-background-50">
      {/* Hero */}
      <section className="relative overflow-hidden h-[280px] md:h-[360px]">
        <img
          src="https://readdy.ai/api/search-image?query=Warm%20abstract%20geometric%20background%20with%20soft%20flowing%20curves%20in%20terracotta%20and%20cream%20tones%2C%20modern%20minimalist%20event%20atmosphere%2C%20subtle%20golden%20accents%2C%20editorial%20quality%2C%20clean%20elegant%20aesthetic%2C%20no%20text&width=1600&height=900&seq=activities-banner-hero&orientation=landscape"
          alt="活动中心"
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60"></div>
        <div className="relative max-w-7xl mx-auto px-4 md:px-6 h-full flex flex-col justify-end pb-8 md:pb-12">
          <p className="text-xs font-semibold text-primary-300 tracking-[0.2em] uppercase mb-3">
            EVENTS &amp; WORKSHOPS
          </p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
                活动中心
              </h1>
              <p className="mt-3 text-white/70 text-sm md:text-base max-w-lg leading-relaxed">
                线上直播、线下工作坊、私董会、闭门分享——与志同道合的伙伴一起成长
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm text-white/60">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">
                  {activities.filter((a) => a.status === "upcoming").length}
                </p>
                <p className="text-xs mt-0.5">即将开始</p>
              </div>
              <div className="w-px h-10 bg-white/20"></div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">
                  {activities.reduce((s, a) => s + (a.registered_count || 0), 0)}
                </p>
                <p className="text-xs mt-0.5">已报名</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Tabs */}
      <section className="sticky top-16 z-30 bg-background-50/95 backdrop-blur-md border-b border-background-200/70">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center gap-1.5 bg-background-50 rounded-full border border-background-200/70 px-1 py-1 w-fit">
            <button
              onClick={() => setFilter("upcoming")}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                filter === "upcoming"
                  ? "bg-primary-500 text-white"
                  : "text-foreground-600 hover:text-foreground-950"
              }`}
            >
              即将开始
            </button>
            <button
              onClick={() => setFilter("ended")}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                filter === "ended"
                  ? "bg-primary-500 text-white"
                  : "text-foreground-600 hover:text-foreground-950"
              }`}
            >
              往期活动
            </button>
          </div>
        </div>
      </section>

      {/* Activities Grid */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-10 pb-24 md:pb-12">
        {activities.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-background-100 flex items-center justify-center mx-auto mb-4">
              <i className="ri-calendar-event-line text-2xl text-foreground-300"></i>
            </div>
            <p className="text-sm text-foreground-500">
              {filter === "upcoming" ? "暂无即将开始的活动" : "暂无往期活动"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {activities.map((a) => {
              const progress = getRegistrationProgress(a);
              const isFull = a.max_participants > 0 && a.registered_count >= a.max_participants;
              return (
                <div
                  key={a.id}
                  className="bg-white rounded-xl border border-background-200/70 overflow-hidden hover:border-primary-300 transition-all duration-300 group flex flex-col"
                >
                  {/* Cover */}
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <img
                      src={a.cover_image}
                      alt={a.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-accent-950/50 to-transparent"></div>
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        a.activity_type === "online"
                          ? "bg-primary-100 text-primary-700"
                          : "bg-primary-100 text-primary-700"
                      }`}>
                        <i className={`${activityTypeIcon(a.activity_type)} mr-0.5`}></i>
                        {a.activity_type === "online" ? "线上" : "线下"}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        isFull ? "bg-red-100 text-red-700" : "bg-background-100 text-foreground-700"
                      }`}>
                        {isFull ? "已满员" : activityStatusLabel(a.status)}
                      </span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4 flex flex-col flex-1">
                    {/* Date badge */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-primary-50 flex flex-col items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary-600">{formatDate(a.start_time)}</span>
                        <span className="text-[10px] text-primary-400">{formatWeekDay(a.start_time)}</span>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground-950 line-clamp-1 group-hover:text-primary-600 transition-colors">
                          {a.title}
                        </h3>
                        <p className="text-xs text-foreground-400 mt-0.5 flex items-center gap-1">
                          <i className={activityTypeIcon(a.activity_type)}></i>
                          {a.location}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-foreground-500 line-clamp-2 mb-3 flex-1">
                      {a.description}
                    </p>

                    {/* Time + Price */}
                    <div className="flex items-center justify-between text-xs text-foreground-400 mb-3">
                      <span>
                        {formatTime(a.start_time)} - {formatTime(a.end_time)}
                      </span>
                      <span className="font-bold text-primary-600">
                        {a.price === 0 ? "免费" : `¥${a.price}`}
                      </span>
                    </div>

                    {/* Progress */}
                    {a.max_participants > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-[10px] text-foreground-400 mb-1">
                          <span>已报名 {a.registered_count} 人</span>
                          <span>限额 {a.max_participants} 人</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-background-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isFull ? "bg-red-400" : "bg-primary-500"
                            }`}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* CTA */}
                    <button
                      disabled={isFull}
                      className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                        isFull
                          ? "bg-background-100 text-foreground-400 cursor-not-allowed"
                          : "bg-primary-500 text-white hover:bg-primary-600"
                      }`}
                    >
                      {isFull ? "已满员" : "立即报名"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}