import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Product {
  id: number;
  name: string;
  cover_image: string;
  description: string;
  category: string;
  price: number;
  member_price: number | null;
  points_required: number;
  points_plus_price: number | null;
  stock: number;
  is_virtual: boolean;
  delivery_content: string | null;
  is_published: boolean;
  sort_order: number;
  view_count: number;
  sold_count: number;
}

const emptyForm = {
  name: "",
  cover_image: "",
  description: "",
  category: "实体商品",
  price: 0,
  member_price: 0,
  points_required: 0,
  points_plus_price: 0,
  stock: -1,
  is_virtual: false,
  delivery_content: "",
  is_published: true,
  sort_order: 0,
  payment_modes: [] as string[],
};

export default function ProductsAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saveLoading, setSaveLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error: dbErr } = await supabase
        .from("products")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order");
      if (dbErr) throw dbErr;
      setProducts(data || []);
    } catch (err: any) {
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const categories = ["全部", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];

  const filtered = products.filter((p) => {
    if (categoryFilter !== "全部" && p.category !== categoryFilter) return false;
    if (statusFilter === "published" && !p.is_published) return false;
    if (statusFilter === "unpublished" && p.is_published) return false;
    if (search) {
      const kw = search.trim().toLowerCase();
      if (!p.name?.toLowerCase().includes(kw) && !p.description?.toLowerCase().includes(kw)) return false;
    }
    return true;
  });

  const totalSold = products.reduce((s, p) => s + (p.sold_count || 0), 0);
  const publishedCount = products.filter((p) => p.is_published).length;
  const lowStockCount = products.filter((p) => p.stock >= 0 && p.stock <= 10).length;

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    const modes: string[] = [];
    if (Number(p.price) > 0) modes.push("cash");
    if (p.points_plus_price != null && Number(p.points_plus_price) > 0) {
      modes.push("combo");
    } else if (Number(p.points_required) > 0) {
      modes.push("points");
    }
    setEditingId(p.id);
    setForm({
      name: p.name,
      cover_image: p.cover_image || "",
      description: p.description || "",
      category: p.category || "",
      price: Number(p.price) || 0,
      member_price: p.member_price != null ? Number(p.member_price) : 0,
      points_required: p.points_required || 0,
      points_plus_price: p.points_plus_price != null ? Number(p.points_plus_price) : 0,
      stock: p.stock ?? -1,
      is_virtual: p.is_virtual,
      delivery_content: p.delivery_content || "",
      is_published: p.is_published,
      sort_order: p.sort_order || 0,
      payment_modes: modes,
    });
    setShowModal(true);
  };

  const updateField = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleMode = (key: string) => {
    setForm((prev) => {
      let modes = [...(prev.payment_modes || [])];
      if (modes.includes(key)) {
        modes = modes.filter((m) => m !== key);
      } else {
        if (key === "points") modes = modes.filter((m) => m !== "combo");
        if (key === "combo") modes = modes.filter((m) => m !== "points");
        modes.push(key);
      }
      return { ...prev, payment_modes: modes };
    });
  };

  const modes = form.payment_modes || [];

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      setSaveLoading(true);
      const payload = {
        name: form.name,
        cover_image: form.cover_image,
        description: form.description,
        category: form.category,
        price: modes.includes("cash") ? form.price : 0,
        member_price: modes.includes("cash") && form.member_price > 0 ? form.member_price : null,
        points_required: modes.includes("points") || modes.includes("combo") ? form.points_required : 0,
        points_plus_price: modes.includes("combo") && form.points_plus_price > 0 ? form.points_plus_price : null,
        stock: form.stock,
        is_virtual: form.is_virtual,
        delivery_content: form.delivery_content,
        is_published: form.is_published,
        sort_order: form.sort_order,
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        const { error: upErr } = await supabase.from("products").update(payload).eq("id", editingId);
        if (upErr) throw upErr;
      } else {
        const { error: inErr } = await supabase.from("products").insert(payload);
        if (inErr) throw inErr;
      }
      setShowModal(false);
      await loadData();
      showToast(editingId ? "商品已更新" : "商品已创建");
    } catch (err: any) {
      showToast("保存失败: " + (err?.message || ""));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggle = async (p: Product) => {
    const { error: tgErr } = await supabase
      .from("products")
      .update({ is_published: !p.is_published, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (tgErr) {
      showToast("操作失败: " + (tgErr?.message || ""));
      return;
    }
    await loadData();
    showToast(p.is_published ? "商品已下架" : "商品已上架");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error: delErr } = await supabase
      .from("products")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", deleteTarget.id);
    if (delErr) {
      showToast("删除失败: " + (delErr?.message || ""));
      return;
    }
    setDeleteTarget(null);
    await loadData();
    showToast("商品已删除");
  };

  const priceSummary = (p: Product) => {
    const parts: string[] = [];
    if (p.price > 0) parts.push(`¥${Number(p.price).toLocaleString()}`);
    if (p.points_plus_price != null && p.points_plus_price > 0) {
      parts.push(`${Number(p.points_required).toLocaleString()}分+¥${Number(p.points_plus_price).toLocaleString()}`);
    } else if (p.points_required > 0) {
      parts.push(`${Number(p.points_required).toLocaleString()}分`);
    }
    return parts.join(" / ") || "仅展示";
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center h-full">
        <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex flex-col items-center py-16">
          <p className="text-sm text-foreground-500 mb-4">{error}</p>
          <button onClick={loadData} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium whitespace-nowrap">重试</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {toast && (
        <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm">{toast}</div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground-950">商品管理</h1>
          <p className="mt-1 text-sm text-foreground-500">管理商城商品，支持现金购买、积分兑换与组合购买</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-all whitespace-nowrap">
          <i className="ri-add-line mr-1.5"></i>添加商品
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "商品总数", value: products.length, color: "text-foreground-950" },
          { label: "在售商品", value: publishedCount, color: "text-primary-500" },
          { label: "低库存预警", value: lowStockCount, color: "text-secondary-600" },
          { label: "累计销量", value: totalSold, color: "text-accent-600" },
        ].map((stat) => (
          <div key={stat.label} className="bg-background-50 rounded-xl p-4 border border-background-200/70">
            <p className="text-xs text-foreground-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm">
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm">
          <option value="all">全部状态</option>
          <option value="published">已上架</option>
          <option value="unpublished">已下架</option>
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索商品名称或描述"
          className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
        />
      </div>

      {/* 商品表格 */}
      <div className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">商品</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">分类</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">价格 / 积分</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">库存</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">销量</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">状态</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-background-100 overflow-hidden shrink-0">
                        {p.cover_image ? (
                          <img src={p.cover_image} alt={p.name} className="w-full h-full object-cover object-top" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <i className="ri-image-line text-foreground-400"></i>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground-900 text-sm truncate max-w-[180px]">{p.name}</p>
                        {p.is_virtual && (
                          <span className="px-1.5 py-0.5 rounded-full bg-accent-100 text-accent-900 text-[10px] font-medium">虚拟</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 text-xs font-medium">{p.category || "未分类"}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground-700 text-xs whitespace-nowrap">{priceSummary(p)}</td>
                  <td className="px-4 py-3 text-foreground-600 text-xs">
                    {p.stock === -1 ? "不限量" : p.stock <= 10 ? <span className="text-secondary-600 font-medium">{p.stock}</span> : p.stock}
                  </td>
                  <td className="px-4 py-3 text-foreground-600 text-xs">{p.sold_count || 0}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(p)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        p.is_published ? "bg-primary-100 text-primary-700" : "bg-background-200 text-foreground-500"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${p.is_published ? "bg-primary-500" : "bg-foreground-300"}`}></span>
                      {p.is_published ? "已上架" : "已下架"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(p)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all" title="编辑">
                        <i className="ri-edit-line"></i>
                      </button>
                      <button onClick={() => setDeleteTarget(p)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all" title="删除">
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-foreground-400">没有符合条件的商品</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 创建/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
            <div className="sticky top-0 bg-background-50 border-b border-background-200/70 px-5 py-4 flex items-center justify-between z-10">
              <h2 className="font-heading font-semibold text-foreground-950">{editingId ? "编辑商品" : "添加商品"}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all">
                <i className="ri-close-line"></i>
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* 基本信息 */}
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">商品名称 <span className="text-red-400">*</span></label>
                <input type="text" value={form.name} onChange={(e) => updateField("name", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="如：《引力场》实体书" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">封面图 URL</label>
                  <input type="text" value={form.cover_image} onChange={(e) => updateField("cover_image", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">分类</label>
                  <input type="text" value={form.category} onChange={(e) => updateField("category", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="实体商品" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">商品描述</label>
                <textarea value={form.description} onChange={(e) => updateField("description", e.target.value)} rows={3} maxLength={500} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm resize-none" placeholder="商品简介" />
              </div>

              {/* 购买方式 */}
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-2">购买方式（可多选）</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: "cash", label: "现金（会员价）", icon: "ri-money-cny-circle-line", desc: "现金 / 会员价购买" },
                    { key: "points", label: "积分", icon: "ri-vip-crown-line", desc: "纯积分兑换" },
                    { key: "combo", label: "积分 + 现金", icon: "ri-exchange-funds-line", desc: "积分抵扣 + 补现金" },
                  ].map((opt) => {
                    const active = modes.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => toggleMode(opt.key)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                          active ? "border-primary-500 bg-primary-50" : "border-background-200/70 bg-background-50 hover:border-background-300"
                        }`}
                      >
                        <i className={`${opt.icon} text-xl ${active ? "text-primary-500" : "text-foreground-400"}`}></i>
                        <span className={`text-sm font-medium whitespace-nowrap ${active ? "text-primary-700" : "text-foreground-600"}`}>{opt.label}</span>
                        <span className="text-[11px] text-foreground-400 text-center leading-tight">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>

                {modes.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 p-4 mt-3 rounded-lg bg-background-100/60">
                    {modes.includes("cash") && (
                      <>
                        <div>
                          <label className="block text-xs text-foreground-500 mb-1">现金价格 (¥)</label>
                          <input type="number" value={form.price} onChange={(e) => updateField("price", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" step="1" />
                        </div>
                        <div>
                          <label className="block text-xs text-foreground-500 mb-1">会员价 (¥)</label>
                          <input type="number" value={form.member_price} onChange={(e) => updateField("member_price", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" step="1" />
                        </div>
                      </>
                    )}
                    {(modes.includes("points") || modes.includes("combo")) && (
                      <div>
                        <label className="block text-xs text-foreground-500 mb-1">{modes.includes("combo") ? "积分部分 (分)" : "兑换所需积分 (分)"}</label>
                        <input type="number" value={form.points_required} onChange={(e) => updateField("points_required", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
                      </div>
                    )}
                    {modes.includes("combo") && (
                      <div>
                        <label className="block text-xs text-foreground-500 mb-1">补现金部分 (¥)</label>
                        <input type="number" value={form.points_plus_price} onChange={(e) => updateField("points_plus_price", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" step="1" />
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-foreground-400 mt-2">勾选商品支持的购买方式，未勾选的方式在商城里不会展示。可同时支持「现金」与「积分」两类。</p>
              </div>

              {/* 库存与类型 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">库存（-1=不限量）</label>
                  <input type="number" value={form.stock} onChange={(e) => updateField("stock", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="-1" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">排序</label>
                  <input type="number" value={form.sort_order} onChange={(e) => updateField("sort_order", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
                </div>
              </div>

              {/* 虚拟商品 */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-foreground-500">虚拟商品</span>
                <button onClick={() => updateField("is_virtual", !form.is_virtual)} className={`relative w-11 h-6 rounded-full transition-all ${form.is_virtual ? "bg-primary-500" : "bg-background-300"}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${form.is_virtual ? "left-5" : "left-0.5"}`}></span>
                </button>
                <span className="text-xs text-foreground-400">虚拟商品无需发货，支付后直接交付</span>
              </div>

              {form.is_virtual && (
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">交付内容说明</label>
                  <textarea value={form.delivery_content} onChange={(e) => updateField("delivery_content", e.target.value)} rows={2} maxLength={500} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm resize-none" placeholder="如：购买后自动发放激活码" />
                </div>
              )}

              {/* 上架状态 */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-foreground-500">上架状态</span>
                <button onClick={() => updateField("is_published", !form.is_published)} className={`relative w-11 h-6 rounded-full transition-all ${form.is_published ? "bg-primary-500" : "bg-background-300"}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${form.is_published ? "left-5" : "left-0.5"}`}></span>
                </button>
              </div>
            </div>

            <div className="sticky bottom-0 bg-background-50 border-t border-background-200/70 px-5 py-4 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">取消</button>
              <button onClick={handleSave} disabled={saveLoading || !form.name.trim()} className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap">
                {saveLoading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <i className="ri-alert-line text-red-500 text-xl"></i>
              </div>
              <div>
                <h3 className="font-semibold text-foreground-950">删除「{deleteTarget.name}」</h3>
                <p className="text-xs text-foreground-500 mt-0.5">删除后商城不再展示</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">取消</button>
              <button onClick={confirmDelete} className="px-5 py-2 rounded-full bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-all whitespace-nowrap">删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}