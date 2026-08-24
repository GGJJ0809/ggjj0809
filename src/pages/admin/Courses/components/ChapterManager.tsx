import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Chapter {
  id: number;
  course_id: number;
  title: string;
  sort_order: number;
}

interface Lesson {
  id: number;
  chapter_id: number;
  course_id: number;
  title: string;
  lesson_type: string;
  video_url: string;
  audio_url: string;
  content: string;
  duration_minutes: number;
  is_free_preview: boolean;
  sort_order: number;
  status: string;
}

interface Props {
  courseId: number;
  courseTitle: string;
  onBack: () => void;
}

const emptyChapter = { title: "", sort_order: 0 };

const emptyLesson = {
  title: "",
  lesson_type: "video" as const,
  video_url: "",
  audio_url: "",
  content: "",
  duration_minutes: 15,
  is_free_preview: false,
  sort_order: 0,
  status: "draft",
};

export default function ChapterManager({ courseId, courseTitle, onBack }: Props) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [lessons, setLessons] = useState<Record<number, Lesson[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);

  // Chapter form
  const [showChapterModal, setShowChapterModal] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<number | null>(null);
  const [chapterForm, setChapterForm] = useState(emptyChapter);
  const [chapterSaveLoading, setChapterSaveLoading] = useState(false);

  // Lesson form
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [lessonChapterId, setLessonChapterId] = useState<number | null>(null);
  const [lessonForm, setLessonForm] = useState(emptyLesson);
  const [lessonSaveLoading, setLessonSaveLoading] = useState(false);

  const [toast, setToast] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: chapData, error: chapErr } = await supabase
        .from("chapters")
        .select("*")
        .eq("course_id", courseId)
        .order("sort_order");

      if (chapErr) throw chapErr;

      const { data: lesData, error: lesErr } = await supabase
        .from("lessons")
        .select("*")
        .eq("course_id", courseId)
        .order("sort_order");

      if (lesErr) throw lesErr;

      setChapters(chapData || []);
      const map: Record<number, Lesson[]> = {};
      (lesData || []).forEach((l: Lesson) => {
        if (!map[l.chapter_id]) map[l.chapter_id] = [];
        map[l.chapter_id].push(l);
      });
      setLessons(map);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [courseId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // === Chapter CRUD ===
  const openChapterCreate = () => {
    setEditingChapterId(null);
    setChapterForm(emptyChapter);
    setShowChapterModal(true);
  };

  const openChapterEdit = (ch: Chapter) => {
    setEditingChapterId(ch.id);
    setChapterForm({ title: ch.title, sort_order: ch.sort_order });
    setShowChapterModal(true);
  };

  const handleChapterSave = async () => {
    if (!chapterForm.title.trim()) return;
    try {
      setChapterSaveLoading(true);
      const payload = { ...chapterForm, course_id: courseId, updated_at: new Date().toISOString() };
      if (editingChapterId) {
        await supabase.from("chapters").update(payload).eq("id", editingChapterId);
      } else {
        await supabase.from("chapters").insert(payload);
      }
      setShowChapterModal(false);
      await loadData();
      showToast(editingChapterId ? "章节已更新" : "章节已创建");
    } catch (err: any) {
      showToast("保存失败：" + (err?.message || ""));
    } finally {
      setChapterSaveLoading(false);
    }
  };

  const handleChapterDelete = async (id: number) => {
    if (!confirm("删除章节将同时删除其下所有课时，确定吗？")) return;
    await supabase.from("chapters").delete().eq("id", id);
    await loadData();
    showToast("章节已删除");
  };

  // === Lesson CRUD ===
  const openLessonCreate = (chapterId: number) => {
    setEditingLessonId(null);
    setLessonChapterId(chapterId);
    setLessonForm({ ...emptyLesson, sort_order: (lessons[chapterId] || []).length + 1 });
    setShowLessonModal(true);
  };

  const openLessonEdit = (lesson: Lesson) => {
    setEditingLessonId(lesson.id);
    setLessonChapterId(lesson.chapter_id);
    setLessonForm({
      title: lesson.title,
      lesson_type: lesson.lesson_type,
      video_url: lesson.video_url || "",
      audio_url: lesson.audio_url || "",
      content: lesson.content || "",
      duration_minutes: lesson.duration_minutes,
      is_free_preview: lesson.is_free_preview,
      sort_order: lesson.sort_order,
      status: lesson.status,
    });
    setShowLessonModal(true);
  };

  const handleLessonSave = async () => {
    if (!lessonForm.title.trim() || !lessonChapterId) return;
    try {
      setLessonSaveLoading(true);
      const payload = { ...lessonForm, chapter_id: lessonChapterId, course_id: courseId, updated_at: new Date().toISOString() };
      if (editingLessonId) {
        await supabase.from("lessons").update(payload).eq("id", editingLessonId);
      } else {
        await supabase.from("lessons").insert(payload);
      }
      setShowLessonModal(false);
      await loadData();
      showToast(editingLessonId ? "课时已更新" : "课时已创建");
    } catch (err: any) {
      showToast("保存失败：" + (err?.message || ""));
    } finally {
      setLessonSaveLoading(false);
    }
  };

  const handleLessonDelete = async (id: number) => {
    if (!confirm("确定删除该课时吗？")) return;
    await supabase.from("lessons").delete().eq("id", id);
    await loadData();
    showToast("课时已删除");
  };

  const toggleLessonStatus = async (lesson: Lesson) => {
    const newStatus = lesson.status === "active" ? "draft" : "active";
    await supabase.from("lessons").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", lesson.id);
    await loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
      </div>
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
          >
            <i className="ri-arrow-left-line"></i>
          </button>
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground-950">
              章节与课时管理
            </h1>
            <p className="text-sm text-foreground-500 mt-0.5">{courseTitle}</p>
          </div>
        </div>
        <button
          onClick={openChapterCreate}
          className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-all whitespace-nowrap"
        >
          <i className="ri-add-line mr-1.5"></i>新建章节
        </button>
      </div>

      {/* Chapters List */}
      {chapters.length === 0 ? (
        <div className="bg-background-50 rounded-xl border border-background-200/70 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-background-100 flex items-center justify-center mx-auto mb-4">
            <i className="ri-book-open-line text-2xl text-foreground-300"></i>
          </div>
          <p className="text-sm text-foreground-500">还没有章节，点击上方按钮创建</p>
        </div>
      ) : (
        <div className="space-y-3">
          {chapters.map((ch) => {
            const chapterLessons = lessons[ch.id] || [];
            const isExpanded = expandedChapter === ch.id;
            return (
              <div
                key={ch.id}
                className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden"
              >
                {/* Chapter Header */}
                <div
                  className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-background-50/80 transition-colors"
                  onClick={() => setExpandedChapter(isExpanded ? null : ch.id)}
                >
                  <div className="flex items-center gap-3">
                    <i className={`ri-${isExpanded ? "subtract" : "add"}-line text-foreground-400`}></i>
                    <span className="font-medium text-foreground-900 text-sm">
                      第{ch.sort_order}章：{ch.title}
                    </span>
                    <span className="text-xs text-foreground-400">
                      {chapterLessons.length} 课时
                    </span>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openLessonCreate(ch.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                      title="添加课时"
                    >
                      <i className="ri-play-list-add-line text-sm"></i>
                    </button>
                    <button
                      onClick={() => openChapterEdit(ch)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                    >
                      <i className="ri-edit-line text-sm"></i>
                    </button>
                    <button
                      onClick={() => handleChapterDelete(ch.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                      <i className="ri-delete-bin-line text-sm"></i>
                    </button>
                  </div>
                </div>

                {/* Lessons */}
                {isExpanded && (
                  <div className="border-t border-background-200/70">
                    {chapterLessons.length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-foreground-400">
                        该章节下还没有课时
                      </div>
                    ) : (
                      <div className="divide-y divide-background-100">
                        {chapterLessons.map((lesson) => (
                          <div
                            key={lesson.id}
                            className="flex items-center justify-between px-5 py-3 hover:bg-background-50/50 transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-background-100 flex items-center justify-center shrink-0">
                                <i
                                  className={`${
                                    lesson.lesson_type === "video"
                                      ? "ri-play-circle-line"
                                      : lesson.lesson_type === "audio"
                                      ? "ri-music-line"
                                      : "ri-article-line"
                                  } text-foreground-500 text-sm`}
                                ></i>
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-foreground-800 truncate">
                                    {lesson.title}
                                  </span>
                                  {lesson.is_free_preview && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary-100 text-primary-600 font-medium shrink-0">
                                      试看
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-foreground-400">
                                  {lesson.duration_minutes} 分钟
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 ml-3">
                              <button
                                onClick={() => toggleLessonStatus(lesson)}
                                className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-all whitespace-nowrap ${
                                  lesson.status === "active"
                                    ? "bg-primary-100 text-primary-700"
                                    : "bg-background-200 text-foreground-500"
                                }`}
                              >
                                {lesson.status === "active" ? "已发布" : "草稿"}
                              </button>
                              <button
                                onClick={() => openLessonEdit(lesson)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                              >
                                <i className="ri-edit-line text-sm"></i>
                              </button>
                              <button
                                onClick={() => handleLessonDelete(lesson.id)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all"
                              >
                                <i className="ri-delete-bin-line text-sm"></i>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Chapter Modal */}
      {showChapterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowChapterModal(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-background-200/70 flex items-center justify-between">
              <h3 className="font-semibold text-foreground-950">
                {editingChapterId ? "编辑章节" : "新建章节"}
              </h3>
              <button
                onClick={() => setShowChapterModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">
                  章节标题 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={chapterForm.title}
                  onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                  placeholder="第一章：xxx"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">排序</label>
                <input
                  type="number"
                  value={chapterForm.sort_order}
                  onChange={(e) => setChapterForm({ ...chapterForm, sort_order: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                  min="0"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-background-200/70 flex justify-end gap-3">
              <button
                onClick={() => setShowChapterModal(false)}
                className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap"
              >
                取消
              </button>
              <button
                onClick={handleChapterSave}
                disabled={chapterSaveLoading || !chapterForm.title.trim()}
                className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap"
              >
                {chapterSaveLoading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lesson Modal */}
      {showLessonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowLessonModal(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-lg max-h-[85vh] overflow-y-auto mx-4">
            <div className="sticky top-0 bg-background-50 border-b border-background-200/70 px-5 py-4 flex items-center justify-between z-10">
              <h3 className="font-semibold text-foreground-950">
                {editingLessonId ? "编辑课时" : "新建课时"}
              </h3>
              <button
                onClick={() => setShowLessonModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">
                  课时标题 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={lessonForm.title}
                  onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                  placeholder="什么是影响力五力模型"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">类型</label>
                  <select
                    value={lessonForm.lesson_type}
                    onChange={(e) => setLessonForm({ ...lessonForm, lesson_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                  >
                    <option value="video">视频</option>
                    <option value="audio">音频</option>
                    <option value="article">图文</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">时长(分钟)</label>
                  <input
                    type="number"
                    value={lessonForm.duration_minutes}
                    onChange={(e) => setLessonForm({ ...lessonForm, duration_minutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                    min="0"
                  />
                </div>
              </div>

              {lessonForm.lesson_type === "video" && (
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">视频 URL</label>
                  <input
                    type="text"
                    value={lessonForm.video_url}
                    onChange={(e) => setLessonForm({ ...lessonForm, video_url: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                    placeholder="https://..."
                  />
                </div>
              )}

              {lessonForm.lesson_type === "audio" && (
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">音频 URL</label>
                  <input
                    type="text"
                    value={lessonForm.audio_url}
                    onChange={(e) => setLessonForm({ ...lessonForm, audio_url: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                    placeholder="https://..."
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">排序</label>
                  <input
                    type="number"
                    value={lessonForm.sort_order}
                    onChange={(e) => setLessonForm({ ...lessonForm, sort_order: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">状态</label>
                  <select
                    value={lessonForm.status}
                    onChange={(e) => setLessonForm({ ...lessonForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                  >
                    <option value="draft">草稿</option>
                    <option value="active">已发布</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lessonForm.is_free_preview}
                  onChange={(e) => setLessonForm({ ...lessonForm, is_free_preview: e.target.checked })}
                  className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-400"
                />
                <span className="text-xs text-foreground-600">允许免费试看</span>
              </label>
            </div>
            <div className="sticky bottom-0 bg-background-50 border-t border-background-200/70 px-5 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowLessonModal(false)}
                className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap"
              >
                取消
              </button>
              <button
                onClick={handleLessonSave}
                disabled={lessonSaveLoading || !lessonForm.title.trim()}
                className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap"
              >
                {lessonSaveLoading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}