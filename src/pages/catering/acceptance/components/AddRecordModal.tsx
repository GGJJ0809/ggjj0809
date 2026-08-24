import { useState, useRef, useEffect } from 'react';
import type { Supplier } from '../hooks/useSuppliers';
import { useScaleConfig } from '@/hooks/useScaleConfig';
import { supabase } from '@/lib/supabase';
import {
  fetchMaterialCategoryList,
  extractMaterials,
  getMaterialName,
  getExpectedWeight,
  getActualWeight,
  getMaterialSearchName,
  type MaterialSearchItem,
} from '@/services/scaleApi';
import MaterialSearchModal from './MaterialSearchModal';

interface AddForm {
  ingredient: string;
  supplier: string;
  expected: string;
  actual: string;
  unit: string;
  inspector: string;
  certificates: string;
  notes: string;
  inbound_material_id: string;
  supplier_id: string;
}

interface InboundMaterialOption {
  id: number;
  name: string;
  unit: string;
  supplier_id: number | null;
  supplier_name: string;
}

interface Props {
  suppliers: Supplier[];
  onClose: () => void;
  onSubmit: (form: {
    ingredient: string;
    supplier: string;
    expected: number;
    actual: number;
    unit: string;
    inspector: string;
    certificates: string[];
    notes?: string;
    inbound_material_id?: number | null;
    supplier_id?: number | null;
  }) => Promise<void>;
  initialIngredient?: string;
}

const UNITS = ['kg', 'g', '枚', '袋', '箱', '桶', '瓶', 'L'];
const CERT_OPTIONS = ['动物检疫合格证', '肉品品质检验合格证', '无公害农产品证书', '绿色食品证书', '有机食品认证', '产品合格证', '产品质量合格证'];

