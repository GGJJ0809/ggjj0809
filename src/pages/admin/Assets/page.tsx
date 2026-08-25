import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import ImageUploader from "@/components/feature/ImageUploader";
import TextareaImageInserter from "./components/TextareaImageInserter";

/* ---------- types ---------- */
interface AssetRow {
  id: number;
  asset_type: "text" | "audio" | "video";
  title: string;
  category_id: number | null;
  chapter_id: number | null;
  category_name?: string;
  chapter_name?: string;
  sort_order: number;
  content_text: string | null;
  audio_url: string | null;
  audio_duration: number | null;
  audio_size: number | null;
  video_url: string | null;
  video_duration: number | null;
  video_size: number | null;
  video_cover: string | null;
  is_free_preview: boolean;
  status: "draft" | "published" | "archived";
  created_at: string;
  updated_at: string;
}

interface CategoryOption { id: number; name: string; }
interface ChapterOption { id: number; name: string; category_id: number | null; }

interface AssetForm {
  asset_type: "text" | "audio" | "video";
  title: string;
  category_id: string;
  chapter_id: string;
  content_text: string;
  audio_url: string;
  audio_duration: number;
  video_url: string;
  video_duration: number;
  video_cover: string;
  is_free_preview: boolean;
  status: "draft" | "published";
}

const EMPTY_FORM: AssetForm = {
  asset_type: "text", title: "", category_id: "", chapter_id: "",
  content_text: "", audio_url: "", audio_duration: 0,
  video_url: "", video_duration: 0, video_cover: "",
  is_free_preview: false, status: "published",
};

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  text: { label: "图文", icon: "ri-article-line", color: "bg-secondary-100 text-secondary-700" },
  audio: { label: "音频", icon: "ri-music-line", color: "bg-primary-100 text-primary-700" },
  video: { label: "视频", icon: "ri-play-circle-line", color: "bg-primary-100 text-primary-700" },
};

const STATUS_LABEL: Record<string, string> = { draft: "草稿", published: "已发布", archived: "已归档" };

