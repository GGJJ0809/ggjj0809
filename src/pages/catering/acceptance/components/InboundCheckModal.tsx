import { useState, useEffect, useRef, useCallback } from 'react';
import { useScaleConfig } from '@/hooks/useScaleConfig';
import { supabase } from '@/lib/supabase';
import PhotoCapture, { type PhotoItem } from '@/components/base/PhotoCapture';
import {
  fetchWarehouseList,
  extractWarehouses,
  getWarehouseName,
  getWarehouseId,
  fetchSupplierList,
  extractSuppliers,
  getSupplierName,
  fetchMaterialPage,
  extractMaterialPage,
  getMaterialSearchName,
  type WarehouseItem,
  type DrpSupplierItem,
  type MaterialSearchItem,
  type IntoDetailItem,
} from '@/services/scaleApi';

// ─── 入库方式 ───
const INBOUND_METHODS = [
  { value: 1, label: '称重入库', icon: 'ri-scales-line' },
  { value: 2, label: '按件入库', icon: 'ri-box-3-line' },
  { value: 3, label: '按箱入库', icon: 'ri-archive-line' },
];

// ─── 验货单项 ───
export interface InspectionItem {
  id: string;
  materialId?: number;
  materialName: string;
  materialCode?: string;
  unitName: string;
  warehouseId?: number;
  warehouseName: string;
  inboundMethod: number;
  inboundMethodLabel: string;
  supplierId?: number;
  supplierName: string;
  unitPrice: number;
  quantity: number;
  planQuantity?: number;
  photos: PhotoItem[];
  qualityReportPhotos: PhotoItem[];
  inspector?: string;
  notes?: string;
}

interface Props {
  onClose: () => void;
  onSubmitInbound: (items: InspectionItem[], params: { warehouseId: number; canteenId?: number; fetchUserId?: number }) => Promise<void>;
  initialMode?: 'manual' | 'ai';
  aiRecognizedName?: string;
}

