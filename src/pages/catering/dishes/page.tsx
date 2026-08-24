import { useState, useCallback, useRef, useEffect } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import AddDishModal from './components/AddDishModal';
import { useDishes, type Dish, type DishCategory } from './hooks/useDishes';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/imageUtils';

interface Toast { id: number; type: 'success' | 'error'; msg: string; }

type EditForm = {
  name: string; category_id: number; status: string;
  calories: string; protein: string; fat: string; carbs: string;
  method: string; nutrition: string; contraindications: string;
  taste: string; effect: string;
  imgBase64?: string;
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DishesPage() {
  const { dishes, categories, loading, error, addDish, updateDish, deleteDish, batchDeleteDish, refetch } = useDishes();

  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('全部');
  const [showAddModal, setShowAddModal] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [exporting, setExporting] = useState(false);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Batch delete
  const [batchDeleteTarget, setBatchDeleteTarget] = useState<number[] | null>(null);
  const [batchDeleting, setBatchDeleting] = useState(false);

  // Edit inline
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editImgPreview, setEditImgPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // ---- Quick toggle status ----
  const toggleStatus = async (dish: Dish) => {
    setTogglingId(dish.id);
    const newStatus = dish.status === 'active' ? 'inactive' : 'active';
    const result = await updateDish(dish.id, { status: newStatus });
    setTogglingId(null);
    if (result.success) {
      addToast('success', `「${dish.name}」已${newStatus === 'active' ? '上架' : '下架'}`);
    } else {
      addToast('error', result.error || '操作失败');
    }
  };

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Dish | null>(null);

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  // 导入失败详情
  const [importReport, setImportReport] = useState<{
    successDishes: string[];
    skipDishes: string[];
    failDetails: { name: string; reason: string }[];
  } | null>(null);
  const [showImportReport, setShowImportReport] = useState(false);

  const addToast = useCallback((type: 'success' | 'error', msg: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const filtered = dishes.filter((d) => {
    const matchCat = categoryFilter === null || d.category_id === categoryFilter;
    const matchSearch = !search || (d.name?.includes(search) ?? false);
    const matchStatus = statusFilter === '全部' || d.status === statusFilter;
    return matchCat && matchSearch && matchStatus;
  });

  // ---- Edit ----
  const startEdit = (dish: Dish) => {
    setEditingId(dish.id);
    setEditForm({
      name: dish.name,
      category_id: dish.category_id,
      status: dish.status,
      calories: String(dish.calories),
      protein: String(dish.protein),
      fat: String(dish.fat),
      carbs: String(dish.carbs),
      method: dish.method,
      nutrition: dish.nutrition,
      contraindications: dish.contraindications,
      taste: dish.taste || '',
      effect: dish.effect || '',
      imgBase64: undefined,
    });
    setEditImgPreview('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
    setEditImgPreview('');
  };

  const setEF = (key: keyof EditForm, value: string | number) => {
    setEditForm((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const handleEditImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { addToast('error', '图片不能超过 5MB'); return; }
    try {
      const compressed = await compressImage(file, { maxWidth: 400, maxHeight: 400, quality: 0.75 });
      setEditImgPreview(compressed);
      setEditForm((prev) => prev ? { ...prev, imgBase64: compressed } : prev);
    } catch {
      addToast('error', '图片处理失败');
    }
  };

  const saveEdit = async () => {
    if (!editingId || !editForm) return;
    setSaving(true);
    const result = await updateDish(editingId, {
      name: editForm.name,
      category_id: editForm.category_id,
      status: editForm.status,
      calories: Number(editForm.calories),
      protein: Number(editForm.protein),
      fat: Number(editForm.fat),
      carbs: Number(editForm.carbs),
      method: editForm.method,
      nutrition: editForm.nutrition,
      contraindications: editForm.contraindications,
      taste: editForm.taste,
      effect: editForm.effect,
      ...(editForm.imgBase64 ? { imgBase64: editForm.imgBase64 } : {}),
    });
    setSaving(false);
    if (result.success) {
      addToast('success', '菜品已更新');
      cancelEdit();
    } else {
      addToast('error', result.error || '保存失败');
    }
  };

  // ---- Delete ----
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteDish(deleteTarget.id);
    setDeleteTarget(null);
    if (result.success) {
      addToast('success', `「${deleteTarget.name}」已删除`);
    } else {
      addToast('error', result.error || '删除失败');
    }
  };

  // ---- Multi-select ----
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allIds = new Set(filtered.map((d) => d.id));
    if (selectedIds.size === allIds.size && allIds.size > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(allIds);
    }
  };

  // 切换筛选/搜索时清空选中
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, categoryFilter, statusFilter]);

  // ---- Batch Delete ----
  const handleBatchDelete = async () => {
    if (!batchDeleteTarget || batchDeleteTarget.length === 0) return;
    setBatchDeleting(true);
    const result = await batchDeleteDish(batchDeleteTarget);
    setBatchDeleting(false);
    setBatchDeleteTarget(null);
    setSelectedIds(new Set());
    if (result.success) {
      addToast('success', `批量删除完成：成功删除 ${result.deleted} 道菜品`);
    } else {
      addToast('error', `批量删除完成：成功 ${result.deleted} 道，失败 ${result.failed} 道`);
    }
  };

  // ---- Export ----
  const handleExportAll = () => {
    if (dishes.length === 0) {
      addToast('error', '暂无可导出的菜品');
      return;
    }
    setExporting(true);
    try {
      const headers = ['菜品名称', '分类', '状态', '热量(kcal)', '蛋白质(g)', '脂肪(g)', '碳水(g)', '烹饪方法', '营养说明', '饮食禁忌'];
      const rows = dishes.map((d) => [
        d.name,
        d.category,
        d.status === 'active' ? '上架中' : '已下架',
        String(d.calories),
        String(d.protein),
        String(d.fat),
        String(d.carbs),
        d.method || '',
        d.nutrition || '',
        d.contraindications || '',
      ]);
      const csvContent = '\uFEFF' + [headers, ...rows].map((r) => r.map((c) => {
        const cell = String(c);
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')).join('\n');

      const isElectron = !!(window as any).electronAPI;
      if (isElectron) {
        const base64 = btoa(unescape(encodeURIComponent(csvContent)));
        const link = document.createElement('a');
        link.href = `data:text/csv;charset=utf-8;base64,${base64}`;
        link.download = `菜品列表_${todayStr()}.csv`;
        link.click();
      } else {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `菜品列表_${todayStr()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }
      addToast('success', `已导出 ${dishes.length} 道菜品`);
    } catch (e) {
      addToast('error', '导出失败');
    } finally {
      setExporting(false);
    }
  };

  // ---- Add ----
  const handleAddDish = async (form: Parameters<typeof addDish>[0]) => {
    const result = await addDish(form);
    if (result.success) {
      addToast('success', `「${form.name}」已添加`);
    } else {
      throw new Error(result.error || '添加失败');
    }
  };

  // ---- Import ----
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter((l) => l.trim());
      const rows = lines.map((l) => parseCSVLine(l));
      if (rows.length < 2) { addToast('error', 'CSV 格式不正确，至少需要表头 + 一行数据'); return; }
      setImportPreview(rows);
      setShowImport(true);
    };
    reader.readAsText(file);
    if (importFileRef.current) importFileRef.current.value = '';
  };

  // 引号感知的 CSV 行解析：正确处理字段中包含逗号的情况
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result.map((c) => c.trim().replace(/^"|"$/g, ''));
  };

  const confirmImport = async () => {
    if (importPreview.length < 2) return;
    setImporting(true);
    const header = importPreview[0];
    const dataRows = importPreview.slice(1);

    // 解析表头索引
    const idx = (keywords: string[]) => {
      return header.findIndex((h) => keywords.some((kw) => h.includes(kw)));
    };
    const nameIdx = idx(['菜品名称', 'name']);
    const catIdx = idx(['分类', 'category']);
    const calIdx = idx(['热量', 'calories']);
    const proIdx = idx(['蛋白质', 'protein']);
    const fatIdx = idx(['脂肪', 'fat']);
    const carbIdx = idx(['碳水', 'carbs']);
    const methodIdx = idx(['烹饪', 'method']);
    const nutIdx = idx(['营养', 'nutrition']);
    const contraIdx = idx(['禁忌', 'contraindications']);

    // 构建分类名 → 分类对象的模糊匹配映射（trim + 大小写不敏感）
    const catMap = new Map<string, DishCategory>();
    categories.forEach((c) => {
      catMap.set(c.name.trim().toLowerCase(), c);
    });

    // 提前收集现有菜品名称集合，用于去重
    const existingNames = new Set(dishes.map((d) => d.name));

    const successDishes: string[] = [];
    const skipDishes: string[] = [];
    const failDetails: { name: string; reason: string }[] = [];

    for (const row of dataRows) {
      const dishName = (row[nameIdx] || '').trim();
      if (!dishName) continue;

      // 去重：同名菜品跳过
      if (existingNames.has(dishName)) {
        skipDishes.push(dishName);
        continue;
      }

      // 分类匹配：trim + 大小写不敏感
      const rawCat = (row[catIdx] || '').trim();
      const catKey = rawCat.toLowerCase();
      const cat = catMap.get(catKey);

      if (!cat) {
        failDetails.push({
          name: dishName,
          reason: rawCat
            ? `分类「${rawCat}」不存在（可用分类：${categories.map((c) => c.name).join('、')}）`
            : '未填写分类',
        });
        continue;
      }

      const result = await addDish({
        name: dishName,
        category_id: cat.id,
        status: 'active',
        price: 0,
        calories: Number(row[calIdx]) || 0,
        protein: Number(row[proIdx]) || 0,
        fat: Number(row[fatIdx]) || 0,
        carbs: Number(row[carbIdx]) || 0,
        fiber: 0,
        method: row[methodIdx] || '',
        nutrition: row[nutIdx] || '',
        contraindications: row[contraIdx] || '',
      }, { skipRefetch: true });

      if (result.success) {
        successDishes.push(dishName);
        existingNames.add(dishName);
      } else {
        failDetails.push({ name: dishName, reason: result.error || '数据库写入失败' });
      }
    }

    // 全部导入完成后一次性刷新列表
    await refetch();

    // MQTT 实时推送
    const isElectronEnv = !!(window as any).electronAPI;
    if (isElectronEnv) {
      const api = (window as any).electronAPI;
      if (api?.mqttPushDishesUpdate) {
        api.mqttPushDishesUpdate().catch(() => {});
      }
    }

    setImporting(false);
    setShowImport(false);
    setImportPreview([]);

    // 汇总提示
    const parts: string[] = [];
    if (successDishes.length > 0) parts.push(`成功 ${successDishes.length} 道`);
    if (skipDishes.length > 0) parts.push(`跳过 ${skipDishes.length} 道（重复）`);
    if (failDetails.length > 0) parts.push(`失败 ${failDetails.length} 道`);
    addToast(
      successDishes.length > 0 && failDetails.length === 0 ? 'success' : 'error',
      `导入完成：${parts.join('，')}`,
    );

    // 有失败时，弹出详细报告
    if (failDetails.length > 0) {
      setImportReport({ successDishes, skipDishes, failDetails });
      setShowImportReport(true);
    }
  };

  const downloadTemplate = () => {
    const sampleCategories = categories.length >= 2
      ? `${categories[0].name},${categories[1].name}`
      : '热菜,素菜';
    const csv = `\uFEFF菜品名称,分类,热量(kcal),蛋白质(g),脂肪(g),碳水(g),烹饪方法,营养说明,饮食禁忌\n示例菜1,${sampleCategories}\n示例菜2,${sampleCategories}`;
    const isElectron = !!(window as any).electronAPI;
    if (isElectron) {
      const base64 = btoa(unescape(encodeURIComponent(csv)));
      const link = document.createElement('a');
      link.href = `data:text/csv;charset=utf-8;base64,${base64}`;
      link.download = '菜品导入模板.csv';
      link.click();
    } else {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '菜品导入模板.csv';
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <AppLayout title="菜品信息管理" breadcrumb={['餐饮管理', '菜品信息管理']}>
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm pointer-events-auto transition-all ${
              t.type === 'success' ? 'bg-emerald-50 border border-emerald-100 text-emerald-700' : 'bg-red-50 border border-red-100 text-red-600'
            }`}>
            <i className={t.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
            {t.msg}
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-[260px]">
            <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input
              type="text" placeholder="搜索菜品..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
            />
          </div>

          {/* Category filter */}
          <select
            value={categoryFilter ?? ''}
            onChange={(e) => setCategoryFilter(e.target.value ? Number(e.target.value) : null)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-slate-400 cursor-pointer"
          >
            <option value="">全部分类</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-slate-400 cursor-pointer"
          >
            <option value="全部">全部状态</option>
            <option value="active">上架中</option>
            <option value="inactive">已下架</option>
          </select>

          <div className="flex-1" />

          {/* Batch delete - only show when items selected */}
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setBatchDeleteTarget(Array.from(selectedIds))}
              className="flex items-center gap-1 text-sm border border-red-200 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-delete-bin-line mr-1" />删除选中 ({selectedIds.size})
            </button>
          )}

          {/* Export */}
          <button
            type="button" disabled={exporting} onClick={() => handleExportAll()}
            className="flex items-center gap-1 text-sm border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            {exporting ? <><i className="ri-loader-4-line animate-spin" />导出中</> : <><i className="ri-download-2-line" />导出全部</>}
          </button>

          {/* Import */}
          <button
            type="button" onClick={downloadTemplate}
            className="text-sm border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-download-2-line mr-1" />模板
          </button>
          <label className="flex items-center gap-1 text-sm border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">
            <i className="ri-upload-2-line mr-1" />批量导入
            <input ref={importFileRef} type="file" accept=".csv" onChange={handleImportFile} className="hidden" />
          </label>

          {/* Add */}
          <button
            type="button" onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 text-sm bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line" />添加菜品
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
            <p className="text-sm mb-3">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <i className="ri-inbox-2-line text-3xl mb-2" />
            <p className="text-sm">暂无菜品数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-center text-xs font-medium text-slate-500 px-2 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded border-slate-300 cursor-pointer accent-rose-500"
                    />
                  </th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 w-12">序号</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 w-16">图片</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">菜品名称</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">分类</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">状态</th>
                  <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">热量</th>
                  <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">蛋白质</th>
                  <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">脂肪</th>
                  <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">碳水</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-2 py-3 w-20">口味</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-2 py-3 w-20">功效</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-2 py-3 w-20">烹饪方法</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-2 py-3 w-20">营养说明</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-2 py-3 w-20">饮食禁忌</th>
                  <th className="text-center text-xs font-medium text-slate-500 px-4 py-3 w-24">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((dish, idx) => {
                  const isEditing = editingId === dish.id;
                  return (
                    <tr key={dish.id} className={`hover:bg-slate-50/50 transition-colors ${isEditing ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-2 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(dish.id)}
                          onChange={() => toggleSelect(dish.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 cursor-pointer accent-rose-500"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <div>
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 mb-1">
                              <img src={editImgPreview || dish.img || ''} alt="" className="w-full h-full object-cover object-top" />
                            </div>
                            <button
                              type="button"
                              onClick={() => editFileInputRef.current?.click()}
                              className="text-[10px] text-amber-600 hover:text-amber-700 cursor-pointer whitespace-nowrap"
                            >
                              换图
                            </button>
                            <input ref={editFileInputRef} type="file" accept="image/*" onChange={handleEditImageChange} className="hidden" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                            {dish.img ? (
                              <img src={dish.img} alt={dish.name} className="w-full h-full object-cover object-top" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-300"><i className="ri-bowl-line" /></div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing && editForm ? (
                          <input value={editForm.name} onChange={(e) => setEF('name', e.target.value)}
                            className="text-sm font-medium text-slate-800 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-amber-400 w-28" />
                        ) : (
                          <span className="text-slate-800 font-medium">{dish.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing && editForm ? (
                          <select value={editForm.category_id} onChange={(e) => setEF('category_id', Number(e.target.value))}
                            className="text-xs border border-slate-200 rounded px-1.5 py-1 cursor-pointer">
                            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{dish.category}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing && editForm ? (
                          <button type="button" onClick={() => setEF('status', editForm.status === 'active' ? 'inactive' : 'active')}
                            className={`text-xs px-2 py-0.5 rounded-full cursor-pointer ${editForm.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            {editForm.status === 'active' ? '上架中' : '已下架'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={togglingId === dish.id}
                            onClick={() => toggleStatus(dish)}
                            className={`text-xs px-2 py-0.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${
                              dish.status === 'active'
                                ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            {togglingId === dish.id ? (
                              <i className="ri-loader-4-line animate-spin" />
                            ) : dish.status === 'active' ? (
                              '上架中'
                            ) : (
                              '已下架'
                            )}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isEditing && editForm ? (
                          <input type="number" min="0" value={editForm.calories} onChange={(e) => setEF('calories', e.target.value)}
                            className="text-xs text-slate-600 border border-slate-200 rounded px-1.5 py-1 w-16 text-right" />
                        ) : (
                          <span className="text-slate-600">{dish.calories}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isEditing && editForm ? (
                          <input type="number" min="0" value={editForm.protein} onChange={(e) => setEF('protein', e.target.value)}
                            className="text-xs text-slate-600 border border-slate-200 rounded px-1.5 py-1 w-16 text-right" />
                        ) : (
                          <span className="text-slate-600">{dish.protein}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isEditing && editForm ? (
                          <input type="number" min="0" value={editForm.fat} onChange={(e) => setEF('fat', e.target.value)}
                            className="text-xs text-slate-600 border border-slate-200 rounded px-1.5 py-1 w-16 text-right" />
                        ) : (
                          <span className="text-slate-600">{dish.fat}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isEditing && editForm ? (
                          <input type="number" min="0" value={editForm.carbs} onChange={(e) => setEF('carbs', e.target.value)}
                            className="text-xs text-slate-600 border border-slate-200 rounded px-1.5 py-1 w-16 text-right" />
                        ) : (
                          <span className="text-slate-600">{dish.carbs}</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5" title={dish.taste}>
                        <span className="text-xs text-slate-500 line-clamp-1 max-w-[72px]">{dish.taste || '-'}</span>
                      </td>
                      <td className="px-2 py-2.5" title={dish.effect}>
                        <span className="text-xs text-slate-500 line-clamp-1 max-w-[72px]">{dish.effect || '-'}</span>
                      </td>
                      <td className="px-2 py-2.5" title={dish.method}>
                        <span className="text-xs text-slate-500 line-clamp-1 max-w-[72px]">{dish.method || '-'}</span>
                      </td>
                      <td className="px-2 py-2.5" title={dish.nutrition}>
                        <span className="text-xs text-slate-500 line-clamp-1 max-w-[72px]">{dish.nutrition || '-'}</span>
                      </td>
                      <td className="px-2 py-2.5" title={dish.contraindications}>
                        <span className="text-xs text-slate-500 line-clamp-1 max-w-[72px]">{dish.contraindications || '-'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <button type="button" onClick={saveEdit} disabled={saving}
                              className="text-xs bg-emerald-500 text-white px-2 py-1 rounded hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-50">
                              {saving ? '...' : '保存'}
                            </button>
                            <button type="button" onClick={cancelEdit}
                              className="text-xs border border-slate-200 text-slate-500 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button type="button" onClick={() => startEdit(dish)}
                              className="text-xs border border-slate-200 text-slate-500 px-2 py-1 rounded hover:bg-slate-100 cursor-pointer whitespace-nowrap">
                              <i className="ri-edit-line" />
                            </button>
                            <button type="button" onClick={() => setDeleteTarget(dish)}
                              className="text-xs border border-red-100 text-red-400 px-2 py-1 rounded hover:bg-red-50 cursor-pointer whitespace-nowrap">
                              <i className="ri-delete-bin-line" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Inline edit fields for selected row */}
            {editingId && editForm && (
              <div className="border-t border-slate-100 bg-amber-50/20 px-4 py-3">
                <p className="text-xs font-medium text-slate-500 mb-2">编辑详细信息</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">口味标签 <span className="text-slate-300">(逗号分隔)</span></label>
                    <input value={editForm.taste} onChange={(e) => setEF('taste', e.target.value)}
                      placeholder="如：咸甜,浓香"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-400" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">功效说明 <span className="text-slate-300">(逗号分隔)</span></label>
                    <input value={editForm.effect} onChange={(e) => setEF('effect', e.target.value)}
                      placeholder="如：补铁补血,增强体力"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-400" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">烹饪方法</label>
                    <textarea value={editForm.method} onChange={(e) => setEF('method', e.target.value)}
                      rows={2} maxLength={500}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-400 resize-none" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">营养说明</label>
                    <textarea value={editForm.nutrition} onChange={(e) => setEF('nutrition', e.target.value)}
                      rows={2} maxLength={500}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-400 resize-none" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">饮食禁忌</label>
                    <textarea value={editForm.contraindications} onChange={(e) => setEF('contraindications', e.target.value)}
                      rows={2} maxLength={500}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-400 resize-none" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl p-6 w-80">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50">
                <i className="ri-delete-bin-line text-red-500 text-lg" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">确认删除</p>
                <p className="text-xs text-slate-500 mt-0.5">将永久删除「{deleteTarget.name}」</p>
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

      {/* Batch Delete confirm */}
      {batchDeleteTarget && batchDeleteTarget.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl p-6 w-96">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50">
                <i className="ri-delete-bin-line text-red-500 text-lg" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">批量删除确认</p>
                <p className="text-xs text-slate-500 mt-0.5">将永久删除选中的 {batchDeleteTarget.length} 道菜品，此操作不可撤销</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setBatchDeleteTarget(null)}
                className="flex-1 text-sm border border-slate-200 text-slate-600 rounded-lg py-2 hover:bg-slate-50 cursor-pointer whitespace-nowrap">取消</button>
              <button type="button" onClick={handleBatchDelete} disabled={batchDeleting}
                className="flex-1 text-sm bg-red-500 text-white rounded-lg py-2 hover:bg-red-600 cursor-pointer whitespace-nowrap disabled:opacity-50 flex items-center justify-center gap-1">
                {batchDeleting && <i className="ri-loader-4-line animate-spin" />}确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddDishModal categories={categories} onClose={() => setShowAddModal(false)} onAdd={handleAddDish} />
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl p-6 w-[640px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">批量导入预览</h3>
              <button type="button" onClick={() => { setShowImport(false); setImportPreview([]); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer">
                <i className="ri-close-line text-slate-400" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">共 {importPreview.length - 1} 条数据，请确认后导入</p>
            <div className="flex-1 overflow-auto mb-4 border border-slate-100 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    {importPreview[0].map((h, i) => (
                      <th key={i} className="text-left px-3 py-2 text-slate-500 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {importPreview.slice(1).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-1.5 text-slate-700">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowImport(false); setImportPreview([]); }}
                className="text-sm border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                取消
              </button>
              <button type="button" onClick={confirmImport} disabled={importing}
                className="text-sm bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-50 flex items-center gap-1.5">
                {importing && <i className="ri-loader-4-line animate-spin" />}确认导入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Report Modal — 失败详情 */}
      {showImportReport && importReport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl p-6 w-[560px] max-h-[75vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">
                导入结果报告
              </h3>
              <button
                type="button"
                onClick={() => { setShowImportReport(false); setImportReport(null); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <i className="ri-close-line text-slate-400" />
              </button>
            </div>

            {/* 汇总 */}
            <div className="flex gap-3 mb-4">
              {importReport.successDishes.length > 0 && (
                <div className="flex-1 bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{importReport.successDishes.length}</p>
                  <p className="text-xs text-emerald-500">成功导入</p>
                </div>
              )}
              {importReport.skipDishes.length > 0 && (
                <div className="flex-1 bg-amber-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{importReport.skipDishes.length}</p>
                  <p className="text-xs text-amber-500">跳过（重复）</p>
                </div>
              )}
              <div className="flex-1 bg-red-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-red-500">{importReport.failDetails.length}</p>
                <p className="text-xs text-red-400">导入失败</p>
              </div>
            </div>

            {/* 失败详情列表 */}
            {importReport.failDetails.length > 0 && (
              <>
                <p className="text-xs font-medium text-slate-500 mb-2">
                  失败原因详情（共 {importReport.failDetails.length} 道）
                </p>
                <div className="flex-1 overflow-auto border border-slate-100 rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 sticky top-0">
                        <th className="text-left px-3 py-2 text-slate-500 font-medium">菜品名称</th>
                        <th className="text-left px-3 py-2 text-slate-500 font-medium">失败原因</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {importReport.failDetails.map((f, i) => (
                        <tr key={i} className="hover:bg-red-50/30">
                          <td className="px-3 py-1.5 text-slate-700 font-medium whitespace-nowrap">{f.name}</td>
                          <td className="px-3 py-1.5 text-red-500">{f.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => { setShowImportReport(false); setImportReport(null); }}
                className="text-sm bg-slate-700 text-white px-5 py-2 rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  );
}