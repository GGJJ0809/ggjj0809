import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { supabase } from '@/lib/supabase';

interface InboundMaterial {
  id: number;
  name: string;
  category_name: string;
  unit: string | null;
  unit_price: number;
  supplier_id: number | null;
  material_type: number;
  bar_code: string | null;
  is_active: boolean | number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Toast {
  id: number;
  type: 'success' | 'error';
  msg: string;
}

interface MaterialForm {
  name: string;
  category_name: string;
  unit: string;
  unit_price: string;
  bar_code: string;
  material_type: number;
  is_active: boolean;
  notes: string;
}

const emptyForm: MaterialForm = {
  name: '',
  category_name: '',
  unit: 'kg',
  unit_price: '',
  bar_code: '',
  material_type: 1,
  is_active: true,
  notes: '',
};

const UNIT_OPTIONS = ['kg', 'g', '斤', '个', '箱', '袋', '瓶', '包', '桶', '件', '条', '根', '块'];
const CATEGORY_PRESETS = ['蔬菜', '水果', '肉类', '水产', '粮油', '调味品', '干货', '冻品', '豆制品', '蛋奶', '饮品'];

export default function InboundMaterialsPage() {
  const [materials, setMaterials] = useState<InboundMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('全部');
  const [activeFilter, setActiveFilter] = useState<string>('全部');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<MaterialForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<InboundMaterial | null>(null);

  const addToast = useCallback((type: Toast['type'], msg: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('inbound_materials')
        .select('*')
        .order('created_at', { ascending: false });
      if (e) throw e;
      setMaterials((data ?? []) as InboundMaterial[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const categories = Array.from(new Set(materials.map((m) => m.category_name).filter(Boolean)));

  const filtered = materials.filter((m) => {
    const matchSearch =
      !search ||
      m.name.includes(search) ||
      (m.category_name || '').includes(search) ||
      (m.bar_code || '').includes(search);
    const matchCat = categoryFilter === '全部' || m.category_name === categoryFilter;
    const isActive = m.is_active === true || m.is_active === 1;
    const matchActive =
      activeFilter === '全部' || (activeFilter === '启用' ? isActive : !isActive);
    return matchSearch && matchCat && matchActive;
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (m: InboundMaterial) => {
    setEditingId(m.id);
    setForm({
      name: m.name,
      category_name: m.category_name || '',
      unit: m.unit || 'kg',
      unit_price: m.unit_price > 0 ? String(m.unit_price) : '',
      bar_code: m.bar_code || '',
      material_type: m.material_type || 1,
      is_active: m.is_active === true || m.is_active === 1,
      notes: m.notes || '',
    });
    setShowModal(true);
  };

  const setF = <K extends keyof MaterialForm>(key: K, value: MaterialForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { addToast('error', '请输入货品名称'); return; }
    if (!form.category_name.trim()) { addToast('error', '请选择或输入分类'); return; }
    setSaving(true);
    try {
      const unitPrice = parseFloat(form.unit_price) || 0;
      const payload = {
        name: form.name.trim(),
        category_name: form.category_name.trim(),
        unit: form.unit || 'kg',
        unit_price: unitPrice,
        bar_code: form.bar_code.trim() || null,
        material_type: form.material_type,
        is_active: form.is_active ? 1 : 0,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error: e } = await supabase.from('inbound_materials').update(payload).eq('id', editingId);
        if (e) throw e;
        addToast('success', `「${payload.name}」已更新`);
      } else {
        const { error: e } = await supabase.from('inbound_materials').insert({
          ...payload,
          created_at: new Date().toISOString(),
        });
        if (e) throw e;
        addToast('success', `「${payload.name}」已添加`);
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
      const { error: e } = await supabase.from('inbound_materials').delete().eq('id', deleteTarget.id);
      if (e) throw e;
      addToast('success', `「${deleteTarget.name}」已删除`);
      setDeleteTarget(null);
      fetchData();
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : '删除失败');
    }
  };

  const toggleActive = async (m: InboundMaterial) => {
    const isActive = m.is_active === true || m.is_active === 1;
    try {
      const { error: e } = await supabase
        .from('inbound_materials')
        .update({ is_active: isActive ? 0 : 1 })
        .eq('id', m.id);
      if (e) throw e;
      addToast('success', `「${m.name}」已${isActive ? '停用' : '启用'}`);
      fetchData();
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : '操作失败');
    }
  };

  const activeCount = materials.filter((m) => m.is_active === true || m.is_active === 1).length;

  return (
    <AppLayout title="入库货品管理" breadcrumb={['餐饮管理', '入库货品管理']}>
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm pointer-events-auto transition-all ${
              t.type === 'success'
                ? 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                : 'bg-red-50 border border-red-100 text-red-600'
            }`}
          >
            <i className={t.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
            {t.msg}
          </div>
        ))}
      </div>

      {/* Tips */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-5 flex items-start gap-2">
        <i className="ri-information-line text-amber-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-700">
          此页面管理入库电子秤的货品列表。设备扫码/搜索货品时，读取的就是这里的数据。添加货品后，重启服务或等待设备同步即可在秤上看到。
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: '货品总数', value: materials.length, icon: 'ri-box-3-line', color: 'text-slate-700', bg: 'bg-slate-100' },
          { label: '已启用', value: activeCount, icon: 'ri-checkbox-circle-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: '已停用', value: materials.length - activeCount, icon: 'ri-pause-circle-line', color: 'text-slate-400', bg: 'bg-slate-100' },
          { label: '分类数', value: categories.length, icon: 'ri-price-tag-3-line', color: 'text-amber-500', bg: 'bg-amber-50' },
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
              placeholder="搜索名称、分类、条码..."
              className="w-full text-sm pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-slate-400 cursor-pointer"
          >
            <option value="全部">全部分类</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
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
            <i className="ri-add-line" />添加货品
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
            <button type="button" onClick={fetchData} className="mt-2 text-xs border border-slate-200 px-3 py-1 rounded-lg hover:bg-slate-50 cursor-pointer">
              重试
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <i className="ri-box-3-line text-3xl mb-2" />
            <p className="text-sm">暂无货品数据</p>
            <button
              type="button"
              onClick={openAdd}
              className="mt-3 text-xs bg-emerald-500 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer"
            >
              添加第一个货品
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {['ID', '货品名称', '分类', '单位', '单价(元)', '条码', '类型', '状态', '操作'].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((m) => {
                  const isActive = m.is_active === true || m.is_active === 1;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono text-slate-400">{m.id}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-slate-800">{m.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          {m.category_name || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{m.unit || 'kg'}</td>
                      <td className="px-4 py-3 text-xs text-slate-700 font-mono">
                        {m.unit_price > 0 ? `¥${m.unit_price.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-400">{m.bar_code || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${m.material_type === 2 ? 'bg-violet-50 text-violet-600' : 'bg-slate-100 text-slate-500'}`}>
                          {m.material_type === 2 ? '半成品' : '原料'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleActive(m)}
                          className={`text-xs px-2 py-0.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {isActive ? '启用' : '停用'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(m)}
                            className="text-xs border border-slate-200 text-slate-500 px-2 py-1 rounded hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                          >
                            <i className="ri-edit-line" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(m)}
                            className="text-xs border border-red-100 text-red-400 px-2 py-1 rounded hover:bg-red-50 cursor-pointer whitespace-nowrap"
                          >
                            <i className="ri-delete-bin-line" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
                {editingId ? '编辑货品' : '添加货品'}
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
                <label className="text-xs text-slate-500 mb-1 block">
                  货品名称 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setF('name', e.target.value)}
                  placeholder="如：新鲜猪肉、大白菜"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">
                    分类 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.category_name}
                    onChange={(e) => setF('category_name', e.target.value)}
                    placeholder="如：肉类、蔬菜"
                    list="category-presets"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                  />
                  <datalist id="category-presets">
                    {CATEGORY_PRESETS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                    {categories.filter((c) => !CATEGORY_PRESETS.includes(c)).map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">单位</label>
                  <select
                    value={form.unit}
                    onChange={(e) => setF('unit', e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 cursor-pointer"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">单价（元）</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.unit_price}
                    onChange={(e) => setF('unit_price', e.target.value)}
                    placeholder="如：12.50"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">条码</label>
                  <input
                    type="text"
                    value={form.bar_code}
                    onChange={(e) => setF('bar_code', e.target.value)}
                    placeholder="扫码或手动输入"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1 block">货品类型</label>
                <div className="flex gap-2">
                  {[{ v: 1, label: '原料' }, { v: 2, label: '半成品' }].map(({ v, label }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setF('material_type', v)}
                      className={`text-xs px-4 py-1.5 rounded-lg cursor-pointer border transition-colors whitespace-nowrap ${
                        form.material_type === v
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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
                <p className="text-xs text-slate-500 mt-0.5">
                  将永久删除货品「{deleteTarget.name}」
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 text-sm border border-slate-200 text-slate-600 rounded-lg py-2 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 text-sm bg-red-500 text-white rounded-lg py-2 hover:bg-red-600 cursor-pointer whitespace-nowrap"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}