export default function AssetsAdmin() {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [chapters, setChapters] = useState<ChapterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [filterType, setFilterType] = useState<string>("all");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("all");
  const [filterChapterId, setFilterChapterId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AssetForm>(EMPTY_FORM);
  const [saveLoading, setSaveLoading] = useState(false);
  const [detailAsset, setDetailAsset] = useState<AssetRow | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const loadData = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const [catRes, chapRes, assetRes] = await Promise.all([
        supabase.from("content_categories").select("id, name").is("deleted_at", null).order("sort_order"),
        supabase.from("content_chapters").select("id, name, category_id").is("deleted_at", null).order("sort_order"),
        supabase.from("content_assets").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      ]);
      if (catRes.error) throw catRes.error;
      if (chapRes.error) throw chapRes.error;
      if (assetRes.error) throw assetRes.error;

      const catMap = new Map<number, string>();
      (catRes.data || []).forEach((c: any) => catMap.set(c.id, c.name));
      setCategories(catRes.data || []);

      const chapMap = new Map<number, string>();
      (chapRes.data || []).forEach((c: any) => chapMap.set(c.id, c.name));
      setChapters(chapRes.data || []);

      const rows: AssetRow[] = (assetRes.data || []).map((r: any) => ({
        ...r, asset_type: r.asset_type as "text" | "audio" | "video",
        status: r.status as "draft" | "published" | "archived",
        category_name: r.category_id ? catMap.get(r.category_id) : undefined,
        chapter_name: r.chapter_id ? chapMap.get(r.chapter_id) : undefined,
      }));
      setAssets(rows);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "加载失败");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = assets.filter((a) => {
    if (filterType !== "all" && a.asset_type !== filterType) return false;
    if (filterCategoryId !== "all") {
      if (filterCategoryId === "none") { if (a.category_id !== null) return false; }
      else if (a.category_id !== Number(filterCategoryId)) return false;
    }
    if (filterChapterId !== "all") {
      if (filterChapterId === "none") { if (a.chapter_id !== null) return false; }
      else if (a.chapter_id !== Number(filterChapterId)) return false;
    }
    if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const filteredChapters = filterCategoryId === "all" || filterCategoryId === "none"
    ? chapters : chapters.filter((ch) => ch.category_id === null || ch.category_id === Number(filterCategoryId));

  const openCreate = (type: "text" | "audio" | "video") => {
    setEditingId(null); setForm({ ...EMPTY_FORM, asset_type: type }); setShowModal(true);
  };

  const openEdit = (asset: AssetRow) => {
    setEditingId(asset.id);
    setForm({
      asset_type: asset.asset_type, title: asset.title,
      category_id: asset.category_id ? String(asset.category_id) : "",
      chapter_id: asset.chapter_id ? String(asset.chapter_id) : "",
      content_text: asset.content_text || "", audio_url: asset.audio_url || "",
      audio_duration: asset.audio_duration || 0, video_url: asset.video_url || "",
      video_duration: asset.video_duration || 0, video_cover: asset.video_cover || "",
      is_free_preview: asset.is_free_preview || false,
      status: asset.status === "archived" ? "published" : asset.status,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    try {
      setSaveLoading(true);
      const now = new Date().toISOString();
      const payload: Record<string, any> = {
        asset_type: form.asset_type, title: form.title,
        category_id: form.category_id ? Number(form.category_id) : null,
        chapter_id: form.chapter_id ? Number(form.chapter_id) : null,
        is_free_preview: form.is_free_preview, status: form.status, updated_at: now,
      };
      if (form.asset_type === "text") payload.content_text = form.content_text || null;
      else if (form.asset_type === "audio") {
        payload.audio_url = form.audio_url || null; payload.audio_duration = form.audio_duration || 0;
      } else {
        payload.video_url = form.video_url || null; payload.video_duration = form.video_duration || 0;
        payload.video_cover = form.video_cover || null;
      }
      if (editingId) {
        const { error: updErr } = await supabase.from("content_assets").update(payload).eq("id", editingId);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from("content_assets").insert({ ...payload, created_at: now });
        if (insErr) throw insErr;
      }
      setShowModal(false); await loadData();
      showToast(editingId ? "素材已更新" : "素材已创建");
    } catch (err: any) { showToast("保存失败：" + (err?.message || "")); }
    finally { setSaveLoading(false); }
  };

  const handleDelete = async (asset: AssetRow) => {
    if (!confirm(`确定要删除素材「${asset.title}」吗？`)) return;
    try {
      await supabase.from("content_assets").update({ deleted_at: new Date().toISOString() }).eq("id", asset.id);
      await loadData(); showToast("素材已删除");
    } catch (err: any) { showToast("删除失败：" + (err?.message || "")); }
  };

  const handleStatusChange = async (asset: AssetRow, newStatus: "draft" | "published" | "archived") => {
    try {
      await supabase.from("content_assets").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", asset.id);
      await loadData(); showToast(`已${STATUS_LABEL[newStatus]}`);
    } catch (err: any) { showToast("操作失败：" + (err?.message || "")); }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const m = Math.floor(seconds / 60); const s = seconds % 60;
    return `${m}分${s}秒`;
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
          <button onClick={loadData} className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold whitespace-nowrap hover:bg-primary-600 transition-colors">重试</button>
        </div>
      </div>
    );
  }

  /* ===== DETAIL VIEW ===== */
  if (detailAsset) {
    const a = detailAsset;
    return (
      <div className="p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setDetailAsset(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all">
            <i className="ri-arrow-left-line"></i>
          </button>
          <div>
            <h1 className="text-xl font-display font-bold text-foreground-900">{a.title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${TYPE_CONFIG[a.asset_type].color}`}>
                <i className={`${TYPE_CONFIG[a.asset_type].icon} text-xs`}></i>{TYPE_CONFIG[a.asset_type].label}
              </span>
              <span className="text-xs text-foreground-400">{STATUS_LABEL[a.status]}</span>
              {a.category_name && <span className="text-xs text-foreground-400">· {a.category_name}</span>}
              {a.chapter_name && <span className="text-xs text-foreground-400">· {a.chapter_name}</span>}
              {a.is_free_preview && <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary-100 text-primary-700 font-medium">试看</span>}
            </div>
          </div>
          <div className="flex-1"></div>
          <button onClick={() => { setDetailAsset(null); openEdit(a); }} className="px-3 py-1.5 rounded-full border border-background-200/70 text-foreground-600 text-xs font-medium hover:bg-background-50 transition-all whitespace-nowrap">
            <i className="ri-edit-line mr-1"></i>编辑
          </button>
        </div>
        <div className="bg-white rounded-xl border border-background-200/70 p-6">
          {a.asset_type === "text" && (
            <div className="prose prose-sm max-w-none text-foreground-700 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: a.content_text || "（无内容）" }} />
          )}
          {a.asset_type === "audio" && (
            <div className="space-y-3">
              {a.audio_url ? <audio controls className="w-full"><source src={a.audio_url} /></audio> : (
                <div className="flex items-center justify-center py-12 text-foreground-400 text-sm"><i className="ri-music-line mr-2"></i>音频文件未上传</div>
              )}
              {a.audio_duration && <p className="text-xs text-foreground-500">时长：{formatDuration(a.audio_duration)}</p>}
            </div>
          )}
          {a.asset_type === "video" && (
            <div className="space-y-3">
              {a.video_url ? <video controls className="w-full rounded-lg" poster={a.video_cover || undefined}><source src={a.video_url} /></video> : (
                <div className="flex items-center justify-center py-16 text-foreground-400 text-sm bg-background-100 rounded-lg"><i className="ri-play-circle-line mr-2"></i>视频文件未上传</div>
              )}
              {a.video_duration && <p className="text-xs text-foreground-500">时长：{formatDuration(a.video_duration)}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ===== MAIN LIST ===== */
  return (
    <div className="p-6 md:p-8">
      {toast && <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm shadow-lg">{toast}</div>}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-black text-foreground-900">内容素材库</h1>
          <p className="mt-1 text-sm text-foreground-500">共 {filtered.length} 条素材{filterType !== "all" && ` · ${TYPE_CONFIG[filterType]?.label || filterType}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => openCreate("text")} className="px-4 py-2 rounded-full bg-accent-500 text-white text-sm font-semibold hover:bg-secondary-600 transition-all whitespace-nowrap">
            <i className="ri-article-line mr-1.5"></i>上传图文
          </button>
          <button onClick={() => openCreate("audio")} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-accent-600 transition-all whitespace-nowrap">
            <i className="ri-music-line mr-1.5"></i>上传音频
          </button>
          <button onClick={() => openCreate("video")} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap">
            <i className="ri-play-circle-line mr-1.5"></i>上传视频
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3 mb-5">
        <div className="relative max-w-sm">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索素材标题..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-background-200/70 bg-white text-sm text-foreground-800 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-all" />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-full border border-background-200/70 px-1 py-1 w-fit">
          {[{ value: "all", label: "全部类型" }, { value: "text", label: "图文" }, { value: "audio", label: "音频" }, { value: "video", label: "视频" }].map((opt) => (
            <button key={opt.value} onClick={() => setFilterType(opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${filterType === opt.value ? "bg-primary-500 text-white" : "text-foreground-500 hover:text-foreground-800"}`}>{opt.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterCategoryId} onChange={(e) => { setFilterCategoryId(e.target.value); setFilterChapterId("all"); }}
            className="px-3 py-1.5 rounded-full border border-background-200/70 bg-white text-xs text-foreground-600 focus:outline-none focus:border-primary-400">
            <option value="all">全部分类</option><option value="none">未分类</option>
            {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <select value={filterChapterId} onChange={(e) => setFilterChapterId(e.target.value)}
            className="px-3 py-1.5 rounded-full border border-background-200/70 bg-white text-xs text-foreground-600 focus:outline-none focus:border-primary-400">
            <option value="all">全部章节</option><option value="none">未分配</option>
            {filteredChapters.map((ch) => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
          </select>
          {(filterCategoryId !== "all" || filterChapterId !== "all") && (
            <button onClick={() => { setFilterCategoryId("all"); setFilterChapterId("all"); }} className="text-[11px] text-foreground-400 hover:text-foreground-600 whitespace-nowrap">清除筛选</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">类型</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">标题</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">分类</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">章节</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">时长</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">试看</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">状态</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${TYPE_CONFIG[a.asset_type].color}`}>
                      <i className={`${TYPE_CONFIG[a.asset_type].icon} text-xs`}></i>{TYPE_CONFIG[a.asset_type].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setDetailAsset(a)} className="font-medium text-foreground-900 text-sm text-left hover:text-primary-500 transition-colors line-clamp-1 max-w-[300px]">{a.title}</button>
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground-500">{a.category_name || <span className="text-foreground-300">-</span>}</td>
                  <td className="px-4 py-3 text-xs text-foreground-500">{a.chapter_name || <span className="text-foreground-300">-</span>}</td>
                  <td className="px-4 py-3 text-xs text-foreground-400">
                    {formatDuration(a.asset_type === "video" ? a.video_duration : a.asset_type === "audio" ? a.audio_duration : null) || "-"}
                  </td>
                  <td className="px-4 py-3">
                    {a.is_free_preview ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary-100 text-primary-700 font-medium">可试看</span> : <span className="text-[11px] text-foreground-300">-</span>}
                  </td>
                  <td className="px-4 py-3">
                    <select value={a.status} onChange={(e) => handleStatusChange(a, e.target.value as any)}
                      className={`px-2 py-1 rounded-full text-[11px] font-medium border-0 outline-none cursor-pointer ${a.status === "published" ? "bg-primary-100 text-primary-700" : a.status === "draft" ? "bg-background-200 text-foreground-500" : "bg-amber-100 text-amber-700"}`}>
                      <option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setDetailAsset(a)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all" title="查看"><i className="ri-eye-line"></i></button>
                      <button onClick={() => openEdit(a)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all" title="编辑"><i className="ri-edit-line"></i></button>
                      <button onClick={() => handleDelete(a)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all" title="删除"><i className="ri-delete-bin-line"></i></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-background-100 flex items-center justify-center mx-auto mb-4"><i className="ri-inbox-line text-2xl text-foreground-300"></i></div>
            <p className="text-sm text-foreground-400">{searchQuery || filterType !== "all" || filterCategoryId !== "all" || filterChapterId !== "all" ? "没有符合条件的素材" : "素材库为空，点击上方按钮上传第一条内容"}</p>
          </div>
        )}
      </div>

      {/* ===== MODAL ===== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-white rounded-xl border border-background-200/70 w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
            <div className="sticky top-0 bg-white border-b border-background-200/70 px-5 py-4 flex items-center justify-between z-10">
              <h2 className="font-display font-bold text-foreground-900">{editingId ? "编辑素材" : `上传${TYPE_CONFIG[form.asset_type].label}`}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"><i className="ri-close-line"></i></button>
            </div>
            <div className="p-5 space-y-4">
              {!editingId && (
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-2">素材类型</label>
                  <div className="flex items-center gap-2">
                    {(["text", "audio", "video"] as const).map((t) => (
                      <button key={t} onClick={() => setForm((f) => ({ ...f, asset_type: t }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${form.asset_type === t ? "bg-primary-500 text-white" : "bg-background-100 text-foreground-500 hover:text-foreground-800"}`}>
                        <i className={`${TYPE_CONFIG[t].icon} text-sm`}></i>{TYPE_CONFIG[t].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">标题 <span className="text-red-400">*</span></label>
                <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm text-foreground-800 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-all" placeholder="例如：第一章 引力场基础认知" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">所属分类 <span className="text-red-400">*</span></label>
                  <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm text-foreground-800 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400">
                    <option value="">-- 请选择分类 --</option>
                    {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">所属章节</label>
                  <select value={form.chapter_id} onChange={(e) => setForm((f) => ({ ...f, chapter_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm text-foreground-800 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400">
                    <option value="">-- 不分配（稍后在课程里创建） --</option>
                    {(form.category_id ? chapters.filter((ch) => ch.category_id === null || ch.category_id === Number(form.category_id)) : chapters).map((ch) => (
                      <option key={ch.id} value={ch.id}>{ch.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {form.asset_type === "text" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">正文（HTML 格式）</label>
                    <TextareaImageInserter
                      value={form.content_text}
                      onChange={(val) => setForm((f) => ({ ...f, content_text: val }))}
                    />
                  </div>
                </div>
              )}
              {form.asset_type === "audio" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">音频文件 URL</label>
                    <input type="text" value={form.audio_url} onChange={(e) => setForm((f) => ({ ...f, audio_url: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="https://..." />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">时长（秒）</label>
                    <input type="number" value={form.audio_duration} onChange={(e) => setForm((f) => ({ ...f, audio_duration: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" placeholder="如：1800（30分钟）" />
                  </div>
                </div>
              )}
              {form.asset_type === "video" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">视频文件 URL</label>
                    <input type="text" value={form.video_url} onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="https://..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground-500 mb-1">时长（秒）</label>
                      <input type="number" value={form.video_duration} onChange={(e) => setForm((f) => ({ ...f, video_duration: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" placeholder="如：3600（60分钟）" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-500 mb-1">视频封面</label>
                      <ImageUploader
                        value={form.video_cover}
                        onChange={(url) => setForm((f) => ({ ...f, video_cover: url }))}
                        label=""
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_free_preview} onChange={(e) => setForm((f) => ({ ...f, is_free_preview: e.target.checked }))}
                    className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-400" />
                  <span className="text-sm text-foreground-700">设为试看素材</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground-500">状态：</span>
                  <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "draft" | "published" }))}
                    className="px-2 py-1 rounded-full text-xs font-medium bg-background-100 text-foreground-600 border-0 outline-none cursor-pointer">
                    <option value="draft">草稿</option><option value="published">已发布</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-background-200/70 px-5 py-4 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">取消</button>
              <button onClick={handleSave} disabled={saveLoading || !form.title.trim()}
                className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap">
                {saveLoading ? "保存中..." : editingId ? "保存修改" : "确认上传"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}