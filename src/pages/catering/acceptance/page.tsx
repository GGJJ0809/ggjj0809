import { useState, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import ScaleConfigModal from './components/ScaleConfigModal';
import ScaleQueryModal, { type ImportedRecord } from './components/ScaleQueryModal';
import AddRecordModal from './components/AddRecordModal';
import InboundCheckModal, { type InspectionItem } from './components/InboundCheckModal';
import ScaleDevicesPanel from './components/ScaleDevicesPanel';
import ScaleDeviceModal from './components/ScaleDeviceModal';
import ScaleAIRecognition from './components/ScaleAIRecognition';
import AIMaterialRegisterPanel from './components/AIMaterialRegisterPanel';
import { useScaleConfig } from '@/hooks/useScaleConfig';
import { submitInboundAcceptance } from '@/services/scaleApi';
import { useAcceptance } from './hooks/useAcceptance';
import { useSuppliers } from './hooks/useSuppliers';
import { useScaleDevices, type CreateScaleDeviceInput } from './hooks/useScaleDevices';
import type { ScaleDevice } from './hooks/useScaleDevices';
import type { AIRecognitionResult } from './hooks/useScaleAI';

const statusConfig = {
  pass:    { label: '合格',   bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-400' },
  warning: { label: '偏差预警', bg: 'bg-amber-50',  text: 'text-amber-600',  dot: 'bg-amber-400' },
  fail:    { label: '不合格', bg: 'bg-red-50',     text: 'text-red-600',    dot: 'bg-red-500' },
};

interface Toast { id: number; type: 'success' | 'error'; msg: string; }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AcceptancePage() {
  const [statusFilter, setStatusFilter] = useState('全部');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showAdd, setShowAdd] = useState(false);
  const [showScaleConfig, setShowScaleConfig] = useState(false);
  const [showScaleQuery, setShowScaleQuery] = useState(false);
  const [showDevicesPanel, setShowDevicesPanel] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showAIRecognition, setShowAIRecognition] = useState(false);
  const [showAIRegister, setShowAIRegister] = useState(false);
  const [showInboundCheck, setShowInboundCheck] = useState(false);
  const [inboundCheckMode, setInboundCheckMode] = useState<'manual' | 'ai'>('manual');
  const [inboundCheckMaterial, setInboundCheckMaterial] = useState('');
  const [aiRecognizedIngredient, setAiRecognizedIngredient] = useState('');
  const [editingDevice, setEditingDevice] = useState<ScaleDevice | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const { records, loading, addRecord, addRecordsBatch, submitInbound } = useAcceptance(selectedDate);
  const { config, updateConfig, isConfigured, isReadyToSubmit } = useScaleConfig();
  const { suppliers } = useSuppliers();
  const { devices, loading: devicesLoading, error: devicesError, addDevice, updateDevice, deleteDevice, fetchDevices } = useScaleDevices();

  const statusTabs = ['全部', '合格', '偏差预警', '不合格'];
  const statusMap: Record<string, string> = { '合格': 'pass', '偏差预警': 'warning', '不合格': 'fail' };

  const filtered = records.filter((r) =>
    statusFilter === '全部' || r.status === statusMap[statusFilter]
  );

  const passCount    = records.filter((r) => r.status === 'pass').length;
  const warningCount = records.filter((r) => r.status === 'warning').length;
  const failCount    = records.filter((r) => r.status === 'fail').length;

  const addToast = useCallback((type: 'success' | 'error', msg: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // Scale device handlers
  const handleOpenDeviceModal = (device?: ScaleDevice) => {
    setEditingDevice(device ?? null);
    setShowDeviceModal(true);
  };

  const handleSaveDevice = async (input: CreateScaleDeviceInput, id?: number) => {
    if (id) {
      await updateDevice(id, input);
      addToast('success', `「${input.device_name}」已更新`);
    } else {
      await addDevice(input);
      addToast('success', `「${input.device_name}」已添加`);
    }
  };

  const handleSaveAndAddDevice = async (input: CreateScaleDeviceInput) => {
    await addDevice(input);
    addToast('success', `「${input.device_name}」已添加，可继续新增`);
  };

  const handleDeleteDevice = async (id: number) => {
    const d = devices.find((dev) => dev.id === id);
    await deleteDevice(id);
    addToast('success', d ? `「${d.device_name}」已删除` : '设备已删除');
  };

  const handleScaleImport = async (imported: ImportedRecord[]) => {
    try {
      const rows = imported.map((r) => ({
        record_no: r.id,
        accepted_at: r.time.includes('T') ? r.time : r.time.replace(' ', 'T') + '+08:00',
        ingredient: r.ingredient,
        supplier: r.supplier,
        expected: r.expected,
        actual: r.actual,
        deviation: r.deviation,
        unit: r.unit,
        inspector: r.inspector,
        certificates: r.certificates,
        status: r.status,
      }));
      await addRecordsBatch(rows as Parameters<typeof addRecordsBatch>[0]);
      addToast('success', `已导入 ${imported.length} 条验收记录`);
    } catch (e: unknown) {
      addToast('error', e instanceof Error ? e.message : '导入失败');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((r) => r.id)));
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (isReadyToSubmit) {
      const toSubmit = records.filter((r) => ids.includes(r.id));
      setSubmitting(true);
      try {
        const now = new Date();
        const intoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        const totalNum = parseFloat(toSubmit.reduce((sum, r) => sum + r.actual, 0).toFixed(3));
        const resp = await submitInboundAcceptance(config, {
          warehouseId: Number(config.warehouseId),
          canteenId: config.canteenId ? Number(config.canteenId) : undefined,
          fetchUserId: config.fetchUserId ? Number(config.fetchUserId) : undefined,
          intoDate,
          totalAmount: 0,
          totalNum,
          intoType: 1,
          status: 2,
          sourceType: 2,
          detailList: toSubmit.map((r) => ({
            materialId: r.inbound_material_id ?? undefined,
            goodsName: r.ingredient, planNum: r.expected, num: r.actual,
            unitName: r.unit, supplierName: r.supplier,
            supplierId: r.supplier_id ?? undefined,
            price: 0,
            amount: 0,
            remark: r.inspector ? `验收员: ${r.inspector}` : '',
          })),
        });
        const code = (resp as Record<string, unknown>)?.code ?? (resp as Record<string, unknown>)?.status;
        if (code === 0 || code === 200 || code === '0' || code === '200') {
          await submitInbound(ids);
          addToast('success', `成功提交 ${ids.length} 条记录到入库系统`);
          setSelectedIds(new Set());
        } else {
          addToast('error', String((resp as Record<string, unknown>)?.msg ?? '提交失败'));
        }
      } catch (e: unknown) {
        addToast('error', e instanceof Error ? e.message : String(e));
      } finally {
        setSubmitting(false);
      }
    } else {
      setSubmitting(true);
      try {
        await submitInbound(ids);
        addToast('success', `${ids.length} 条记录已成功提交入库`);
        setSelectedIds(new Set());
      } catch (e: unknown) {
        addToast('error', e instanceof Error ? e.message : '提交失败');
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleAddSubmit = async (form: Parameters<typeof addRecord>[0] & { notes?: string; inbound_material_id?: number | null; supplier_id?: number | null }) => {
    const record = await addRecord({
      ingredient: form.ingredient,
      supplier: form.supplier,
      expected: form.expected,
      actual: form.actual,
      unit: form.unit,
      inspector: form.inspector,
      certificates: form.certificates,
      inbound_material_id: form.inbound_material_id ?? null,
      supplier_id: form.supplier_id ?? null,
    });
    addToast('success', `「${record.ingredient}」验收记录已保存`);
  };

  const handleAIApply = (r: AIRecognitionResult) => {
    setAiRecognizedIngredient(r.name);
    setShowAIRecognition(false);
    setInboundCheckMode('ai');
    setInboundCheckMaterial(r.name);
    setShowInboundCheck(true);
  };

  // 验货入库提交
  const handleInboundSubmit = async (items: InspectionItem[], params: { warehouseId: number }) => {
    if (!isReadyToSubmit) {
      // 非 DRP 模式：直接标记为已入库
      const ids: number[] = [];
      for (const item of items) {
        const record = await addRecord({
          ingredient: item.materialName,
          supplier: item.supplierName || '',
          expected: item.planQuantity ?? 0,
          actual: item.quantity,
          unit: item.unitName || 'kg',
          inspector: item.inspector ?? '',
          certificates: [],
        });
        ids.push(record.id);
      }
      if (ids.length > 0) await submitInbound(ids);
      addToast('success', `验货完成！共 ${items.length} 项货品已入库`);
      return;
    }

    // DRP 模式：提交到 DRP 系统
    const now = new Date();
    const intoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const totalNum = parseFloat(items.reduce((sum, item) => sum + item.quantity, 0).toFixed(3));
    const totalAmount = parseFloat(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toFixed(2));

    const detailList = items.map((item) => ({
      materialId: item.materialId,
      goodsName: item.materialName,
      planNum: item.planQuantity ?? 0,
      num: item.quantity,
      unitName: item.unitName || 'kg',
      supplierName: item.supplierName || '',
      supplierId: item.supplierId,
      price: item.unitPrice,
      amount: parseFloat((item.unitPrice * item.quantity).toFixed(2)),
      remark: item.inspector ? `验收员: ${item.inspector}` : '',
    }));

    const resp = await submitInboundAcceptance(config, {
      warehouseId: params.warehouseId,
      canteenId: config.canteenId ? Number(config.canteenId) : undefined,
      fetchUserId: config.fetchUserId ? Number(config.fetchUserId) : undefined,
      intoDate,
      totalAmount,
      totalNum,
      intoType: 1,
      status: 2,
      sourceType: 2,
      detailList,
    });

    const code = (resp as Record<string, unknown>)?.code ?? (resp as Record<string, unknown>)?.status;
    if (code === 0 || code === 200 || code === '0' || code === '200') {
      // 同步保存到本地
      const ids: number[] = [];
      for (const item of items) {
        const record = await addRecord({
          ingredient: item.materialName,
          supplier: item.supplierName || '',
          expected: item.planQuantity ?? 0,
          actual: item.quantity,
          unit: item.unitName || 'kg',
          inspector: item.inspector ?? '',
          certificates: [],
        });
        ids.push(record.id);
      }
      if (ids.length > 0) await submitInbound(ids);
      addToast('success', `验货完成！共 ${items.length} 项货品已提交至 DRP 系统，入库单已自动打印`);
    } else {
      throw new Error(String((resp as Record<string, unknown>)?.msg ?? '提交失败'));
    }
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));

  // Date helpers: prev/next
  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    setSelectedIds(new Set());
  };
  const isToday = selectedDate === todayStr();

  return (
    <AppLayout title="食材验收管理" breadcrumb={['餐饮管理', '食材验收管理']}>
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm pointer-events-auto ${
            t.type === 'success' ? 'bg-emerald-50 border border-emerald-100 text-emerald-700' : 'bg-red-50 border border-red-100 text-red-600'
          }`}>
            <i className={t.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
            {t.msg}
          </div>
        ))}
      </div>

      {/* Fail alert */}
      {failCount > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <i className="ri-error-warning-fill text-red-500 text-lg" />
          <div>
            <p className="text-sm font-semibold text-red-700">验收异常提醒</p>
            <p className="text-xs text-red-600 mt-0.5">{selectedDate} 有 {failCount} 批次食材验收不合格，请及时处理并联系供应商</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {[
          { label: '验收批次', value: records.length, icon: 'ri-scales-line', color: 'text-slate-700', bg: 'bg-slate-100' },
          { label: '验收合格', value: passCount, icon: 'ri-checkbox-circle-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: '偏差预警', value: warningCount, icon: 'ri-error-warning-line', color: 'text-amber-500', bg: 'bg-amber-50' },
          { label: '验收不合格', value: failCount, icon: 'ri-close-circle-line', color: 'text-red-500', bg: 'bg-red-50' },
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

      <div className="bg-white rounded-xl border border-slate-100">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50 flex-wrap gap-3">
          {/* Left: date nav + status tabs */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Date switcher */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
              <button type="button" onClick={() => changeDate(-1)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 cursor-pointer">
                <i className="ri-arrow-left-s-line text-slate-500" />
              </button>
              <input
                type="date" value={selectedDate}
                onChange={(e) => { setSelectedDate(e.target.value); setSelectedIds(new Set()); }}
                className="text-xs text-slate-700 bg-transparent focus:outline-none cursor-pointer px-1"
              />
              <button type="button" onClick={() => changeDate(1)} disabled={isToday}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                <i className="ri-arrow-right-s-line text-slate-500" />
              </button>
              {!isToday && (
                <button type="button" onClick={() => setSelectedDate(todayStr())}
                  className="text-xs text-emerald-600 px-2 py-0.5 rounded hover:bg-emerald-50 cursor-pointer whitespace-nowrap">
                  回到今天
                </button>
              )}
            </div>

            {statusTabs.map((tab) => (
              <button key={tab} type="button" onClick={() => setStatusFilter(tab)}
                className={`text-xs px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${
                  statusFilter === tab ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}>
                {tab}
              </button>
            ))}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 mr-1">
              <div className={`w-1.5 h-1.5 rounded-full ${isConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`} />
              <span className="text-xs text-slate-400">{isConfigured ? '已连接秤' : '未配置秤'}</span>
            </div>

            {selectedIds.size > 0 && (
              <button type="button" onClick={handleSubmit} disabled={submitting}
                className="flex items-center gap-1.5 text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-60">
                {submitting ? <><i className="ri-loader-4-line animate-spin" />提交中...</> : <><i className="ri-upload-cloud-line" />提交入库（{selectedIds.size}）</>}
              </button>
            )}

            <button type="button" onClick={() => setShowDevicesPanel(true)}
              className="flex items-center gap-1 text-xs border border-slate-200 text-slate-500 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">
              <i className="ri-scales-3-line text-sm" />电子秤设备
            </button>

            <a
              href="/catering/scale-operators"
              onClick={(e) => { e.preventDefault(); window.REACT_APP_NAVIGATE?.('/catering/scale-operators'); }}
              className="flex items-center gap-1 text-xs border border-slate-200 text-slate-500 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-user-line text-sm" />操作员管理
            </a>

            <button type="button" onClick={() => setShowAIRecognition(true)}
              className="flex items-center gap-1 text-xs border border-amber-200 text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 cursor-pointer whitespace-nowrap">
              <i className="ri-brain-line text-sm" />AI 识别
            </button>

            {isConfigured && (
              <button type="button" onClick={() => setShowAIRegister(true)}
                className="flex items-center gap-1 text-xs border border-indigo-200 text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 cursor-pointer whitespace-nowrap">
                <i className="ri-camera-ai-line text-sm" />货品采集
              </button>
            )}

            <button type="button" onClick={() => setShowScaleConfig(true)}
              className="flex items-center gap-1 text-xs border border-slate-200 text-slate-500 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">
              <i className="ri-settings-3-line text-sm" />配置
            </button>

            <button type="button" onClick={() => setShowScaleQuery(true)}
              className="flex items-center gap-1.5 text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap">
              <i className="ri-scales-3-line" />读取电子秤
            </button>

            <button type="button" onClick={() => { setInboundCheckMode('manual'); setInboundCheckMaterial(''); setShowInboundCheck(true); }}
              className="flex items-center gap-1.5 text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
              <i className="ri-shopping-bag-3-line" />验货入库
            </button>

            <button type="button" onClick={() => setShowAdd(true)}
              className="flex items-center gap-1 text-xs border border-slate-200 text-slate-500 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">
              <i className="ri-add-line text-sm" />快速录入
            </button>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-5 py-2 bg-emerald-50 border-b border-emerald-100">
            <i className="ri-information-line text-emerald-500 text-sm" />
            <span className="text-xs text-emerald-700">已选 <strong>{selectedIds.size}</strong> 条，点击「提交入库」标记入库状态</span>
            <button type="button" onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-xs text-emerald-600 hover:text-emerald-800 cursor-pointer whitespace-nowrap">
              取消选择
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <i className="ri-loader-4-line animate-spin text-2xl mr-3" />
              <span className="text-sm">加载验收记录...</span>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} className="cursor-pointer" />
                  </th>
                  {['验收编号', '时间', '食材名称', '供应商', '预计', '实际', '偏差', '单位', '验收员', '证书', '验收结果', '入库状态'].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const cfg = statusConfig[r.status];
                  const isSelected = selectedIds.has(r.id);
                  const timeDisplay = r.accepted_at
                    ? new Date(r.accepted_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : '—';
                  return (
                    <tr key={r.id} onClick={() => toggleSelect(r.id)}
                      className={`border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer ${
                        isSelected ? 'bg-emerald-50/30' : r.status === 'fail' ? 'bg-red-50/20' : r.status === 'warning' ? 'bg-amber-50/20' : ''
                      }`}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)} className="cursor-pointer" />
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-400">{r.record_no}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{timeDisplay}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">
                        {r.ingredient}
                        {r.inbound_material_id && (
                          <i className="ri-link text-emerald-400 ml-1 text-xs" title="已关联入库产品" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {r.supplier || '—'}
                        {r.supplier_id && (
                          <i className="ri-link text-emerald-400 ml-1 text-xs" title="已关联供应商" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{r.expected > 0 ? r.expected : '—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-800">{r.actual > 0 ? r.actual : '—'}</td>
                      <td className={`px-4 py-3 text-sm font-semibold ${Math.abs(r.deviation) > 5 ? 'text-red-500' : 'text-slate-600'}`}>
                        {r.expected > 0 ? `${r.deviation > 0 ? '+' : ''}${r.deviation}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{r.unit}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{r.inspector || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(r.certificates ?? []).map((c: string) => (
                            <span key={c} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                              {c.length > 6 ? `${c.slice(0, 5)}…` : c}
                            </span>
                          ))}
                          {(r.certificates ?? []).length === 0 && <span className="text-xs text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full w-fit ${cfg.bg} ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {r.inbound_status === 'submitted' ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
                            <i className="ri-checkbox-circle-fill text-xs" />已入库
                          </span>
                        ) : r.inbound_status === 'failed' ? (
                          <span className="flex items-center gap-1 text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full w-fit">
                            <i className="ri-close-circle-line text-xs" />入库失败
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full w-fit">
                            <i className="ri-time-line text-xs" />待入库
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={13} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <div className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-100">
                          <i className="ri-file-list-3-line text-2xl" />
                        </div>
                        <p className="text-sm">{selectedDate} 暂无验收记录</p>
                        <p className="text-xs">可切换日期查看历史记录</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      {showAdd && (
        <AddRecordModal
          suppliers={suppliers}
          onClose={() => { setShowAdd(false); setAiRecognizedIngredient(''); }}
          onSubmit={handleAddSubmit}
          initialIngredient={aiRecognizedIngredient || undefined}
        />
      )}

      {showScaleConfig && (
        <ScaleConfigModal config={config} onSave={updateConfig} onClose={() => setShowScaleConfig(false)} />
      )}

      {showScaleQuery && (
        <ScaleQueryModal
          config={config}
          onImport={handleScaleImport}
          onClose={() => setShowScaleQuery(false)}
          onGoConfig={() => setShowScaleConfig(true)}
        />
      )}

      {/* Scale Devices Panel */}
      {showDevicesPanel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl">
            <ScaleDevicesPanel
              devices={devices}
              loading={devicesLoading}
              error={devicesError}
              onAdd={() => handleOpenDeviceModal()}
              onEdit={(d) => handleOpenDeviceModal(d)}
              onDelete={handleDeleteDevice}
            />
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => setShowDevicesPanel(false)}
                className="text-sm bg-white text-slate-600 border border-slate-200 rounded-lg px-5 py-2 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scale Device Modal */}
      {showDeviceModal && (
        <ScaleDeviceModal
          device={editingDevice}
          onClose={() => {
            setShowDeviceModal(false);
            setEditingDevice(null);
          }}
          onSave={handleSaveDevice}
          onSaveAndAdd={!editingDevice ? handleSaveAndAddDevice : undefined}
        />
      )}

      {/* Inbound Check Modal */}
      {showInboundCheck && (
        <InboundCheckModal
          onClose={() => { setShowInboundCheck(false); setInboundCheckMaterial(''); }}
          onSubmitInbound={handleInboundSubmit}
          initialMode={inboundCheckMode}
          aiRecognizedName={inboundCheckMaterial || undefined}
        />
      )}

      {/* AI Recognition Modal */}
      {showAIRecognition && (
        <ScaleAIRecognition
          onApply={handleAIApply}
          onClose={() => setShowAIRecognition(false)}
        />
      )}

      {/* AI Register Panel */}
      {showAIRegister && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl">
            <AIMaterialRegisterPanel />
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAIRegister(false)}
                className="text-sm bg-white text-slate-600 border border-slate-200 rounded-lg px-5 py-2 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}