import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface CategoryRow {
  id: number;
  name: string;
  sort_order: number;
  icon: string | null;
  description: string | null;
  asset_count?: number;
  created_at: string;
}

export default function CategoriesAdmin() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", sort_order: 0, icon: "", description: "" });
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      // Fetch categories and all asset category_ids in parallel (2 requests instead of N+1)
      const [catRes, assetRes] = await Promise.all([
        supabase.from("content_categories").select("*").is("deleted_at", null).order("sort_order"),
        supabase.from("content_assets").select("category_id").is("deleted_at", null),
      ]);

      if (catRes.error) throw catRes.error;
      if (assetRes.error) throw assetRes.error;

      // Count assets per category in memory (single pass, no extra network requests)
      const countMap = new Map<number, number>();
      (assetRes.data || []).forEach((a: any) => {
        if (a.category_id != null) {
          countMap.set(a.category_id, (countMap.get(a.category_id) || 0) + 1);
        }
      });

      const rows: CategoryRow[] = (catRes.data || []).map((r: any) => ({
        ...r,
        asset_count: countMap.get(r.id) || 0,
      }));

      setCategories(rows);
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

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", sort_order: categories.length + 1, icon: "", description: "" });
    setShowModal(true);
  };

  const openEdit = (cat: CategoryRow) => {
    setEditingId(cat.id);
    setForm({ name: cat.name, sort_order: cat.sort_order, icon: cat.icon || "", description: cat.description || "" });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      setSaveLoading(true);
      const payload = { name: form.name, sort_order: form.sort_order, icon: form.icon || null, description: form.description || null, updated_at: new Date().toISOString() };
      if (editingId) {
        await supabase.from("content_categories").update(payload).eq("id", editingId);
      } else {
        await supabase.from("content_categories").insert({ ...payload, created_at: new Date().toISOString() });
      }
      setShowModal(false);
      await loadData();
      showToast(editingId ? "分类已更新" : "分类已创建");
    } catch (err: any) {
      showToast("保存失败：" + (err?.message || ""));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteRequest = (cat: CategoryRow) => setDeleteTarget(cat);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      const { count } = await supabase
        .from("content_assets")
        .select("id", { count: "exact", head: true })
        .eq("category_id", deleteTarget.id)
        .is("deleted_at", null);

      if (count && count > 0) {
        showToast(`该分类下存在 ${count} 个内容素材，请先移出或删除后再删除分类`);
        setDeleteTarget(null);
        return;
      }

      await supabase.from("content_categories").update({ deleted_at: new Date().toISOString() }).eq("id", deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
      showToast("分类已删除");
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

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-black text-foreground-900">分类管理</h1>
          <p className="mt-1 text-sm text-foreground-500">共 {categories.length} 个分类</p>
        </div>
        <button onClick={openCreate} className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap">
          <i className="ri-add-line mr-1.5"></i>创建分类
        </button>
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat) => (
          <div key={cat.id} className="bg-white rounded-xl border border-background-200/70 p-5 flex flex-col hover:border-primary-200 transition-all hover:shadow-md">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                <i className={`${cat.icon || "ri-folder-line"} text-lg text-primary-600`}></i>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-foreground-900">{cat.name}</h3>
                {cat.description && <p className="text-xs text-foreground-400 mt-0.5 line-clamp-2">{cat.description}</p>}
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-foreground-400 mb-4">
              <span><i className="ri-file-text-line mr-1"></i>{cat.asset_count} 个素材</span>
              <span>排序: {cat.sort_order}</span>
            </div>

            <div className="mt-auto pt-3 border-t border-background-200/70 flex items-center gap-2">
              <button onClick={() => openEdit(cat)} className="flex-1 py-1.5 rounded-lg bg-background-100 text-foreground-900 text-xs font-medium hover:bg-primary-100 hover:text-primary-600 transition-all whitespace-nowrap">
                <i className="ri-edit-line mr-1"></i>编辑
              </button>
              <button onClick={() => handleDeleteRequest(cat)} className="py-1.5 px-3 rounded-lg bg-background-100 text-foreground-400 text-xs hover:bg-red-50 hover:text-red-500 transition-all whitespace-nowrap">
                <i className="ri-delete-bin-line"></i>
              </button>
            </div>
          </div>
        ))}

        {categories.length === 0 && (
          <div className="col-span-full py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-background-100 flex items-center justify-center mx-auto mb-4">
              <i className="ri-folder-open-line text-2xl text-foreground-300"></i>
            </div>
            <p className="text-sm text-foreground-400">还没有分类，点击上方按钮创建第一个</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-white rounded-xl border border-background-200/70 w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-background-200/70 flex items-center justify-between">
              <h2 className="font-display font-bold text-foreground-900">{editingId ? "编辑分类" : "创建分类"}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all">
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">分类名称 <span className="text-red-400">*</span></label>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm text-foreground-800 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-all" placeholder="如：基础理论" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">图标（Remix Icon class）</label>
                <input type="text" value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="如：ri-book-open-line" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">描述</label>
                <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="简短描述这个分类的用途" />
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
            <p className="text-sm text-foreground-500 mb-6">确定要删除分类「{deleteTarget.name}」吗？删除后无法恢复。</p>
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