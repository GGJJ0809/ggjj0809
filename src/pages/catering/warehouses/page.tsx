import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { supabase } from '@/lib/supabase';

interface Warehouse {
  id: number;
  code: string;
  name: string;
  address: string;
  manager: string;
  phone: string;
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

interface WarehouseForm {
  code: string;
  name: string;
  address: string;
  manager: string;
  phone: string;
  is_active: boolean;
  notes: string;
}

const emptyForm: WarehouseForm = {
  code: '',
  name: '',
  address: '',
  manager: '',
  phone: '',
  is_active: true,
  notes: '',
};

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('全部');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<WarehouseForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);

  const addToast = useCallback((type: Toast['type'], msg: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.from('warehouses').select('*').order('created_at', { ascending: false });
      if (e) throw e;
      setWarehouses((data ?? []) as Warehouse[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = warehouses.filter((w) => {
    const matchSearch = !search || w.name.includes(search) || w.code.includes(search) || w.address.includes(search);
    const matchActive = activeFilter === '全部' || (activeFilter === '启用' ? w.is_active : !w.is_active);
    return matchSearch && matchActive;
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (w: Warehouse) => {
    setEditingId(w.id);
    setForm({
      code: w.code || '',
      name: w.name,
      address: w.address || '',
      manager: w.manager || '',
      phone: w.phone || '',
      is_active: w.is_active,
      notes: w.notes || '',
    });
    setShowModal(true);
  };

  const setF = (key: keyof WarehouseForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      addToast('error', '请输入仓库名称');
      return;
    }
    if (!form.code.trim()) {
      addToast('error', '请输入仓库编号');
      return;
    }
    setSaving(true);
    try {
      const data = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        address: form.address.trim() || null,
        manager: form.manager.trim() || null,
        phone: form.phone.trim() || null,
        is_active: form.is_active,
        notes: form.notes.trim() || null,
      };

      if (editingId) {
        const { error: e } = await supabase.from('warehouses').update(data).eq('id', editingId);
        if (e) throw e;
        addToast('success', `「${data.name}」已更新`);
      } else {
        const { error: e } = await supabase.from('warehouses').insert(data);
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
      const { error: e } = await supabase.from('warehouses').delete().eq('id', deleteTarget.id);
      if (e) throw e;
      addToast('success', `「${deleteTarget.name}」已删除`);
      setDeleteTarget(null);
      fetchData();
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : '删除失败');
    }
  };

  const toggleActive = async (w: Warehouse) => {
    try {
      const { error: e } = await supabase.from('warehouses').update({ is_active: !w.is_active }).eq('id', w.id);
      if (e) throw e;
      addToast('success', `「${w.name}」已${w.is_active ? '停用' : '启用'}`);
      fetchData();
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : '操作失败');
    }
  };

  return (
    <AppLayout title="仓库管理" breadcrumb={['餐饮管理', '仓库管理']}>
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
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: '仓库总数', value: warehouses.length, icon: 'ri-home-6-line', color: 'text-slate-700', bg: 'bg-slate-100' },
          { label: '已启用', value: warehouses.filter((w) => w.is_active).length, icon: 'ri-checkbox-circle-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: '已停用', value: warehouses.filter((w) => !w.is_active).length, icon: 'ri-pause-circle-line', color: 'text-slate-400', bg: 'bg-slate-100' },
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
              placeholder="搜索仓库名称、编号、地址..."
              className="w-full text-sm pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
            />
          </div>

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
            className="flex items-center gap-1 text-sm bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line" />添加仓库
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
            <i className="ri-home-6-line text-3xl mb-2" />
            <p className="text-sm">暂无仓库数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {['仓库编号', '仓库名称', '地址', '负责人', '电话', '状态', '操作'].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-slate-500">{w.code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-slate-800">{w.name}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate" title={w.address}>{w.address || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{w.manager || '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{w.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleActive(w)}
                        className={`text-xs px-2 py-0.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${
                          w.is_active ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {w.is_active ? '启用' : '停用'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(w)}
                          className="text-xs border border-slate-200 text-slate-500 px-2 py-1 rounded hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-edit-line" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(w)}
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
                {editingId ? '编辑仓库' : '添加仓库'}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">仓库编号 <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setF('code', e.target.value)}
                    placeholder="如：CK001"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">仓库名称 <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setF('name', e.target.value)}
                    placeholder="如：主仓库"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1 block">地址</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setF('address', e.target.value)}
                  placeholder="如：食堂一楼后厨旁"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">负责人</label>
                  <input
                    type="text"
                    value={form.manager}
                    onChange={(e) => setF('manager', e.target.value)}
                    placeholder="如：张建国"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">电话</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setF('phone', e.target.value)}
                    placeholder="如：138-0000-0000"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400"
                  />
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
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400 resize-none"
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
                className="text-sm bg-amber-500 text-white px-5 py-2 rounded-lg hover:bg-amber-600 cursor-pointer whitespace-nowrap disabled:opacity-50 flex items-center gap-1.5"
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
                <p className="text-xs text-slate-500 mt-0.5">将永久删除仓库「{deleteTarget.name}」</p>
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