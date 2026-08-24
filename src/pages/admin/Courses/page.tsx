import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import AssetPicker from "./components/AssetPicker";
import type { AssetPickerResult } from "./components/AssetPicker";

/* ---------- types ---------- */
interface CourseRow {
  id: number;
  title: string;
  subtitle: string;
  cover_image: string;
  description: string;
  price: number;
  member_price: number | null;
  member_level_required: number;
  is_published: boolean;
  is_featured: boolean;
  sort_order: number;
  view_count: number;
  sold_count: number;
  column_id: number | null;
  column_title?: string;
  /* computed */
  computed_type?: string;
  asset_count?: number;
}

interface ColumnRow {
  id: number;
  title: string;
  is_published: boolean;
}

interface PickedAsset {
  asset_id: number;
  asset: {
    id: number;
    asset_type: string;
    title: string;
  };
  sort_order: number;
  is_free_trial: boolean;
}

/* ---------- constants ---------- */
const TYPE_LABEL: Record<string, string> = {
  text_only: "图文课",
  audio_only: "音频课",
  video_only: "视频课",
  mixed: "混合课程",
};

const TYPE_COLORS: Record<string, string> = {
  text_only: "bg-secondary-100 text-secondary-700",
  audio_only: "bg-accent-100 text-accent-700",
  video_only: "bg-primary-100 text-primary-700",
  mixed: "bg-amber-100 text-amber-700",
};

const TYPE_ICONS: Record<string, string> = {
  text_only: "ri-article-line",
  audio_only: "ri-music-line",
  video_only: "ri-play-circle-line",
  mixed: "ri-stack-line",
};

/* ---------- helpers ---------- */
function computeCourseType(assets: PickedAsset[]): string {
  const types = new Set(assets.map((p) => p.asset.asset_type));
  if (types.size === 1) {
    const t = [...types][0];
    if (t === "text") return "text_only";
    if (t === "audio") return "audio_only";
    if (t === "video") return "video_only";
  }
  return "mixed";
}

interface WizardForm {
  title: string;
  subtitle: string;
  cover_image: string;
  description: string;
  column_id: number | null;
  price: number;
  member_price: number | null;
  member_level_required: number;
  sort_order: number;
  is_featured: boolean;
}

const EMPTY_FORM: WizardForm = {
  title: "",
  subtitle: "",
  cover_image: "",
  description: "",
  column_id: null,
  price: 0,
  member_price: null,
  member_level_required: 0,
  sort_order: 0,
  is_featured: false,
};

