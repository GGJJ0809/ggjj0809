import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { supabase } from '@/lib/supabase';

interface Supplier {
  id: number;
  name: string;
  contact: string;
  phone: string;
  address: string;
  category: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Toast {
  id: number;
  type: 'success' | 'error';
  msg: string;
}

interface SupplierForm {
  name: string;
  contact: string;
  phone: string;
  address: string;
  category: string;
  is_active: boolean;
  notes: string;
}

const emptyForm: SupplierForm = {
  name: '',
  contact: '',
  phone: '',
  address: '',
  category: '',
  is_active: true,
  notes: '',
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('全部');
  const [activeFilter, setActiveFilter] = useState<string>('全部');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const addToast = useCallback((type: Toast['type'], msg: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.from('suppliers').select('*').order('created_at', { ascending: false });
      if (e) throw e;
      setSuppliers((data ?? []) as Supplier[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const categories = Array.from(new Set(suppliers.map((s) => s.category).filter(Boolean)));

  const filtered = suppliers.filter((s) => {
    const matchSearch = !search || s.name.includes(search) || s.contact.includes(search) || s.phone.includes(search);
    const matchCat = categoryFilter === '全部' || s.category === categoryFilter;
    const matchActive = activeFilter === '全部' || (activeFilter === '启用' ? s.is_active : !s.is_active);
    return matchSearch && matchCat && matchActive;
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      contact: s.contact || '',
      phone: s.phone || '',
      address: s.address || '',
      category: s.category || '',
      is_active: s.is_active,
      notes: s.notes || '',
    });
    setShowModal(true);
  };

  const setF = (key: keyof SupplierForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      addToast('error', '请输入供应商名称');
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        contact: form.contact.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        category: form.category.trim() || null,
        is_active: form.is_active,
        notes: form.notes.trim() || null,
      };

      if (editingId) {
        const { error: e } = await supabase.from('suppliers').update(data).eq('id', editingId);
        if (e) throw e;
        addToast('success', `「${data.name}」已更新`);
      } else {
        const { error: e } = await supabase.from('suppliers').insert(data);
        if (e) throw e;
        addToast('success', `「${data.name}」已添加`);
      }
      setShowModal(false);
      fetchData();
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error: e } = await supabase.from('suppliers').delete().eq('id', deleteTarget.id);
      if (e) throw e;
      addToast('success', `「${deleteTarget.name}」已删除`);
      setDeleteTarget(null);
      fetchData();
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : '删除失败');
    }
  };

  const toggleActive = async (s: Supplier) => {
    try {
      const { error: e } = await supabase.from('suppliers').update({ is_active: !s.is_active }).eq('id', s.id);
      if (e) throw e;
      addToast('success', `「${s.name}」已${s.is_active ? '停用' : '启用'}`);
      fetchData();
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : '操作失败');
    }
  };

  return (
    <AppLayout title="供应商管理" breadcrumb={['餐饮管理', '供应商管理']}>
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm pointer-events-auto transition-all ${
            t.type === 'success' ? 'bg-emerald-50 border border-emerald-100 text-emerald-700' : 'bg-red-50 border border-red-100 text-red-600'
          }`}>
            <i className={t.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
            {t.msg}
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: '供应商总数', value: suppliers.length, icon: 'ri-store-2-line', color: 'text-slate-700', bg: 'bg-slate-100' },
          { label: '已启用', value: suppliers.filter((s) => s.is_active).length, icon: 'ri-checkbox-circle-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: '已停用', value: suppliers.filter((s) => !s.is_active).length, icon: 'ri-pause-circle-line', color: 'text-slate-400', bg: 'bg-slate-100' },
          { label: '品类数', value: categories.length, icon: 'ri-price-tag-3-line', color: 'text-amber-500', bg: 'bg-amber-50' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${s.bg}`}>
              <i className={`${s.icon} ${s.color} text-xl`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-[280px]">
            <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索供应商名称、联系人、电话..."
              className="w-full text-sm pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-slate-400 cursor-pointer"
          >
            <option value="全部">全部品类</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-slate-400 cursor-pointer"
          >
            <option value="全部">全部状态</option>
            <option value="启用">已启用</option>
            <option value="停用">已停用</option>
          </select>

          <div className="flex-1" />

          <span className="text-xs text-slate-400">
            共 <strong className="text-slate-700">{filtered.length}</strong> 条
          </span>

          <button
            type="button"
            onClick={fetchData}
            className="flex items-center gap-1 text-sm border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line" />刷新
          </button>

          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-1 text-sm bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line" />添加供应商
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <i className="ri-loader-4-line animate-spin text-xl mr-2" />加载中...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <i className="ri-error-warning-line text-3xl mb-2 text-red-400" />
            <p className="text-sm">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <i className="ri-store-2-line text-3xl mb-2" />
            <p className="text-sm">暂无供应商数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {['供应商名称', '联系人', '电话', '地址', '品类', '状态', '操作'].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-slate-800">{s.name}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{s.contact || '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{s.phone || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate" title={s.address}>{s.address || '—'}</td>
                    <td className="px-4 py-3">
                      {s.category ? (
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{s.category}</span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleActive(s)}
                        className={`text-xs px-2 py-0.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${
                          s.is_active ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {s.is_active ? '启用' : '停用'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="text-xs border border-slate-200 text-slate-500 px-2 py-1 rounded hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-edit-line" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(s)}
                          className="text-xs border border-red-100 text-red-400 px-2 py-1 rounded hover:bg-red-50 cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-delete-bin-line" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-slate-800">
                {editingId ? '编辑供应商' : '添加供应商'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <i className="ri-close-line text-slate-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">供应商名称 <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setF('name', e.target.value)}
                  placeholder="如：绿源蔬菜基地"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">联系人</label>
                  <input
                    type="text"
                    value={form.contact}
                    onChange={(e) => setF('contact', e.target.value)}
                    placeholder="如：李主任"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">电话</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setF('phone', e.target.value)}
                    placeholder="如：139-0000-0000"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1 block">地址</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setF('address', e.target.value)}
                  placeholder="如：本市食品工业园区A区3号"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1 block">品类</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setF('category', e.target.value)}
                  placeholder="如：蔬菜、肉类、水产"
                  list="supplier-category-suggest"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                />
                <datalist id="supplier-category-suggest">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1 block">备注</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setF('notes', e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="选填"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 resize-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500">启用状态</label>
                <button
                  type="button"
                  onClick={() => setF('is_active', !form.is_active)}
                  className={`text-xs px-3 py-1 rounded-full cursor-pointer transition-colors ${
                    form.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {form.is_active ? '启用' : '停用'}
                </button>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-sm border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="text-sm bg-emerald-500 text-white px-5 py-2 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving && <i className="ri-loader-4-line animate-spin" />}
                {editingId ? '保存修改' : '确认添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl p-6 w-80">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50">
                <i className="ri-delete-bin-line text-red-500 text-lg" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">确认删除</p>
                <p className="text-xs text-slate-500 mt-0.5">将永久删除供应商「{deleteTarget.name}」</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)}
                className="flex-1 text-sm border border-slate-200 text-slate-600 rounded-lg py-2 hover:bg-slate-50 cursor-pointer whitespace-nowrap">取消</button>
              <button type="button" onClick={handleDelete}
                className="flex-1 text-sm bg-red-500 text-white rounded-lg py-2 hover:bg-red-600 cursor-pointer whitespace-nowrap">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}