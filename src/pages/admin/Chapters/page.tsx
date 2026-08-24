import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface ChapterRow {
  id: number;
  name: string;
  category_id: number | null;
  category_name?: string;
  sort_order: number;
  description: string | null;
  asset_count?: number;
  created_at: string;
}

interface CategoryOption {
  id: number;
  name: string;
}

export default function ChaptersAdmin() {
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", category_id: "", sort_order: 0, description: "" });
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChapterRow | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      // Fetch categories, chapters, and asset chapter_ids all in parallel (3 requests total)
      const [catRes, chapRes, assetRes] = await Promise.all([
        supabase.from("content_categories").select("id, name").is("deleted_at", null).order("sort_order"),
        supabase.from("content_chapters").select("*").is("deleted_at", null).order("sort_order"),
        supabase.from("content_assets").select("chapter_id").is("deleted_at", null),
      ]);

      if (catRes.error) throw catRes.error;
      if (chapRes.error) throw chapRes.error;
      if (assetRes.error) throw assetRes.error;

      const catMap = new Map<number, string>();
      (catRes.data || []).forEach((c: any) => catMap.set(c.id, c.name));
      setCategories(catRes.data || []);

      // Count assets per chapter in memory
      const countMap = new Map<number, number>();
      (assetRes.data || []).forEach((a: any) => {
        if (a.chapter_id != null) {
          countMap.set(a.chapter_id, (countMap.get(a.chapter_id) || 0) + 1);
        }
      });

      const rows: ChapterRow[] = (chapRes.data || []).map((r: any) => ({
        ...r,
        category_name: r.category_id ? catMap.get(r.category_id) : undefined,
        asset_count: countMap.get(r.id) || 0,
      }));

      setChapters(rows);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "加载失败，请检查网络连接后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = chapters.filter((ch) => {
    if (filterCategory === "all") return true;
    if (filterCategory === "none") return ch.category_id === null;
    return ch.category_id === Number(filterCategory);
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", category_id: "", sort_order: chapters.length + 1, description: "" });
    setShowModal(true);
  };

  const openEdit = (chap: ChapterRow) => {
    setEditingId(chap.id);
    setForm({ name: chap.name, category_id: chap.category_id ? String(chap.category_id) : "", sort_order: chap.sort_order, description: chap.description || "" });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      setSaveLoading(true);
      const payload = {
        name: form.name,
        category_id: form.category_id ? Number(form.category_id) : null,
        sort_order: form.sort_order,
        description: form.description || null,
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        await supabase.from("content_chapters").update(payload).eq("id", editingId);
      } else {
        await supabase.from("content_chapters").insert({ ...payload, created_at: new Date().toISOString() });
      }
      setShowModal(false);
      await loadData();
      showToast(editingId ? "章节已更新" : "章节已创建");
    } catch (err: any) {
      showToast("保存失败：" + (err?.message || ""));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteRequest = (chap: ChapterRow) => setDeleteTarget(chap);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      const { count } = await supabase
        .from("content_assets")
        .select("id", { count: "exact", head: true })
        .eq("chapter_id", deleteTarget.id)
        .is("deleted_at", null);

      if (count && count > 0) {
        showToast(`该章节下存在 ${count} 个内容素材，请先移出或删除后再删除章节`);
        setDeleteTarget(null);
        return;
      }

      await supabase.from("content_chapters").update({ deleted_at: new Date().toISOString() }).eq("id", deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
      showToast("章节已删除");
    } catch (err: any) {
      showToast("删除失败：" + (err?.message || ""));
    }
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

  return (
    <div className="p-6 md:p-8">
      {toast && (
        <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm shadow-lg">{toast}</div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-black text-foreground-900">章节管理</h1>
          <p className="mt-1 text-sm text-foreground-500">共 {filtered.length} 个章节</p>
        </div>
        <button onClick={openCreate} className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap">
          <i className="ri-add-line mr-1.5"></i>创建章节
        </button>
      </div>

      {/* Category Filter */}
      {categories.length > 0 && (
        <div className="flex items-center gap-1 bg-white rounded-full border border-background-200/70 px-1 py-1 w-fit mb-5">
          <button onClick={() => setFilterCategory("all")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${filterCategory === "all" ? "bg-primary-500 text-white" : "text-foreground-500 hover:text-foreground-800"}`}>
            全部章节
          </button>
          <button onClick={() => setFilterCategory("none")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${filterCategory === "none" ? "bg-primary-500 text-white" : "text-foreground-500 hover:text-foreground-800"}`}>
            未分类
          </button>
          {categories.map((cat) => (
            <button key={cat.id} onClick={() => setFilterCategory(String(cat.id))}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${filterCategory === String(cat.id) ? "bg-primary-500 text-white" : "text-foreground-500 hover:text-foreground-800"}`}>
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Chapters Table */}
      <div className="bg-white rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">排序</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">章节名称</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">所属分类</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">素材数</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">描述</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ch) => (
                <tr key={ch.id} className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors">
                  <td className="px-4 py-3 text-xs text-foreground-400">{ch.sort_order}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground-900 text-sm">{ch.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    {ch.category_name ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-secondary-100 text-secondary-700">
                        {ch.category_name}
                      </span>
                    ) : (
                      <span className="text-xs text-foreground-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground-500">{ch.asset_count}</td>
                  <td className="px-4 py-3 text-xs text-foreground-400 max-w-[200px] truncate">{ch.description || "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(ch)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all" title="编辑">
                        <i className="ri-edit-line"></i>
                      </button>
                      <button onClick={() => handleDeleteRequest(ch)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all" title="删除">
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-background-100 flex items-center justify-center mx-auto mb-4">
              <i className="ri-book-open-line text-2xl text-foreground-300"></i>
            </div>
            <p className="text-sm text-foreground-400">还没有章节，点击上方按钮创建第一个</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-white rounded-xl border border-background-200/70 w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-background-200/70 flex items-center justify-between">
              <h2 className="font-display font-bold text-foreground-900">{editingId ? "编辑章节" : "创建章节"}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all">
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">章节名称 <span className="text-red-400">*</span></label>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm text-foreground-800 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-all" placeholder="如：第一章" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">所属分类</label>
                <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm text-foreground-800 focus:outline-none focus:border-primary-400">
                  <option value="">无分类</option>
                  {categories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">描述</label>
                <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="简短描述章节内容" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">排序权重</label>
                <input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-background-200/70 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">取消</button>
              <button onClick={handleSave} disabled={saveLoading || !form.name.trim()} className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap">
                {saveLoading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)}></div>
          <div className="relative bg-white rounded-xl border border-background-200/70 w-full max-w-sm mx-4 p-6">
            <h3 className="font-display font-bold text-foreground-900 mb-2">确认删除</h3>
            <p className="text-sm text-foreground-500 mb-6">确定要删除章节「{deleteTarget.name}」吗？删除后无法恢复。</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">取消</button>
              <button onClick={handleDeleteConfirm} className="px-5 py-2 rounded-full bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-all whitespace-nowrap">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}