/* ---------- page ---------- */
export default function CoursesAdmin() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  /* filters */
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  /* wizard state */
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<WizardForm>(EMPTY_FORM);
  const [wizardPicks, setWizardPicks] = useState<PickedAsset[]>([]);
  const [wizardChapters, setWizardChapters] = useState<AssetPickerResult["chapters"]>([]);
  const [saving, setSaving] = useState(false);
  const [wizardError, setWizardError] = useState("");

  /* detail view */
  const [viewingCourse, setViewingCourse] = useState<CourseRow | null>(null);
  const [viewAssets, setViewAssets] = useState<any[]>([]);
  const [viewAssetsLoading, setViewAssetsLoading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  /* ---------- data loading ---------- */
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [courseRes, colRes] = await Promise.all([
        supabase.from("courses").select("*").is("deleted_at", null).order("sort_order").order("created_at", { ascending: false }),
        supabase.from("columns").select("id, title, is_published").order("sort_order"),
      ]);

      if (courseRes.error) throw courseRes.error;

      const colMap = new Map<number, string>();
      if (colRes.data) {
        setColumns(colRes.data);
        colRes.data.forEach((c: any) => colMap.set(c.id, c.title));
      }

      if (courseRes.data) {
        /* compute type and asset count for each course */
        const rows: CourseRow[] = [];
        for (const row of courseRes.data as any[]) {
          const { data: links } = await supabase
            .from("course_content_assets")
            .select("asset_id, is_free_trial, content_assets(asset_type)")
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

          rows.push({
            ...row,
            column_title: row.column_id ? colMap.get(row.column_id) : undefined,
            computed_type: computedType,
            asset_count: links?.length || 0,
          });
        }
        setCourses(rows);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ---------- filters ---------- */
  const filtered = courses.filter((c) => {
    if (filterType !== "all" && c.computed_type !== filterType) return false;
    if (filterStatus === "published" && !c.is_published) return false;
    if (filterStatus === "draft" && c.is_published) return false;
    return true;
  });

  /* ---------- wizard ---------- */
  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setWizardPicks([]);
    setWizardChapters([]);
    setWizardStep(1);
    setWizardError("");
    setShowWizard(true);
  };

  const openEdit = async (course: CourseRow) => {
    setEditingId(course.id);
    setForm({
      title: course.title,
      subtitle: course.subtitle || "",
      cover_image: course.cover_image || "",
      description: course.description || "",
      column_id: course.column_id,
      price: course.price,
      member_price: course.member_price,
      member_level_required: course.member_level_required || 0,
      sort_order: course.sort_order || 0,
      is_featured: course.is_featured || false,
    });

    /* load existing chapters and lessons */
    const { data: existingChapters } = await supabase
      .from("chapters")
      .select("id, title, sort_order")
      .eq("course_id", course.id)
      .order("sort_order");

    const { data: existingLessons } = await supabase
      .from("lessons")
      .select("*")
      .eq("course_id", course.id)
      .order("sort_order");

    const chapters: AssetPickerResult["chapters"] = [];
    const ungrouped: PickedAsset[] = [];

    if (existingChapters && existingLessons) {
      for (const ch of existingChapters) {
        const chapterLessons = existingLessons.filter((l: any) => l.chapter_id === ch.id);
        const assets: PickedAsset[] = chapterLessons.map((l: any, i: number) => ({
          asset_id: 0, // lessons don't have direct asset_id
          asset: {
            id: l.id,
            asset_type: l.lesson_type === "article" ? "text" : l.lesson_type === "audio" ? "audio" : "video",
            title: l.title,
            category_id: null,
            chapter_id: null,
            audio_duration: l.duration_minutes ? l.duration_minutes * 60 : null,
            video_duration: l.duration_minutes ? l.duration_minutes * 60 : null,
            is_free_preview: l.is_free_preview || false,
            status: l.status || "draft",
            audio_url: l.audio_url,
            video_url: l.video_url,
            content_text: l.content,
          },
          sort_order: i + 1,
          is_free_trial: l.is_free_preview || false,
        }));
        if (assets.length > 0) {
          chapters.push({ tempId: `edit_ch_${ch.id}`, name: ch.title, assets });
        }
      }

      /* lessons without chapter go to ungrouped */
      const unassignedLessons = existingLessons.filter((l: any) => !l.chapter_id || !existingChapters?.find((c: any) => c.id === l.chapter_id));
      ungrouped.push(...unassignedLessons.map((l: any, i: number) => ({
        asset_id: 0,
        asset: {
          id: l.id,
          asset_type: l.lesson_type === "article" ? "text" : l.lesson_type === "audio" ? "audio" : "video",
          title: l.title,
          category_id: null,
          chapter_id: null,
          audio_duration: l.duration_minutes ? l.duration_minutes * 60 : null,
          video_duration: l.duration_minutes ? l.duration_minutes * 60 : null,
          is_free_preview: l.is_free_preview || false,
          status: l.status || "draft",
          audio_url: l.audio_url,
          video_url: l.video_url,
          content_text: l.content,
        },
        sort_order: i + 1,
        is_free_trial: l.is_free_preview || false,
      })));
    }

    setWizardChapters(chapters);
    setWizardPicks(ungrouped);
    setWizardStep(2);
    setWizardError("");
    setShowWizard(true);
  };

  const handleAssetPickerSave = (result: AssetPickerResult) => {
    setWizardChapters(result.chapters);
    setWizardPicks(result.ungrouped);
    setWizardStep(3);
  };

  const handleCopy = async (course: CourseRow) => {
    if (!confirm(`确定要复制课程「${course.title}」吗？`)) return;
    try {
      const { data: links } = await supabase
        .from("course_content_assets")
        .select("asset_id, sort_order, is_free_trial")
        .eq("course_id", course.id)
        .order("sort_order");

      const { data: newCourse, error: insErr } = await supabase
        .from("courses")
        .insert({
          title: course.title + "（副本）",
          subtitle: course.subtitle,
          cover_image: course.cover_image,
          description: course.description,
          column_id: course.column_id,
          price: course.price,
          member_price: course.member_price,
          member_level_required: course.member_level_required,
          is_published: false,
          is_featured: false,
          sort_order: (course.sort_order || 0) + 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insErr) throw insErr;

      if (links && links.length > 0 && newCourse) {
        await supabase.from("course_content_assets").insert(
          links.map((l: any) => ({
            course_id: newCourse.id,
            asset_id: l.asset_id,
            sort_order: l.sort_order,
            is_free_trial: l.is_free_trial,
            created_at: new Date().toISOString(),
          }))
        );
      }
      await loadData();
      showToast("课程已复制（含素材引用）");
    } catch (err: any) {
      showToast("复制失败：" + (err?.message || ""));
    }
  };

  const handleDelete = async (course: CourseRow) => {
    if (!confirm(`确定要删除课程「${course.title}」吗？（软删除）`)) return;
    try {
      await supabase
        .from("courses")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", course.id);
      await loadData();
      showToast("课程已删除");
    } catch (err: any) {
      showToast("删除失败：" + (err?.message || ""));
    }
  };

  const handleTogglePublish = async (course: CourseRow) => {
    try {
      await supabase
        .from("courses")
        .update({ is_published: !course.is_published, updated_at: new Date().toISOString() })
        .eq("id", course.id);
      await loadData();
      showToast(course.is_published ? "已下架" : "已发布");
    } catch (err: any) {
      showToast("操作失败：" + (err?.message || ""));
    }
  };

  /* ---------- wizard save ---------- */
  const handleWizardSave = async (publish: boolean) => {
    if (!form.title.trim()) {
      setWizardError("请输入课程标题");
      return;
    }
    const totalPicks = wizardPicks.length + wizardChapters.reduce((s, ch) => s + ch.assets.length, 0);
    if (totalPicks === 0) {
      setWizardError("请从素材库中选择至少一个内容单元");
      return;
    }

    try {
      setSaving(true);
      setWizardError("");

      const now = new Date().toISOString();
      const coursePayload = {
        title: form.title,
        subtitle: form.subtitle || null,
        cover_image: form.cover_image || null,
        description: form.description || null,
        column_id: form.column_id || null,
        price: form.price,
        member_price: form.member_price || null,
        member_level_required: form.member_level_required || 0,
        is_published: publish,
        is_featured: form.is_featured,
        sort_order: form.sort_order || 0,
        updated_at: now,
      };

      let courseId: number;

      if (editingId) {
        const { error: updErr } = await supabase.from("courses").update(coursePayload).eq("id", editingId);
        if (updErr) throw updErr;
        courseId = editingId;

        /* delete old links, chapters, lessons */
        await supabase.from("course_content_assets").delete().eq("course_id", courseId);
        await supabase.from("lessons").delete().eq("course_id", courseId);
        await supabase.from("chapters").delete().eq("course_id", courseId);
      } else {
        const { data: newData, error: insErr } = await supabase
          .from("courses")
          .insert({ ...coursePayload, created_at: now })
          .select("id")
          .single();
        if (insErr) throw insErr;
        courseId = newData!.id;
      }

      let globalSort = 1;

      /* create chapters & lessons */
      for (const chapter of wizardChapters) {
        if (chapter.assets.length === 0) continue;

        const { data: chapData, error: chapErr } = await supabase
          .from("chapters")
          .insert({
            course_id: courseId,
            title: chapter.name,
            sort_order: globalSort,
            created_at: now,
            updated_at: now,
          })
          .select("id")
          .single();
        if (chapErr) throw chapErr;
        const chapterId = chapData!.id;
        globalSort++;

        for (const pick of chapter.assets) {
          const a = pick.asset;
          const lessonType = a.asset_type === "text" ? "article" : a.asset_type === "audio" ? "audio" : "video";
          const durationMin = a.asset_type === "video" ? Math.round((a.video_duration || 0) / 60) : a.asset_type === "audio" ? Math.round((a.audio_duration || 0) / 60) : 15;

          await supabase.from("lessons").insert({
            chapter_id: chapterId,
            course_id: courseId,
            title: a.title,
            lesson_type: lessonType,
            video_url: a.video_url || null,
            audio_url: a.audio_url || null,
            content: a.content_text || null,
            duration_minutes: durationMin,
            is_free_preview: pick.is_free_trial,
            sort_order: globalSort,
            status: "active",
            created_at: now,
            updated_at: now,
          });
          globalSort++;

          /* also link via course_content_assets */
          await supabase.from("course_content_assets").insert({
            course_id: courseId,
            asset_id: pick.asset_id,
            sort_order: globalSort,
            is_free_trial: pick.is_free_trial,
            created_at: now,
          });
        }
      }

      /* ungrouped lessons */
      for (const pick of wizardPicks) {
        const a = pick.asset;
        const lessonType = a.asset_type === "text" ? "article" : a.asset_type === "audio" ? "audio" : "video";
        const durationMin = a.asset_type === "video" ? Math.round((a.video_duration || 0) / 60) : a.asset_type === "audio" ? Math.round((a.audio_duration || 0) / 60) : 15;

        await supabase.from("lessons").insert({
          chapter_id: null,
          course_id: courseId,
          title: a.title,
          lesson_type: lessonType,
          video_url: a.video_url || null,
          audio_url: a.audio_url || null,
          content: a.content_text || null,
          duration_minutes: durationMin,
          is_free_preview: pick.is_free_trial,
          sort_order: globalSort,
          status: "active",
          created_at: now,
          updated_at: now,
        });
        globalSort++;

        /* also link via course_content_assets */
        await supabase.from("course_content_assets").insert({
          course_id: courseId,
          asset_id: pick.asset_id,
          sort_order: globalSort,
          is_free_trial: pick.is_free_trial,
          created_at: now,
        });
      }

      setShowWizard(false);
      await loadData();
      showToast(publish ? "课程已发布" : "课程已保存为草稿");
    } catch (err: any) {
      setWizardError(err?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- detail view ---------- */
  const openDetailView = async (course: CourseRow) => {
    setViewingCourse(course);
    setViewAssetsLoading(true);
    try {
      /* load chapters */
      const { data: chaptersData } = await supabase
        .from("chapters")
        .select("id, title, sort_order")
        .eq("course_id", course.id)
        .order("sort_order");

      /* load lessons */
      const { data: lessonsData } = await supabase
        .from("lessons")
        .select("*")
        .eq("course_id", course.id)
        .order("sort_order");

      if (chaptersData && lessonsData) {
        const result: any[] = [];
        for (const ch of chaptersData) {
          const chapterLessons = lessonsData.filter((l: any) => l.chapter_id === ch.id);
          if (chapterLessons.length > 0) {
            result.push({ _type: "chapter", id: ch.id, title: ch.title, sort_order: ch.sort_order });
            chapterLessons.forEach((l: any) => {
              result.push({
                _type: "lesson",
                ...l,
                chapter_name: ch.title,
                asset_type: l.lesson_type === "article" ? "text" : l.lesson_type === "audio" ? "audio" : "video",
              });
            });
          }
        }
        const unassigned = lessonsData.filter((l: any) => !l.chapter_id || !chaptersData?.find((c: any) => c.id === l.chapter_id));
        unassigned.forEach((l: any) => {
          result.push({
            _type: "lesson",
            ...l,
            chapter_name: undefined,
            asset_type: l.lesson_type === "article" ? "text" : l.lesson_type === "audio" ? "audio" : "video",
          });
        });
        setViewAssets(result);
      } else {
        setViewAssets([]);
      }
    } catch {
      // ignore
    } finally {
      setViewAssetsLoading(false);
    }
  };

  const closeDetailView = () => {
    setViewingCourse(null);
    setViewAssets([]);
  };

  /* ---------- computed type display ---------- */
  const getTypeDisplay = (computedType?: string) => {
    const t = computedType || "text_only";
    return {
      label: TYPE_LABEL[t] || "未知",
      color: TYPE_COLORS[t] || "bg-background-200 text-foreground-500",
      icon: TYPE_ICONS[t] || "ri-question-line",
    };
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center h-full">
        <i className="ri-loader-4-line animate-spin text-2xl text-primary-500"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex flex-col items-center py-12">
          <p className="text-sm text-foreground-500 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium whitespace-nowrap"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  /* ======================== DETAIL VIEW ======================== */
  if (viewingCourse) {
    const c = viewingCourse;
    const td = getTypeDisplay(c.computed_type);
    return (
      <div className="p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={closeDetailView}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
          >
            <i className="ri-arrow-left-line"></i>
          </button>
          <div>
            <h1 className="text-xl font-heading font-bold text-foreground-950">{c.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${td.color}`}>
                <i className={`${td.icon} text-xs`}></i>
                {td.label}
              </span>
              <span className="text-xs text-foreground-400">
                {c.is_published ? "已发布" : "草稿"} · {c.asset_count || 0} 个素材
              </span>
            </div>
          </div>
          <div className="flex-1"></div>
          <button
            onClick={() => { closeDetailView(); openEdit(c); }}
            className="px-3 py-1.5 rounded-full border border-background-200/70 text-foreground-600 text-xs font-medium hover:bg-background-50 transition-all whitespace-nowrap"
          >
            <i className="ri-edit-line mr-1"></i>编辑
          </button>
        </div>

        {viewAssetsLoading ? (
          <div className="flex justify-center py-12">
            <i className="ri-loader-4-line animate-spin text-foreground-400"></i>
          </div>
        ) : viewAssets.length === 0 ? (
          <div className="text-center py-12 bg-background-50 rounded-xl border border-background-200/70">
            <p className="text-sm text-foreground-500">该课程尚未关联素材</p>
          </div>
        ) : (
          <div className="space-y-2">
            {viewAssets.map((item: any, idx: number) => {
              if (item._type === "chapter") {
                return (
                  <div key={`ch-${item.id}`} className="bg-background-100/70 rounded-lg px-4 py-2.5 flex items-center gap-2">
                    <i className="ri-folder-line text-foreground-500"></i>
                    <span className="text-sm font-medium text-foreground-800">{item.title}</span>
                  </div>
                );
              }
              const lessonNum = viewAssets.filter((v: any, i: number) => v._type === "lesson" && i <= idx).length;
              const at = TYPE_LABEL[item.asset_type === "text" ? "text_only" : item.asset_type === "audio" ? "audio_only" : "video_only"];
              return (
                <div
                  key={`ls-${item.id}`}
                  className="bg-background-50 rounded-lg border border-background-200/70 px-4 py-3 flex items-center gap-3"
                >
                  <span className="w-7 h-7 shrink-0 rounded-full bg-background-100 flex items-center justify-center text-xs font-medium text-foreground-500">
                    {lessonNum}
                  </span>
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-background-100 flex items-center justify-center">
                    <i className={`${TYPE_ICONS[item.asset_type === "text" ? "text_only" : item.asset_type === "audio" ? "audio_only" : "video_only"]} text-foreground-500`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground-800 truncate">{item.title}</p>
                    <p className="text-[10px] text-foreground-400">
                      {at}
                      {item.duration_minutes ? ` · ${item.duration_minutes} 分钟` : ""}
                    </p>
                  </div>
                  {item.is_free_preview && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent-100 text-accent-700 font-medium shrink-0">试看</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ======================== MAIN LIST ======================== */
  return (
    <div className="p-6 md:p-8">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-black text-foreground-900">课程管理</h1>
          <p className="mt-1 text-sm text-foreground-500">
            共 {filtered.length} 门课程
            {filterType !== "all" && ` · ${TYPE_LABEL[filterType] || filterType}`}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap"
        >
          <i className="ri-add-line mr-1.5"></i>新建课程
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center gap-1 bg-background-50 rounded-full border border-background-200/70 px-1 py-1">
          {[
            { value: "all", label: "全部类型" },
            { value: "text_only", label: "图文课" },
            { value: "audio_only", label: "音频课" },
            { value: "video_only", label: "视频课" },
            { value: "mixed", label: "混合课程" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterType(opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                filterType === opt.value
                  ? "bg-primary-500 text-white"
                  : "text-foreground-500 hover:text-foreground-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="w-px h-6 bg-background-200/70"></div>
        <div className="flex items-center gap-1 bg-background-50 rounded-full border border-background-200/70 px-1 py-1">
          {[
            { value: "all", label: "全部状态" },
            { value: "published", label: "已发布" },
            { value: "draft", label: "草稿" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                filterStatus === opt.value
                  ? "bg-accent-500 text-white"
                  : "text-foreground-500 hover:text-foreground-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">课程名称</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">类型</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">专栏</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">素材数</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">价格</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">状态</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">数据</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((course) => {
                const td = getTypeDisplay(course.computed_type);
                return (
                  <tr
                    key={course.id}
                    className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-foreground-400 text-xs">{course.sort_order}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-7 rounded overflow-hidden shrink-0 bg-background-100">
                          {course.cover_image ? (
                            <img src={course.cover_image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <i className="ri-image-line text-xs text-foreground-300"></i>
                            </div>
                          )}
                        </div>
                        <div>
                          <button
                            onClick={() => openDetailView(course)}
                            className="font-medium text-foreground-900 text-sm text-left hover:text-primary-500 transition-colors line-clamp-1"
                          >
                            {course.title}
                          </button>
                          <p className="text-[11px] text-foreground-400 line-clamp-1">{course.subtitle}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${td.color}`}>
                        <i className={`${td.icon} text-xs`}></i>
                        {td.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground-500">
                      {course.column_title || <span className="text-foreground-300">独立课程</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground-500">{course.asset_count || 0}</td>
                    <td className="px-4 py-3">
                      {course.price === 0 ? (
                        <span className="text-accent-600 text-xs font-medium">免费</span>
                      ) : (
                        <div>
                          <span className="text-foreground-800 text-xs font-medium">¥{course.price}</span>
                          {course.member_price && course.member_price < course.price && (
                            <span className="text-[10px] text-foreground-400 ml-1">/ 会员 ¥{course.member_price}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleTogglePublish(course)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all whitespace-nowrap ${
                          course.is_published
                            ? "bg-primary-100 text-primary-700 hover:bg-primary-200"
                            : "bg-background-200 text-foreground-500 hover:bg-background-300"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${course.is_published ? "bg-primary-500" : "bg-foreground-300"}`}></div>
                        {course.is_published ? "已发布" : "草稿"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground-400">
                      <span className="mr-2"><i className="ri-eye-line mr-0.5"></i>{course.view_count}</span>
                      <span><i className="ri-shopping-cart-line mr-0.5"></i>{course.sold_count}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openDetailView(course)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-accent-500 hover:bg-accent-50 transition-all"
                          title="查看内容"
                        >
                          <i className="ri-list-check-3"></i>
                        </button>
                        <button
                          onClick={() => openEdit(course)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                          title="编辑"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => handleCopy(course)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-accent-500 hover:bg-accent-50 transition-all"
                          title="复制"
                        >
                          <i className="ri-file-copy-line"></i>
                        </button>
                        <button
                          onClick={() => handleDelete(course)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all"
                          title="删除"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                        <Link
                          to={`/courses/${course.id}`}
                          target="_blank"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                          title="预览"
                        >
                          <i className="ri-external-link-line"></i>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-foreground-400">
            没有符合条件的课程
          </div>
        )}
      </div>

      {/* ======================== WIZARD MODAL ======================== */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowWizard(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-4">
            {/* Wizard Header */}
            <div className="sticky top-0 bg-background-50 border-b border-background-200/70 px-5 py-4 flex items-center justify-between z-10">
              <h2 className="font-heading font-semibold text-foreground-950">
                {editingId ? "编辑课程" : "新建课程"}
              </h2>
              <button
                onClick={() => setShowWizard(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>

            {/* Step Indicator */}
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-center gap-2">
                {["基本信息", "素材编排", "价格权限", "确认完成"].map((label, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (idx + 1 < wizardStep) setWizardStep(idx + 1);
                      }}
                      className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center transition-all whitespace-nowrap ${
                        wizardStep === idx + 1
                          ? "bg-primary-500 text-white"
                          : wizardStep > idx + 1
                          ? "bg-primary-100 text-primary-600"
                          : "bg-background-100 text-foreground-400"
                      }`}
                    >
                      {wizardStep > idx + 1 ? <i className="ri-check-line text-sm"></i> : idx + 1}
                    </button>
                    <span
                      className={`text-[11px] font-medium whitespace-nowrap ${
                        wizardStep === idx + 1 ? "text-foreground-900" : "text-foreground-400"
                      }`}
                    >
                      {label}
                    </span>
                    {idx < 3 && <div className="w-6 h-px bg-background-200/70"></div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Error */}
            {wizardError && (
              <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">
                {wizardError}
              </div>
            )}

            {/* Step Content */}
            <div className="p-5">
              {/* ---- Step 1: Basic Info ---- */}
              {wizardStep === 1 && (
                <div className="space-y-4 max-w-lg">
                  <p className="text-sm text-foreground-500 mb-2">
                    填写课程的基本信息。课程类型将由所引用的素材自动决定。
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">
                      课程标题 <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm text-foreground-800 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-all"
                      placeholder="例如：引力场·个人IP打造入门"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">副标题</label>
                    <input
                      type="text"
                      value={form.subtitle}
                      onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                      placeholder="一句话描述课程特色"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">封面图片 URL</label>
                    <input
                      type="text"
                      value={form.cover_image}
                      onChange={(e) => setForm((f) => ({ ...f, cover_image: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">课程简介</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm h-24 resize-none"
                      placeholder="详细描述课程内容与特色..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">所属专栏</label>
                    <select
                      value={form.column_id ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, column_id: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                    >
                      <option value="">独立课程（不属于任何专栏）</option>
                      {columns
                        .filter((c) => c.is_published)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground-500 mb-1">排序权重</label>
                      <input
                        type="number"
                        value={form.sort_order}
                        onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                        min="0"
                      />
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.is_featured}
                          onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))}
                          className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-400"
                        />
                        <span className="text-xs text-foreground-600">推荐课程</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setWizardStep(2)}
                      className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap"
                    >
                      下一步：选择素材
                    </button>
                  </div>
                </div>
              )}

              {/* ---- Step 2: Asset Picker ---- */}
              {wizardStep === 2 && (
                <AssetPicker
                  existingPicks={wizardPicks}
                  existingChapters={wizardChapters}
                  onSave={handleAssetPickerSave}
                  onCancel={() => setWizardStep(1)}
                />
              )}

              {/* ---- Step 3: Price & Permissions ---- */}
              {wizardStep === 3 && (
                <div className="space-y-4 max-w-lg">
                  <div className="bg-background-50 border border-background-200/70 rounded-lg p-3">
                    <p className="text-sm text-foreground-500">
                      已编排 <strong className="text-foreground-800">{wizardPicks.length + wizardChapters.reduce((s, ch) => s + ch.assets.length, 0)}</strong> 个素材
                      {wizardChapters.length > 0 && (
                        <span> · <strong className="text-foreground-800">{wizardChapters.length}</strong> 个章节</span>
                      )}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground-500 mb-1">
                        定价 (¥) <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="number"
                        value={form.price}
                        onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                        min="0"
                        step="0.01"
                      />
                      {form.price === 0 && (
                        <p className="text-[11px] text-accent-500 mt-1">此课程将免费开放</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-500 mb-1">会员价 (¥)</label>
                      <input
                        type="number"
                        value={form.member_price ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            member_price: e.target.value ? Number(e.target.value) : null,
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                        min="0"
                        step="0.01"
                        placeholder="留空等于原价"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-500 mb-1">最低会员等级</label>
                      <select
                        value={form.member_level_required}
                        onChange={(e) => setForm((f) => ({ ...f, member_level_required: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                      >
                        <option value={0}>无限制</option>
                        <option value={1}>会员</option>
                        <option value={2}>黄金会员</option>
                        <option value={3}>VIP会员</option>
                        <option value={4}>SVIP会员</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-between pt-2">
                    <button
                      onClick={() => setWizardStep(2)}
                      className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap"
                    >
                      上一步
                    </button>
                    <button
                      onClick={() => setWizardStep(4)}
                      className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap"
                    >
                      下一步：确认
                    </button>
                  </div>
                </div>
              )}

              {/* ---- Step 4: Confirm ---- */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div className="bg-background-50 border border-background-200/70 rounded-lg p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-foreground-900">确认课程信息</h3>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-foreground-400">标题：</span>
                        <span className="font-medium text-foreground-800">{form.title}</span>
                      </div>
                      <div>
                        <span className="text-foreground-400">价格：</span>
                        <span className="font-medium text-foreground-800">
                          {form.price === 0 ? "免费" : `¥${form.price}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-foreground-400">会员价：</span>
                        <span className="font-medium text-foreground-800">
                          {form.member_price ? `¥${form.member_price}` : "无"}
                        </span>
                      </div>
                      <div>
                        <span className="text-foreground-400">引用素材：</span>
                        <span className="font-medium text-foreground-800">{wizardPicks.length + wizardChapters.reduce((s, ch) => s + ch.assets.length, 0)} 个</span>
                      </div>
                      <div>
                        <span className="text-foreground-400">章节数：</span>
                        <span className="font-medium text-foreground-800">{wizardChapters.length || "无"}</span>
                      </div>
                      <div>
                        <span className="text-foreground-400">专栏：</span>
                        <span className="font-medium text-foreground-800">
                          {form.column_id
                            ? columns.find((c) => c.id === form.column_id)?.title || `ID:${form.column_id}`
                            : "独立课程"}
                        </span>
                      </div>
                    </div>

                    {wizardChapters.length > 0 && wizardChapters.map((chapter, ci) => (
                      <div key={chapter.tempId} className="pt-2 border-t border-background-200/70">
                        <p className="text-[11px] font-medium text-foreground-700 mb-1.5">
                          <i className="ri-folder-line mr-1"></i>{chapter.name}
                        </p>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {chapter.assets.map((p, i) => (
                            <div key={p.asset_id} className="flex items-center gap-2 text-xs text-foreground-600">
                              <span className="w-4 text-center text-foreground-400">{i + 1}.</span>
                              <i className={`${TYPE_ICONS[p.asset.asset_type === "text" ? "text_only" : p.asset.asset_type === "audio" ? "audio_only" : "video_only"]} text-[10px]`}></i>
                              <span className="truncate">{p.asset.title}</span>
                              {p.is_free_trial && (
                                <span className="text-[10px] text-accent-600">[试看]</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {wizardPicks.length > 0 && (
                      <div className="pt-2 border-t border-background-200/70">
                        <p className="text-[11px] text-foreground-400 mb-2">未分组素材：</p>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {wizardPicks.map((p, i) => (
                            <div key={p.asset_id} className="flex items-center gap-2 text-xs text-foreground-600">
                              <span className="w-4 text-center">{i + 1}.</span>
                              <i className={`${TYPE_ICONS[p.asset.asset_type === "text" ? "text_only" : p.asset.asset_type === "audio" ? "audio_only" : "video_only"]} text-[10px]`}></i>
                              <span className="truncate">{p.asset.title}</span>
                              {p.is_free_trial && (
                                <span className="text-[10px] text-accent-600">[试看]</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between pt-2">
                    <button
                      onClick={() => setWizardStep(3)}
                      className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap"
                    >
                      上一步
                    </button>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleWizardSave(false)}
                        disabled={saving}
                        className="px-5 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-semibold hover:bg-background-50 disabled:opacity-50 transition-all whitespace-nowrap"
                      >
                        {saving ? "保存中..." : "保存草稿"}
                      </button>
                      <button
                        onClick={() => handleWizardSave(true)}
                        disabled={saving || !form.title.trim()}
                        className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap"
                      >
                        {saving ? "发布中..." : "发布上架"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}