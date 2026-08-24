import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface Course {
  id: number;
  title: string;
}

interface AssetLink {
  asset_id: number;
  sort_order: number;
  is_free_trial: boolean;
  content_assets: {
    id: number;
    asset_type: string;
    title: string;
    chapter_id: number | null;
    content_text: string | null;
    audio_url: string | null;
    audio_duration: number | null;
    video_url: string | null;
    video_duration: number | null;
    video_cover: string | null;
  };
}

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

export default function LearnPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [assetLinks, setAssetLinks] = useState<AssetLink[]>([]);
  const [chapNames, setChapNames] = useState<Map<number, string>>(new Map());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [videoProgress, setVideoProgress] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const { data: courseData, error: courseErr } = await supabase
        .from("courses")
        .select("id, title")
        .eq("id", courseId)
        .is("deleted_at", null)
        .maybeSingle();

      if (courseErr) throw courseErr;
      if (!courseData) throw new Error("课程不存在");

      const { data: links, error: linkErr } = await supabase
        .from("course_content_assets")
        .select("asset_id, sort_order, is_free_trial, content_assets(*)")
        .eq("course_id", courseId)
        .order("sort_order");

      if (linkErr) throw linkErr;

      const validLinks: AssetLink[] = (links || []).filter((l: any) => l.content_assets);

      const chapterIds = [...new Set(validLinks.map((l) => l.content_assets.chapter_id).filter(Boolean))] as number[];
      if (chapterIds.length > 0) {
        const { data: chapters } = await supabase
          .from("content_chapters")
          .select("id, name")
          .in("id", chapterIds);
        const nameMap = new Map<number, string>();
        (chapters || []).forEach((ch: any) => nameMap.set(ch.id, ch.name));
        setChapNames(nameMap);
      }

      setCourse(courseData);
      setAssetLinks(validLinks);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (courseId) loadData();
  }, [courseId]);

  const currentLink = assetLinks[currentIdx] || null;
  const currentAsset = currentLink?.content_assets;
  const progressPercent = assetLinks.length > 0 ? Math.round(((currentIdx + 1) / assetLinks.length) * 100) : 0;

  const goNext = () => {
    if (currentIdx < assetLinks.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setVideoProgress(0);
      setIsCompleted(false);
    }
  };

  const goPrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
      setVideoProgress(0);
      setIsCompleted(false);
    }
  };

  const markComplete = () => setIsCompleted(true);

  const handleVideoTimeUpdate = (currentTime: number, duration: number) => {
    if (duration > 0) {
      setVideoProgress(Math.round((currentTime / duration) * 100));
      if (currentTime / duration >= 0.95) markComplete();
    }
  };

  const handleAudioEnded = () => markComplete();

  const getChapName = (chapterId: number | null) => {
    if (!chapterId) return "课程内容";
    return chapNames.get(chapterId) || "课程内容";
  };

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
        <Link to="/courses" className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold whitespace-nowrap hover:bg-primary-600 transition-colors">
          返回课程列表
        </Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-16 flex flex-col">
      {/* Top Bar */}
      <div className="brand-navy-section border-b border-white/10 px-4 md:px-6 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-300 hover:text-white hover:bg-white/10 transition-all"
          >
            <i className={`ri-${sidebarOpen ? "menu-fold" : "menu-unfold"}-line`}></i>
          </button>
          <div>
            <h1 className="text-sm font-semibold text-white line-clamp-1">{course.title}</h1>
            <p className="text-[11px] text-foreground-300">
              {currentAsset ? `${UNIT_LABEL[currentAsset.asset_type] || "图文"} · ${currentAsset.title}` : "暂无内容"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-foreground-300">
            {currentIdx + 1} / {assetLinks.length}
          </span>
          <div className="w-24 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full rounded-full bg-primary-500 transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
          </div>
          <Link
            to={`/courses/${courseId}`}
            className="px-3 py-1.5 rounded-full border border-white/20 text-foreground-300 text-xs font-medium hover:bg-white/10 transition-all whitespace-nowrap"
          >
            退出学习
          </Link>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-[280px] shrink-0 border-r border-background-200/70 bg-white overflow-y-auto hidden lg:block">
            <div className="p-4">
              <p className="text-xs font-semibold text-foreground-400 uppercase tracking-wider mb-3">课程目录</p>
              <div className="space-y-1">
                {assetLinks.map((link, idx) => {
                  const a = link.content_assets;
                  return (
                    <button
                      key={link.asset_id}
                      onClick={() => {
                        setCurrentIdx(idx);
                        setVideoProgress(0);
                        setIsCompleted(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                        idx === currentIdx
                          ? "bg-primary-100 text-primary-700"
                          : idx < currentIdx
                          ? "text-foreground-500 hover:bg-background-50"
                          : "text-foreground-600 hover:bg-background-50"
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        idx === currentIdx ? "bg-primary-200" : idx < currentIdx ? "bg-primary-100" : "bg-background-100"
                      }`}>
                        {idx < currentIdx ? (
                          <i className="ri-check-line text-primary-600 text-sm"></i>
                        ) : (
                          <span className="text-xs font-medium">{idx + 1}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs truncate">{a.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <i className={`${UNIT_ICON[a.asset_type] || "ri-article-line"} text-[10px]`}></i>
                          <span className="text-[10px] text-foreground-400">
                            {UNIT_LABEL[a.asset_type] || "图文"}
                            {a.video_duration && a.video_duration > 0 && ` · ${Math.floor(a.video_duration / 60)}分`}
                            {a.audio_duration && a.audio_duration > 0 && ` · ${Math.floor(a.audio_duration / 60)}分`}
                          </span>
                        </div>
                      </div>
                      {link.is_free_trial && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary-100 text-primary-700 font-medium shrink-0">试看</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-background-50 pb-24 md:pb-10">
          {!currentAsset ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-foreground-400">该课程暂无内容</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
              {/* Header */}
              <div className="mb-6">
                {currentAsset.chapter_id && (
                  <p className="text-xs font-semibold text-primary-500 mb-2 uppercase tracking-wider">
                    {getChapName(currentAsset.chapter_id)}
                  </p>
                )}
                <h2 className="text-xl md:text-2xl font-display font-black text-foreground-900">
                  {currentAsset.title}
                </h2>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-background-100 text-[11px] text-foreground-500">
                    <i className={`${UNIT_ICON[currentAsset.asset_type] || "ri-article-line"} text-[10px]`}></i>
                    {UNIT_LABEL[currentAsset.asset_type] || "图文"}
                  </span>
                  {isCompleted && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-100 text-[11px] text-primary-700 font-medium">
                      <i className="ri-check-line text-[10px]"></i>已完成
                    </span>
                  )}
                </div>
              </div>

              {/* Text */}
              {currentAsset.asset_type === "text" && (
                <div className="bg-white rounded-xl border border-background-200/70 p-6">
                  <div className="prose prose-sm max-w-none text-foreground-700 leading-relaxed whitespace-pre-line">
                    {currentAsset.content_text || "暂无内容"}
                  </div>
                  <div className="mt-8 pt-6 border-t border-background-200/70">
                    <button
                      onClick={markComplete}
                      disabled={isCompleted}
                      className={`px-5 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap ${
                        isCompleted ? "bg-primary-100 text-primary-600 cursor-default" : "bg-primary-500 text-white hover:bg-primary-600"
                      }`}
                    >
                      {isCompleted ? <><i className="ri-check-line mr-1.5"></i>已完成学习</> : "标记为已完成"}
                    </button>
                  </div>
                </div>
              )}

              {/* Video */}
              {currentAsset.asset_type === "video" && (
                <div>
                  <div className="aspect-video rounded-xl overflow-hidden bg-accent-500">
                    {currentAsset.video_url ? (
                      <video
                        key={currentAsset.id}
                        className="w-full h-full"
                        controls
                        playsInline
                        poster={currentAsset.video_cover || undefined}
                        onTimeUpdate={(e) => {
                          const video = e.currentTarget;
                          handleVideoTimeUpdate(video.currentTime, video.duration);
                        }}
                        onEnded={markComplete}
                      >
                        <source src={currentAsset.video_url} type="video/mp4" />
                      </video>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-foreground-300">
                        <div className="text-center">
                          <i className="ri-play-circle-line text-5xl mb-3 block text-primary-400/40"></i>
                          <p className="text-sm">视频链接未配置</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {currentAsset.video_url && videoProgress > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-background-200 overflow-hidden">
                        <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${videoProgress}%` }}></div>
                      </div>
                      <span className="text-[11px] text-foreground-400">{videoProgress}%</span>
                    </div>
                  )}
                </div>
              )}

              {/* Audio */}
              {currentAsset.asset_type === "audio" && (
                <div>
                  <div className="bg-white rounded-xl border border-background-200/70 p-6">
                    {currentAsset.audio_url ? (
                      <div className="space-y-4">
                        <div className="w-full h-40 rounded-xl bg-accent-500 flex items-center justify-center relative overflow-hidden">
                          <div className="absolute inset-0 opacity-20" style={{
                            background: `repeating-radial-gradient(circle at center, transparent 0, transparent 30px, oklch(var(--primary-500) / 0.1) 30px, oklch(var(--primary-500) / 0.1) 31px)`
                          }}></div>
                          <i className="ri-music-line text-5xl text-primary-400/50 relative z-10"></i>
                        </div>
                        <audio key={currentAsset.id} className="w-full" controls onEnded={handleAudioEnded}>
                          <source src={currentAsset.audio_url} type="audio/mpeg" />
                        </audio>
                        {currentAsset.audio_duration && currentAsset.audio_duration > 0 && (
                          <p className="text-xs text-foreground-400 text-center">
                            时长：{Math.floor(currentAsset.audio_duration / 60)} 分 {currentAsset.audio_duration % 60} 秒
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <i className="ri-music-line text-4xl text-foreground-300 mb-3 block"></i>
                        <p className="text-sm text-foreground-400">音频链接未配置</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between mt-8">
                <button
                  onClick={goPrev}
                  disabled={currentIdx === 0}
                  className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                >
                  <i className="ri-arrow-left-line mr-1.5"></i>上一个
                </button>
                <button
                  onClick={goNext}
                  disabled={currentIdx >= assetLinks.length - 1}
                  className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                >
                  {currentIdx >= assetLinks.length - 1 ? "已是最后一节" : "下一个"}
                  <i className="ri-arrow-right-line ml-1.5"></i>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}