export default function InboundCheckModal({ onClose, onSubmitInbound, initialMode = 'manual', aiRecognizedName }: Props) {
  const { config, isConfigured } = useScaleConfig();

  // ─── 模式 & 步骤 ───
  const [mode, setMode] = useState<'manual' | 'ai'>(initialMode);
  const [step, setStep] = useState<'form' | 'photos' | 'summary'>('form');
  const [inspector, setInspector] = useState('');

  // ★ 模式/步骤切换诊断日志
  useEffect(() => {
    console.log('[InboundCheck-Lifecycle] ★ 弹窗打开 | mode=' + mode + ' | step=' + step + ' | initialMode=' + initialMode + ' | aiRecognizedName=' + (aiRecognizedName || '(空)'));
  }, []);
  useEffect(() => {
    console.log('[InboundCheck-Mode] ▸ 切换到: ' + mode);
  }, [mode]);
  useEffect(() => {
    console.log('[InboundCheck-Step] ▸ 步骤切换: ' + step + ' | 验货单=' + inspectionList.length + '项');
  }, [step]);

  // ─── 仓库列表 ───
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | undefined>();

  // ─── DRP 供应商 ───
  const [drpSuppliers, setDrpSuppliers] = useState<DrpSupplierItem[]>([]);
  const [drpSuppliersLoading, setDrpSuppliersLoading] = useState(false);

  // ─── 入库方式 ───
  const [inboundMethod, setInboundMethod] = useState(1);

  // ─── 货品搜索（手动模式） ───
  const [searchKeyword, setSearchKeyword] = useState(aiRecognizedName ?? '');
  const [searchResults, setSearchResults] = useState<MaterialSearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialSearchItem | null>(null);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── 当前编辑项 ───
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | undefined>();
  const [supplierInput, setSupplierInput] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const supplierRef = useRef<HTMLDivElement>(null);
  const [planQuantity, setPlanQuantity] = useState('');

  // ─── 验货单 ───
  const [inspectionList, setInspectionList] = useState<InspectionItem[]>([]);

  // ─── 照片 ───
  const [productPhotos, setProductPhotos] = useState<PhotoItem[]>([]);
  const [reportPhotos, setReportPhotos] = useState<PhotoItem[]>([]);

  // ─── 操作状态 ───
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 加载仓库列表
  useEffect(() => {
    console.log('[InboundCheck-Warehouse] ━━━ 开始加载仓库列表 ━━━');
    console.log('[InboundCheck-Warehouse] isConfigured=' + isConfigured + ', baseUrl=' + (config?.baseUrl || '(空)'));
    if (!isConfigured) { console.warn('[InboundCheck-Warehouse] ★ 未配置电子秤，跳过仓库加载'); return; }
    setWarehousesLoading(true);
    fetchWarehouseList(config)
      .then((resp) => {
        const list = extractWarehouses(resp);
        console.log('[InboundCheck-Warehouse] ★ 仓库列表加载成功: ' + list.length + ' 个仓库');
        list.forEach((w, i) => console.log('[InboundCheck-Warehouse]   [' + i + '] id=' + getWarehouseId(w) + ', name=' + getWarehouseName(w)));
        setWarehouses(list);
        if (list.length > 0) {
          const firstId = getWarehouseId(list[0]);
          setSelectedWarehouseId(firstId);
          console.log('[InboundCheck-Warehouse] 默认选中仓库: id=' + firstId + ', name=' + getWarehouseName(list[0]));
        } else {
          console.warn('[InboundCheck-Warehouse] ★★★ 仓库列表为空！');
        }
      })
      .catch((e) => { console.error('[InboundCheck-Warehouse] ★★★ 仓库加载失败: ' + (e instanceof Error ? e.message : String(e))); })
      .finally(() => setWarehousesLoading(false));
  }, [config, isConfigured]);

  // 加载 DRP 供应商
  useEffect(() => {
    console.log('[InboundCheck-Supplier] ━━━ 开始加载DRP供应商 ━━━');
    if (!isConfigured) { console.warn('[InboundCheck-Supplier] ★ 未配置电子秤，跳过供应商加载'); return; }
    setDrpSuppliersLoading(true);
    fetchSupplierList(config)
      .then((resp) => {
        const list = extractSuppliers(resp);
        console.log('[InboundCheck-Supplier] ★ 供应商加载成功: ' + list.length + ' 个');
        list.slice(0, 5).forEach((s, i) => console.log('[InboundCheck-Supplier]   [' + i + '] id=' + (s.supplierId || s.id) + ', name=' + getSupplierName(s)));
        if (list.length > 5) console.log('[InboundCheck-Supplier]   ... 还有 ' + (list.length - 5) + ' 个');
        setDrpSuppliers(list);
      })
      .catch((e) => { console.error('[InboundCheck-Supplier] ★★★ 供应商加载失败: ' + (e instanceof Error ? e.message : String(e))); })
      .finally(() => setDrpSuppliersLoading(false));
  }, [config, isConfigured]);

  // AI 识别模式自动搜索
  useEffect(() => {
    if (mode === 'ai' && aiRecognizedName) {
      doMaterialSearch(aiRecognizedName);
    }
  }, [mode, aiRecognizedName]);

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setShowSupplierDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 货品搜索
  const doMaterialSearch = useCallback((kw: string) => {
    console.log('[InboundCheck-Search] ━━━ 搜索货品 ━━━ keyword="' + kw + '", isConfigured=' + isConfigured);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!kw.trim() || !isConfigured) {
      console.log('[InboundCheck-Search] 跳过搜索: keyword为空或未配置');
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError('');
      const reqId = Math.random().toString(36).slice(2, 8);
      console.log('[InboundCheck-Search] [req=' + reqId + '] 发起API请求: materialInfo="' + kw.trim() + '", size=8');
      try {
        const resp = await fetchMaterialPage(config, {
          current: 1,
          size: 8,
          materialInfo: kw.trim(),
        });
        const pageData = extractMaterialPage(resp);
        console.log('[InboundCheck-Search] [req=' + reqId + '] API返回: ' + (pageData.records ?? []).length + ' 条, total=' + (pageData.total ?? '?'));
        (pageData.records ?? []).forEach((r, i) => {
          if (i < 8) console.log('[InboundCheck-Search] [req=' + reqId + ']   [' + i + '] id=' + r.materialId + ', name=' + getMaterialSearchName(r) + ', unit=' + r.unitName + ', price=' + r.unitPrice);
        });
        setSearchResults(pageData.records ?? []);
        if ((pageData.records ?? []).length > 0) {
          console.log('[InboundCheck-Search] [req=' + reqId + '] ✓ 显示搜索结果下拉');
          setShowSearchDropdown(true);
        } else {
          console.warn('[InboundCheck-Search] [req=' + reqId + '] ★ 搜索结果为空');
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : '搜索失败';
        console.error('[InboundCheck-Search] [req=' + reqId + '] ★★★ 搜索异常: ' + errMsg);
        setSearchError(errMsg);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }, [config, isConfigured]);

  // 选择货品
  const handleSelectMaterial = (item: MaterialSearchItem) => {
    console.log('[InboundCheck-Select] ━━━ 选择货品 ━━━');
    console.log('[InboundCheck-Select] materialId=' + item.materialId + ', name=' + getMaterialSearchName(item));
    console.log('[InboundCheck-Select] unitName=' + item.unitName + ', unitPrice=' + item.unitPrice + ', categoryName=' + item.categoryName);
    console.log('[InboundCheck-Select] materialCode=' + item.materialCode + ', barCode=' + item.barCode);
    setSelectedMaterial(item);
    setShowSearchDropdown(false);
    setSearchKeyword(getMaterialSearchName(item));
    // 自动填充单价（DRP返回分为单位，转为元）
    if ((item as Record<string, unknown>).unitPrice != null) {
      const priceInYuan = (Number((item as Record<string, unknown>).unitPrice) / 100).toFixed(2);
      setUnitPrice(priceInYuan);
      console.log('[InboundCheck-Select] 自动填充单价: ' + (item as Record<string, unknown>).unitPrice + '分 = ¥' + priceInYuan);
    } else {
      console.log('[InboundCheck-Select] 货品无单价，需手动输入');
    }
    setError('');
  };

  // 添加到验货单
  const handleAddToInspection = () => {
    console.log('[InboundCheck-AddToList] ━━━ 加入验货单 ━━━');
    console.log('[InboundCheck-AddToList] 当前状态: selectedMaterial=' + !!selectedMaterial + ', quantity=' + quantity + ', warehouseId=' + selectedWarehouseId);
    console.log('[InboundCheck-AddToList] supplierInput=' + supplierInput + ', supplierId=' + selectedSupplierId + ', unitPrice=' + unitPrice);
    console.log('[InboundCheck-AddToList] inboundMethod=' + inboundMethod + ', inspector=' + inspector + ', planQuantity=' + planQuantity);
    console.log('[InboundCheck-AddToList] productPhotos=' + productPhotos.length + '张, reportPhotos=' + reportPhotos.length + '张');

    if (!selectedMaterial) { console.warn('[InboundCheck-AddToList] ★★★ 未选择货品'); setError('请先搜索并选择货品'); return; }
    if (!quantity || parseFloat(quantity) <= 0) { console.warn('[InboundCheck-AddToList] ★★★ 数量无效: ' + quantity); setError('请输入有效数量'); return; }
    if (!selectedWarehouseId) { console.warn('[InboundCheck-AddToList] ★★★ 未选择仓库'); setError('请选择仓库'); return; }
    setError('');

    const method = INBOUND_METHODS.find((m) => m.value === inboundMethod) ?? INBOUND_METHODS[0];
    const warehouseName = warehouses.find((w) => getWarehouseId(w) === selectedWarehouseId)
      ? getWarehouseName(warehouses.find((w) => getWarehouseId(w) === selectedWarehouseId)!)
      : `仓库 #${selectedWarehouseId}`;

    const item: InspectionItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      materialId: selectedMaterial.materialId,
      materialName: getMaterialSearchName(selectedMaterial),
      materialCode: selectedMaterial.materialCode,
      unitName: selectedMaterial.unitName ?? 'kg',
      warehouseId: selectedWarehouseId,
      warehouseName,
      inboundMethod,
      inboundMethodLabel: method.label,
      supplierId: selectedSupplierId,
      supplierName: supplierInput || getSupplierName(drpSuppliers.find((s) => s.supplierId === selectedSupplierId || s.id === selectedSupplierId) ?? {} as DrpSupplierItem),
      unitPrice: parseFloat(unitPrice) || 0,
      quantity: parseFloat(quantity),
      planQuantity: planQuantity ? parseFloat(planQuantity) : undefined,
      photos: [...productPhotos],
      qualityReportPhotos: [...reportPhotos],
      inspector: inspector.trim() || undefined,
    };

    console.log('[InboundCheck-AddToList] ✓ 验货单项已构建:');
    console.log('[InboundCheck-AddToList]   id=' + item.id + ', material=' + item.materialName + ', materialId=' + item.materialId);
    console.log('[InboundCheck-AddToList]   warehouse=' + item.warehouseName + '(' + item.warehouseId + '), method=' + item.inboundMethodLabel);
    console.log('[InboundCheck-AddToList]   supplier=' + item.supplierName + '(' + item.supplierId + '), unitPrice=' + item.unitPrice + ', quantity=' + item.quantity);
    console.log('[InboundCheck-AddToList]   unit=' + item.unitName + ', planQuantity=' + item.planQuantity + ', inspector=' + item.inspector);
    console.log('[InboundCheck-AddToList]   photos=' + item.photos.length + '张, reportPhotos=' + item.qualityReportPhotos.length + '张');

    setInspectionList((prev) => {
      const updated = [...prev, item];
      console.log('[InboundCheck-AddToList] 验货单当前共 ' + updated.length + ' 项');
      return updated;
    });

    // 重置表单
    console.log('[InboundCheck-AddToList] 重置表单，跳转到拍照步骤');
    setSelectedMaterial(null);
    setSearchKeyword('');
    setQuantity('');
    setUnitPrice('');
    setPlanQuantity('');
    setSelectedSupplierId(undefined);
    setSupplierInput('');
    setProductPhotos([]);
    setReportPhotos([]);
    setError('');

    setStep('photos');
    setSuccessMsg(`「${item.materialName}」已加入验货单（共 ${inspectionList.length + 1} 项）`);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // 删除验货单项
  const handleRemoveItem = (id: string) => {
    const item = inspectionList.find((i) => i.id === id);
    console.log('[InboundCheck-Remove] ▸ 删除验货单项: id=' + id + ', material=' + (item?.materialName || '?'));
    setInspectionList((prev) => {
      const updated = prev.filter((i) => i.id !== id);
      console.log('[InboundCheck-Remove] 剩余 ' + updated.length + ' 项');
      return updated;
    });
  };

  // 查看验货单项的照片
  const [viewingItem, setViewingItem] = useState<InspectionItem | null>(null);

  const handleViewPhotos = (item: InspectionItem) => {
    console.log('[InboundCheck-ViewPhotos] ▸ 查看照片: material=' + item.materialName + ', photos=' + item.photos.length + ', report=' + item.qualityReportPhotos.length);
    setViewingItem(item);
  };

  // 确认入库
  const handleConfirmInbound = async () => {
    console.log('[InboundCheck-Confirm] ━━━ 确认入库 ━━━');
    console.log('[InboundCheck-Confirm] 验货单项数: ' + inspectionList.length + ', warehouseId: ' + selectedWarehouseId);
    inspectionList.forEach((item, i) => {
      console.log('[InboundCheck-Confirm]   [' + i + '] material=' + item.materialName + ', qty=' + item.quantity + item.unitName + ', price=' + item.unitPrice + ', supplier=' + item.supplierName + ', photos=' + item.photos.length + ', report=' + item.qualityReportPhotos.length);
    });

    if (inspectionList.length === 0) { console.warn('[InboundCheck-Confirm] ★★★ 验货单为空'); setError('验货单为空，请先添加货品'); return; }
    if (!selectedWarehouseId) { console.warn('[InboundCheck-Confirm] ★★★ 未选择仓库'); setError('请选择仓库'); return; }

    setSubmitting(true);
    setError('');
    const submitId = Math.random().toString(36).slice(2, 8);
    console.log('[InboundCheck-Confirm] [submit=' + submitId + '] 开始调用 onSubmitInbound...');
    try {
      await onSubmitInbound(inspectionList, {
        warehouseId: selectedWarehouseId,
      });
      console.log('[InboundCheck-Confirm] [submit=' + submitId + '] ✓ 入库提交成功，关闭弹窗');
      onClose();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '入库提交失败';
      console.error('[InboundCheck-Confirm] [submit=' + submitId + '] ★★★ 入库提交失败: ' + errMsg);
      setError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  // 获取当前仓库名
  const currentWarehouseName = selectedWarehouseId
    ? getWarehouseName(warehouses.find((w) => getWarehouseId(w) === selectedWarehouseId) ?? {})
    : '';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-3xl flex flex-col max-h-[94vh]" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50">
              <i className="ri-shopping-bag-3-line text-emerald-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">验货入库</h3>
              <p className="text-xs text-slate-400">
                验货单 {inspectionList.length > 0 ? `（${inspectionList.length} 项）` : ''}
              </p>
            </div>
          </div>

          {/* Mode tabs */}
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`text-xs px-3 py-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                  mode === 'manual' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                按货品入库
              </button>
              <button
                type="button"
                onClick={() => setMode('ai')}
                className={`text-xs px-3 py-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                  mode === 'ai' ? 'bg-amber-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                <i className="ri-brain-line mr-1" />AI 识别
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"
            >
              <i className="ri-close-line text-slate-500" />
            </button>
          </div>
        </div>

        {/* ── Messages ── */}
        {successMsg && (
          <div className="mx-6 mt-3 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            <i className="ri-checkbox-circle-fill" />{successMsg}
          </div>
        )}
        {error && (
          <div className="mx-6 mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <i className="ri-error-warning-line" />{error}
          </div>
        )}

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── 步骤 1: 表单 ── */}
          {step === 'form' && (
            <>
              {/* 仓库 & 入库方式 */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    <i className="ri-store-2-line mr-1 text-slate-400" />仓库 <span className="text-red-400">*</span>
                  </label>
                  {warehousesLoading ? (
                    <div className="text-xs text-slate-400 py-2"><i className="ri-loader-4-line animate-spin mr-1" />加载中...</div>
                  ) : (
                    <select
                      value={selectedWarehouseId ?? ''}
                      onChange={(e) => setSelectedWarehouseId(e.target.value ? Number(e.target.value) : undefined)}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white cursor-pointer"
                    >
                      {warehouses.length === 0 && <option value="">无可用仓库</option>}
                      {warehouses.map((w) => (
                        <option key={getWarehouseId(w)} value={getWarehouseId(w)}>
                          {getWarehouseName(w)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    <i className="ri-swap-line mr-1 text-slate-400" />入库方式
                  </label>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                    {INBOUND_METHODS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setInboundMethod(m.value)}
                        className={`flex-1 text-xs py-2 cursor-pointer whitespace-nowrap transition-colors ${
                          inboundMethod === m.value
                            ? 'bg-slate-800 text-white'
                            : 'bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    <i className="ri-user-line mr-1 text-slate-400" />验收员
                  </label>
                  <input
                    type="text"
                    value={inspector}
                    onChange={(e) => setInspector(e.target.value)}
                    placeholder="姓名"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              {/* ── 手动模式：货品搜索 ── */}
              {mode === 'manual' && (
                <div ref={searchRef} className="relative">
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    <i className="ri-search-line mr-1 text-slate-400" />搜索货品 <span className="text-red-400">*</span>
                    <span className="text-slate-400 font-normal ml-1">（输入名称或首字母）</span>
                  </label>
                  <div className="relative">
                    <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                    <input
                      type="text"
                      value={searchKeyword}
                      onChange={(e) => {
                        setSearchKeyword(e.target.value);
                        setSelectedMaterial(null);
                        doMaterialSearch(e.target.value);
                      }}
                      onFocus={() => { if (searchResults.length > 0) setShowSearchDropdown(true); }}
                      placeholder="输入货品首拼或名称搜索..."
                      disabled={!isConfigured}
                      className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-10 py-2.5 focus:outline-none focus:border-slate-400 disabled:bg-slate-50"
                    />
                    {searchLoading && (
                      <i className="ri-loader-4-line animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                    )}
                  </div>

                  {/* 搜索结果下拉 */}
                  {showSearchDropdown && searchResults.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto shadow-lg">
                      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                        <span className="text-xs text-slate-400">搜索结果（{searchResults.length} 条）</span>
                      </div>
                      {searchResults.map((item, idx) => (
                        <button
                          key={item.materialId ?? idx}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectMaterial(item)}
                          className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between border-b border-slate-50 ${
                            selectedMaterial?.materialId === item.materialId ? 'bg-emerald-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 flex items-center justify-center rounded-md bg-slate-100 flex-shrink-0">
                              <i className="ri-box-3-line text-slate-500 text-xs" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm text-slate-800 truncate">{getMaterialSearchName(item)}</p>
                              <p className="text-xs text-slate-400">
                                {item.materialCode && <span>编码：{item.materialCode}</span>}
                                {item.categoryName && <span className="ml-2">{item.categoryName}</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            {item.unitName && (
                              <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{item.unitName}</span>
                            )}
                            {(item as Record<string, unknown>).unitPrice != null && (
                              <span className="text-xs text-emerald-600">
                                ¥{(Number((item as Record<string, unknown>).unitPrice) / 100).toFixed(2)}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchError && <p className="text-xs text-red-500 mt-1">{searchError}</p>}
                </div>
              )}

              {/* ── AI 模式说明 ── */}
              {mode === 'ai' && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-amber-100">
                      <i className="ri-brain-line text-amber-600 text-sm" />
                    </div>
                    <p className="text-sm font-semibold text-amber-800">AI 自动识别入库</p>
                  </div>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    请先选择仓库、入库方式和供应商。然后将货品放置在电子秤上，点击下方「AI 识别」按钮，
                    系统将自动识别货品并填入信息。识别后请确认单价和数量。
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedWarehouseId) { setError('请先选择仓库'); return; }
                      setError('');
                      // 触发外部 AI 识别
                      const event = new CustomEvent('open-ai-recognition', { detail: { warehouseId: selectedWarehouseId } });
                      window.dispatchEvent(event);
                    }}
                    disabled={!isConfigured}
                    className="mt-3 flex items-center gap-1.5 text-sm bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    <i className="ri-brain-line" />AI 识别货品
                  </button>
                </div>
              )}

              {/* ── 选中货品后的详情 ── */}
              {selectedMaterial && (
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-100">
                      <i className="ri-checkbox-circle-fill text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">
                        {getMaterialSearchName(selectedMaterial)}
                      </p>
                      <p className="text-xs text-emerald-600">
                        {selectedMaterial.categoryName && `${selectedMaterial.categoryName} · `}
                        单位：{selectedMaterial.unitName ?? 'kg'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedMaterial(null); setSearchKeyword(''); }}
                      className="ml-auto text-xs text-emerald-600 hover:text-emerald-800 cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-close-line mr-0.5" />更换
                    </button>
                  </div>

                  {/* 供应商 + 单价 */}
                  <div className="grid grid-cols-3 gap-3">
                    <div ref={supplierRef} className="relative">
                      <label className="text-xs text-slate-500 mb-1 block">供应商</label>
                      <input
                        type="text"
                        value={supplierInput}
                        onChange={(e) => {
                          setSupplierInput(e.target.value);
                          setShowSupplierDropdown(true);
                          setSelectedSupplierId(undefined);
                        }}
                        onFocus={() => setShowSupplierDropdown(true)}
                        placeholder="输入或选择供应商"
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                      />
                      {showSupplierDropdown && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto shadow-lg">
                          {(supplierInput
                            ? drpSuppliers.filter((s) => getSupplierName(s).includes(supplierInput))
                            : drpSuppliers
                          ).map((s) => (
                            <button
                              key={s.supplierId ?? s.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setSupplierInput(getSupplierName(s));
                                setSelectedSupplierId((s.supplierId ?? s.id) as number | undefined);
                                setShowSupplierDropdown(false);
                              }}
                              className="w-full text-left text-sm px-4 py-2 hover:bg-slate-50 cursor-pointer text-slate-700"
                            >
                              {getSupplierName(s)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">单价（元）</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={unitPrice}
                        onChange={(e) => { setUnitPrice(e.target.value); setError(''); }}
                        placeholder="0.00"
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">数量 <span className="text-red-400">*</span></label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={quantity}
                        onChange={(e) => { setQuantity(e.target.value); setError(''); }}
                        placeholder="0"
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">计划数量（可选）</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={planQuantity}
                        onChange={(e) => setPlanQuantity(e.target.value)}
                        placeholder="采购订单数量"
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleAddToInspection}
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-1.5 text-sm bg-emerald-500 text-white py-2 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
                      >
                        {saving ? <><i className="ri-loader-4-line animate-spin" />保存中</> : <><i className="ri-check-line" />保存并加入验货单</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── 步骤 2: 拍照留存 ── */}
          {step === 'photos' && (
            <div className="space-y-4">
              {/* 当前货品信息提示 */}
              {inspectionList.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <i className="ri-shopping-bag-3-line text-slate-500" />
                    <span className="text-xs text-slate-600">
                      最后添加：<strong>{inspectionList[inspectionList.length - 1].materialName}</strong>
                      {' · '}{inspectionList[inspectionList.length - 1].quantity}{inspectionList[inspectionList.length - 1].unitName}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">验货单共 {inspectionList.length} 项</span>
                </div>
              )}

              {/* 货品拍照 */}
              <PhotoCapture
                title="货品拍照留存"
                description="请将货品放置在秤盘上，从不同角度拍照（建议不低于6张）"
                minPhotos={6}
                maxPhotos={10}
                photos={productPhotos}
                onAddPhoto={(p) => setProductPhotos((prev) => [...prev, p])}
                onDeletePhoto={(id) => setProductPhotos((prev) => prev.filter((p) => p.id !== id))}
                onClearAll={() => setProductPhotos([])}
              />

              {productPhotos.length < 6 && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <i className="ri-error-warning-line mr-1" />已拍摄 {productPhotos.length} 张，建议至少拍摄 6 张不同角度的照片
                </p>
              )}

              {/* 质检报告拍照 */}
              <div className="border-t border-slate-200 pt-4">
                <PhotoCapture
                  title="质检报告拍照"
                  description="请将质检报告放置到秤盘上拍照留存"
                  minPhotos={1}
                  maxPhotos={5}
                  photos={reportPhotos}
                  onAddPhoto={(p) => setReportPhotos((prev) => [...prev, p])}
                  onDeletePhoto={(id) => setReportPhotos((prev) => prev.filter((p) => p.id !== id))}
                  onClearAll={() => setReportPhotos([])}
                />
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    console.log('[InboundCheck-Continue] ▸ 继续录入 | 验货单=' + inspectionList.length + '项, productPhotos=' + productPhotos.length + ', reportPhotos=' + reportPhotos.length);
                    // 将照片关联到最后添加的项
                    if (inspectionList.length > 0) {
                      const lastIdx = inspectionList.length - 1;
                      setInspectionList((prev) => {
                        const updated = [...prev];
                        updated[lastIdx] = {
                          ...updated[lastIdx],
                          photos: [...productPhotos],
                          qualityReportPhotos: [...reportPhotos],
                        };
                        console.log('[InboundCheck-Continue] 照片已关联到验货单项[' + lastIdx + ']: ' + updated[lastIdx].materialName);
                        return updated;
                      });
                    }
                    setProductPhotos([]);
                    setReportPhotos([]);
                    setStep('form');
                    setError('');
                  }}
                  className="flex items-center gap-1.5 text-sm bg-emerald-500 text-white px-5 py-2.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line" />继续录入
                </button>
                <button
                  type="button"
                  onClick={() => {
                    console.log('[InboundCheck-ViewList] ▸ 查看验货单 | 验货单=' + inspectionList.length + '项, productPhotos=' + productPhotos.length + ', reportPhotos=' + reportPhotos.length);
                    if (inspectionList.length > 0) {
                      const lastIdx = inspectionList.length - 1;
                      setInspectionList((prev) => {
                        const updated = [...prev];
                        updated[lastIdx] = {
                          ...updated[lastIdx],
                          photos: [...productPhotos],
                          qualityReportPhotos: [...reportPhotos],
                        };
                        console.log('[InboundCheck-ViewList] 照片已关联到验货单项[' + lastIdx + ']: ' + updated[lastIdx].materialName);
                        return updated;
                      });
                    }
                    setProductPhotos([]);
                    setReportPhotos([]);
                    setStep('summary');
                  }}
                  className="flex items-center gap-1.5 text-sm border border-slate-200 text-slate-600 px-5 py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-file-list-3-line" />查看验货单
                </button>
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="flex items-center gap-1.5 text-sm border border-slate-200 text-slate-500 px-4 py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap ml-auto"
                >
                  <i className="ri-arrow-left-line" />返回
                </button>
              </div>
            </div>
          )}

          {/* ── 步骤 3: 验货单汇总 ── */}
          {step === 'summary' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">验货单汇总</p>
                  <p className="text-xs text-slate-400">
                    仓库：{currentWarehouseName || '未选择'} · 共 {inspectionList.length} 项货品
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="text-xs text-emerald-600 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-50 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line mr-1" />继续添加
                </button>
              </div>

              {inspectionList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <i className="ri-inbox-2-line text-3xl mb-2" />
                  <p className="text-sm">验货单为空</p>
                  <p className="text-xs mt-1">请先添加货品到验货单</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {inspectionList.map((item) => (
                    <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-100 flex-shrink-0">
                            <i className="ri-box-3-line text-slate-500" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{item.materialName}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs text-slate-400">{item.inboundMethodLabel}</span>
                              <span className="text-xs text-slate-400">·</span>
                              <span className="text-xs text-slate-500">
                                {item.quantity} {item.unitName}
                              </span>
                              {item.unitPrice > 0 && (
                                <>
                                  <span className="text-xs text-slate-400">·</span>
                                  <span className="text-xs text-emerald-600">¥{item.unitPrice.toFixed(2)}/单位</span>
                                </>
                              )}
                              {item.supplierName && (
                                <>
                                  <span className="text-xs text-slate-400">·</span>
                                  <span className="text-xs text-slate-500">{item.supplierName}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {/* 查看照片 */}
                          {(item.photos.length > 0 || item.qualityReportPhotos.length > 0) && (
                            <button
                              type="button"
                              onClick={() => handleViewPhotos(item)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
                              title="查看照片"
                            >
                              <i className="ri-image-line text-slate-400 text-sm" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 cursor-pointer"
                            title="移除"
                          >
                            <i className="ri-close-line text-slate-400 text-sm" />
                          </button>
                        </div>
                      </div>

                      {/* 照片缩略图 */}
                      {(item.photos.length > 0 || item.qualityReportPhotos.length > 0) && (
                        <div className="mt-3 flex gap-2 flex-wrap">
                          {item.photos.map((p) => (
                            <div key={p.id} className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0">
                              <img src={p.dataUrl} alt={p.label} className="w-full h-full object-cover" />
                            </div>
                          ))}
                          {item.qualityReportPhotos.length > 0 && (
                            <div className="flex items-center gap-1 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg px-2 py-1 h-14">
                              <i className="ri-file-text-line" />
                              质检报告 ×{item.qualityReportPhotos.length}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 确认入库 */}
              {inspectionList.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-100">
                      <i className="ri-check-double-line text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">确认入库</p>
                      <p className="text-xs text-slate-500">
                        共 {inspectionList.length} 项货品，确认后将提交至 DRP 系统并自动打印入库单
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmInbound}
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 text-sm bg-emerald-500 text-white py-2.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
                  >
                    {submitting ? (
                      <><i className="ri-loader-4-line animate-spin" />提交中...</>
                    ) : (
                      <><i className="ri-printer-line" />验货完成，确认入库</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            {step !== 'form' && (
              <button
                type="button"
                onClick={() => setStep('form')}
                className="text-xs border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-arrow-left-line mr-1" />返回录入
              </button>
            )}
            {step !== 'photos' && inspectionList.length > 0 && (
              <button
                type="button"
                onClick={() => setStep('photos')}
                className="text-xs border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-camera-line mr-1" />拍照留存
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {inspectionList.length > 0 && (
              <span className="text-xs text-slate-400 mr-2">
                验货单 <strong className="text-slate-700">{inspectionList.length}</strong> 项
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-sm border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              关闭
            </button>
          </div>
        </div>
      </div>

      {/* ── 查看照片弹窗 ── */}
      {viewingItem && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setViewingItem(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-800">照片查看 - {viewingItem.materialName}</p>
                <p className="text-xs text-slate-400">
                  货品照片 {viewingItem.photos.length} 张 · 质检报告 {viewingItem.qualityReportPhotos.length} 张
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingItem(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <i className="ri-close-line text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {viewingItem.photos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">货品照片</p>
                  <div className="grid grid-cols-2 gap-2">
                    {viewingItem.photos.map((p) => (
                      <div key={p.id} className="rounded-lg overflow-hidden border border-slate-200">
                        <img src={p.dataUrl} alt={p.label} className="w-full h-40 object-cover" />
                        <p className="text-xs text-slate-400 px-2 py-1">{p.label} · {p.timestamp}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {viewingItem.qualityReportPhotos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">质检报告</p>
                  <div className="grid grid-cols-2 gap-2">
                    {viewingItem.qualityReportPhotos.map((p) => (
                      <div key={p.id} className="rounded-lg overflow-hidden border border-slate-200">
                        <img src={p.dataUrl} alt={p.label} className="w-full h-40 object-cover" />
                        <p className="text-xs text-slate-400 px-2 py-1">{p.label} · {p.timestamp}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingItem(null)}
                className="text-sm border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}