export default function AddRecordModal({ suppliers, onClose, onSubmit, initialIngredient }: Props) {
  const { config, isConfigured } = useScaleConfig();

  const [fetchId, setFetchId] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [fetchedItems, setFetchedItems] = useState<{ name: string; expected: number; actual: number; unit: string; supplier: string }[]>([]);
  const [selectedFetchIdx, setSelectedFetchIdx] = useState<number | null>(null);

  // DRP 货品搜索
  const [showMaterialSearch, setShowMaterialSearch] = useState(false);

  const [form, setForm] = useState<AddForm>({
    ingredient: initialIngredient ?? '',
    supplier: '',
    expected: '',
    actual: '',
    unit: 'kg',
    inspector: '',
    certificates: '',
    notes: '',
    inbound_material_id: '',
    supplier_id: '',
  });
  const [selectedCerts, setSelectedCerts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 入库产品（inbound_materials）搜索
  const [materialInput, setMaterialInput] = useState(initialIngredient ?? '');
  const [materialOptions, setMaterialOptions] = useState<InboundMaterialOption[]>([]);
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const [materialLoading, setMaterialLoading] = useState(false);
  const materialRef = useRef<HTMLDivElement>(null);
  const materialSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 供应商输入联想
  const [supplierInput, setSupplierInput] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const supplierRef = useRef<HTMLDivElement>(null);

  const filteredSuppliers = supplierInput.trim()
    ? suppliers.filter((s) => s.name.includes(supplierInput.trim()))
    : suppliers;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setShowSupplierDropdown(false);
      }
      if (materialRef.current && !materialRef.current.contains(e.target as Node)) {
        setShowMaterialDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 初始化：如果传入了食材名，自动搜索入库产品库
  useEffect(() => {
    if (initialIngredient) {
      searchInboundMaterials(initialIngredient);
    }
    return () => {
      if (materialSearchTimer.current) clearTimeout(materialSearchTimer.current);
    };
  }, [initialIngredient]);

  // 搜索入库产品（inbound_materials）
  const searchInboundMaterials = (query: string) => {
    if (materialSearchTimer.current) clearTimeout(materialSearchTimer.current);
    if (!query.trim()) {
      setMaterialOptions([]);
      setShowMaterialDropdown(false);
      return;
    }
    materialSearchTimer.current = setTimeout(async () => {
      setMaterialLoading(true);
      try {
        const { data } = await supabase
          .from('inbound_materials')
          .select('id, name, unit, supplier_id')
          .ilike('name', `%${query.trim()}%`)
          .eq('is_active', true)
          .order('name')
          .limit(8);
        const items = (data ?? []) as { id: number; name: string; unit: string; supplier_id: number | null }[];
        // 批量查供应商名
        const supplierIds = [...new Set(items.map((m) => m.supplier_id).filter(Boolean) as number[])];
        let supplierMap: Record<number, string> = {};
        if (supplierIds.length > 0) {
          const { data: supData } = await supabase
            .from('suppliers')
            .select('id, name')
            .in('id', supplierIds);
          supplierMap = Object.fromEntries(
            ((supData ?? []) as { id: number; name: string }[]).map((s) => [s.id, s.name])
          );
        }
        const enriched = items.map((m) => ({
          ...m,
          supplier_name: m.supplier_id ? (supplierMap[m.supplier_id] || '') : '',
        }));
        setMaterialOptions(enriched);
        if (enriched.length > 0) setShowMaterialDropdown(true);
      } catch {
        // silent
      } finally {
        setMaterialLoading(false);
      }
    }, 250);
  };

  const set = (key: keyof AddForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  const toggleCert = (cert: string) => {
    setSelectedCerts((prev) =>
      prev.includes(cert) ? prev.filter((c) => c !== cert) : [...prev, cert]
    );
  };

  // DRP 货品搜索选中
  const handleMaterialSelect = (item: MaterialSearchItem) => {
    setForm((prev) => ({
      ...prev,
      ingredient: getMaterialSearchName(item),
    }));
    setShowMaterialSearch(false);
    setError('');
  };

  // 通过领料单号拉取电子秤数据
  const handleFetch = async () => {
    if (!fetchId.trim()) { setFetchError('请输入领料单号'); return; }
    if (!isConfigured) { setFetchError('电子秤未配置，请先在「配置」中填写连接信息'); return; }
    setFetching(true);
    setFetchError('');
    setFetchedItems([]);
    setSelectedFetchIdx(null);
    try {
      const resp = await fetchMaterialCategoryList(config, fetchId.trim());
      const materials = extractMaterials(resp);
      if (materials.length === 0) {
        setFetchError('未查询到食材数据，请检查领料单号');
        return;
      }
      const items = materials.map((m) => ({
        name: getMaterialName(m),
        expected: getExpectedWeight(m),
        actual: getActualWeight(m),
        unit: m.unit ?? 'kg',
        supplier: m.supplier ?? '',
      }));
      setFetchedItems(items);
      // 自动选中第一条
      applyItem(items[0]);
      setSelectedFetchIdx(0);
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : '查询失败');
    } finally {
      setFetching(false);
    }
  };

  const applyItem = (item: { name: string; expected: number; actual: number; unit: string; supplier: string }) => {
    setForm((prev) => ({
      ...prev,
      ingredient: item.name,
      expected: item.expected > 0 ? String(item.expected) : '',
      actual: item.actual > 0 ? String(item.actual) : '',
      unit: item.unit || 'kg',
    }));
    if (item.supplier) {
      setSupplierInput(item.supplier);
      set('supplier', item.supplier);
    }
    setError('');
  };

  // Compute deviation preview
  const exp = parseFloat(form.expected) || 0;
  const act = parseFloat(form.actual) || 0;
  const deviation = exp > 0 ? parseFloat((((act - exp) / exp) * 100).toFixed(1)) : null;
  const deviationStatus = deviation === null ? null
    : Math.abs(deviation) > 8 ? 'fail'
    : Math.abs(deviation) > 3 ? 'warning'
    : 'pass';

  const statusLabel = { pass: '合格', warning: '偏差预警', fail: '不合格' };
  const statusColor = { pass: 'text-emerald-600 bg-emerald-50 border-emerald-100', warning: 'text-amber-600 bg-amber-50 border-amber-100', fail: 'text-red-600 bg-red-50 border-red-100' };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ingredient.trim()) { setError('请输入食材名称'); return; }
    if (!form.actual) { setError('请输入实际重量'); return; }
    setSaving(true);
    try {
      const allCerts = [...selectedCerts];
      if (form.certificates.trim()) {
        form.certificates.split(',').map((c) => c.trim()).filter(Boolean).forEach((c) => {
          if (!allCerts.includes(c)) allCerts.push(c);
        });
      }
      await onSubmit({
        ingredient: form.ingredient.trim(),
        supplier: supplierInput.trim(),
        expected: parseFloat(form.expected) || 0,
        actual: parseFloat(form.actual) || 0,
        unit: form.unit,
        inspector: form.inspector.trim(),
        certificates: allCerts,
        notes: form.notes.trim() || undefined,
        inbound_material_id: form.inbound_material_id ? parseInt(form.inbound_material_id, 10) : null,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id, 10) : null,
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">录入验收记录</h3>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* 领料单号带出 */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <i className="ri-qr-scan-2-line text-slate-500 text-sm" />
              <span className="text-xs font-semibold text-slate-600">从电子秤读取（可选）</span>
              {!isConfigured && (
                <span className="text-xs text-amber-500 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                  未配置电子秤
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={fetchId}
                onChange={(e) => { setFetchId(e.target.value); setFetchError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), isConfigured && handleFetch())}
                placeholder={isConfigured ? '输入或扫码领料单号，自动带出食材数据' : '请先在「配置」中填写电子秤信息'}
                disabled={!isConfigured}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={handleFetch}
                disabled={fetching || !fetchId.trim() || !isConfigured}
                title={!isConfigured ? '请先在「配置」中填写电子秤连接信息' : undefined}
                className="flex items-center gap-1.5 text-xs bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fetching ? <><i className="ri-loader-4-line animate-spin" />查询中</> : <><i className="ri-search-line" />查询</>}
              </button>
            </div>
            {fetchError && (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                <i className="ri-error-warning-line" />{fetchError}
              </p>
            )}

            {/* 查询结果列表（多条时可选） */}
            {fetchedItems.length > 1 && (
              <div className="mt-2.5 space-y-1.5">
                <p className="text-xs text-slate-400">查询到 {fetchedItems.length} 条食材，点击选择：</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {fetchedItems.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => { applyItem(item); setSelectedFetchIdx(idx); }}
                      className={`w-full flex items-center justify-between text-xs px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                        selectedFetchIdx === idx
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <span className="font-medium">{item.name}</span>
                      <span className="text-slate-400">{item.actual > 0 ? `实际 ${item.actual}${item.unit}` : `预计 ${item.expected}${item.unit}`}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {fetchedItems.length === 1 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                <i className="ri-checkbox-circle-fill" />
                已带入食材数据：{fetchedItems[0].name}
              </div>
            )}

            {/* DRP 货品搜索入口 */}
            {isConfigured && (
              <button
                type="button"
                onClick={() => setShowMaterialSearch(true)}
                className="w-full flex items-center justify-center gap-1.5 text-xs border border-dashed border-slate-300 rounded-lg py-2 text-slate-500 hover:border-slate-400 hover:text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <i className="ri-search-line text-sm" />
                从 DRP 系统中搜索货品
              </button>
            )}
          </div>

          {/* 食材名称 + 入库产品选择器 */}
          <div ref={materialRef} className="relative">
            <label className="text-xs font-medium text-slate-600 mb-1 block">食材名称 <span className="text-red-400">*</span></label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={form.ingredient}
                  onChange={(e) => {
                    set('ingredient', e.target.value);
                    setMaterialInput(e.target.value);
                    set('inbound_material_id', '');
                    searchInboundMaterials(e.target.value);
                  }}
                  placeholder="如：猪里脊肉，或从入库产品库中选择"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                />
                {materialLoading && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <i className="ri-loader-4-line animate-spin text-slate-400 text-sm" />
                  </span>
                )}
                {showMaterialDropdown && materialOptions.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                      <span className="text-xs text-slate-400">从入库产品库中选择</span>
                    </div>
                    {materialOptions.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          set('ingredient', m.name);
                          set('inbound_material_id', String(m.id));
                          set('unit', m.unit || 'kg');
                          setMaterialInput(m.name);
                          setShowMaterialDropdown(false);
                          if (m.supplier_id && m.supplier_name) {
                            setSupplierInput(m.supplier_name);
                            set('supplier_id', String(m.supplier_id));
                          }
                        }}
                        className="w-full text-left text-sm px-4 py-2 hover:bg-slate-50 cursor-pointer text-slate-700 flex items-center justify-between"
                      >
                        <span>{m.name}</span>
                        <span className="text-xs text-slate-400">{m.unit}{m.supplier_name ? ` · ${m.supplier_name}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {isConfigured && (
                <button
                  type="button"
                  onClick={() => setShowMaterialSearch(true)}
                  title="从 DRP 搜索货品"
                  className="flex items-center gap-1 text-xs border border-slate-200 text-slate-500 px-2.5 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-search-line" />搜索
                </button>
              )}
            </div>
            {form.inbound_material_id && (
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                <i className="ri-link" />
                已关联入库产品（ID: {form.inbound_material_id}）
              </p>
            )}
          </div>

          {/* 供应商 — 手动输入 + 联想 */}
          <div ref={supplierRef} className="relative">
            <label className="text-xs font-medium text-slate-600 mb-1 block">供应商</label>
            <input
              type="text"
              value={supplierInput}
              onChange={(e) => {
                setSupplierInput(e.target.value);
                setShowSupplierDropdown(true);
                if (e.target.value !== suppliers.find((s) => s.id === parseInt(form.supplier_id || '0', 10))?.name) {
                  set('supplier_id', '');
                }
              }}
              onFocus={() => setShowSupplierDropdown(true)}
              placeholder="直接输入供应商名称，或从列表选择"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
            />
            {showSupplierDropdown && filteredSuppliers.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                {filteredSuppliers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSupplierInput(s.name);
                      setShowSupplierDropdown(false);
                      set('supplier_id', String(s.id));
                    }}
                    className="w-full text-left text-sm px-4 py-2 hover:bg-slate-50 cursor-pointer text-slate-700 flex items-center justify-between"
                  >
                    <span>{s.name}</span>
                    {s.category && <span className="text-xs text-slate-400">{s.category}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 重量 + 单位 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">预计重量</label>
              <input
                type="number" min="0" step="0.1" value={form.expected}
                onChange={(e) => set('expected', e.target.value)} placeholder="0"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">实际重量 <span className="text-red-400">*</span></label>
              <input
                type="number" min="0" step="0.1" value={form.actual}
                onChange={(e) => set('actual', e.target.value)} placeholder="0"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">单位</label>
              <select
                value={form.unit} onChange={(e) => set('unit', e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none bg-white cursor-pointer"
              >
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Deviation preview */}
          {deviation !== null && deviationStatus && (
            <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium border ${statusColor[deviationStatus]}`}>
              <div className="flex items-center gap-2">
                <i className={deviationStatus === 'pass' ? 'ri-checkbox-circle-line' : deviationStatus === 'warning' ? 'ri-error-warning-line' : 'ri-close-circle-line'} />
                <span>验收结果预测：{statusLabel[deviationStatus]}</span>
              </div>
              <span>偏差 {deviation > 0 ? `+${deviation}` : deviation}%</span>
            </div>
          )}

          {/* 验收员 */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">验收员</label>
            <input
              type="text" value={form.inspector} onChange={(e) => set('inspector', e.target.value)}
              placeholder="请输入验收员姓名"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
            />
          </div>

          {/* 合格证书 */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-2 block">随附证书</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {CERT_OPTIONS.map((cert) => (
                <button
                  key={cert} type="button" onClick={() => toggleCert(cert)}
                  className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer whitespace-nowrap transition-colors ${
                    selectedCerts.includes(cert)
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {selectedCerts.includes(cert) && <i className="ri-check-line mr-1 text-xs" />}
                  {cert}
                </button>
              ))}
            </div>
            <input
              type="text" value={form.certificates} onChange={(e) => set('certificates', e.target.value)}
              placeholder="其他证书，多个用逗号分隔"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
            />
          </div>

          {/* 备注 */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">备注</label>
            <textarea
              value={form.notes} onChange={(e) => set('notes', e.target.value)}
              maxLength={200} rows={2} placeholder="如：外包装完好、温度符合要求..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500 flex items-center gap-1"><i className="ri-error-warning-line" />{error}</p>}
        </form>

        <div className="flex gap-2 px-6 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose}
            className="flex-1 text-sm border border-slate-200 rounded-lg py-2.5 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap">
            取消
          </button>
          <button type="button" onClick={(e) => { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent); }}
            disabled={saving}
            className="flex-1 text-sm bg-emerald-500 text-white rounded-lg py-2.5 hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-60">
            {saving ? '保存中...' : '提交验收'}
          </button>
        </div>
      </div>

      {/* DRP 货品搜索弹窗 */}
      {showMaterialSearch && (
        <MaterialSearchModal
          onSelect={handleMaterialSelect}
          onClose={() => setShowMaterialSearch(false)}
        />
      )}
    </div>
  );
}