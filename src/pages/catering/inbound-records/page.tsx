import { useState, useCallback, useEffect } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { supabase } from '@/lib/supabase';
import { todayBeijing } from '@/lib/dateUtils';
import type { AcceptanceRecord } from '@/pages/catering/acceptance/hooks/useAcceptance';
import { useScaleConfig } from '@/hooks/useScaleConfig';
import { useInboundDevice } from './hooks/useInboundDevice';
import InboundDeviceBindModal from './components/InboundDeviceBindModal';
import { fetchDeviceInboundRecords, type SyncedInboundRecord } from '@/services/scaleApi';

const statusConfig = {
  pass: { label: '合格', bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-400' },
  warning: { label: '偏差预警', bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-400' },
  fail: { label: '不合格', bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
};

const inboundStatusConfig = {
  submitted: { label: '已入库', bg: 'bg-emerald-50', text: 'text-emerald-600', icon: 'ri-checkbox-circle-fill' },
  pending: { label: '待入库', bg: 'bg-slate-100', text: 'text-slate-500', icon: 'ri-time-line' },
  failed: { label: '入库失败', bg: 'bg-red-50', text: 'text-red-500', icon: 'ri-close-circle-line' },
};

type InboundFilter = 'all' | 'submitted' | 'pending' | 'failed';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getDateRange(preset: string): { start: string; end: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === 'today') {
    const s = fmt(now);
    return { start: s, end: s };
  }
  if (preset === 'week') {
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    return { start: fmt(monday), end: fmt(now) };
  }
  if (preset === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: fmt(first), end: fmt(now) };
  }
  return { start: '', end: '' };
}

export default function InboundRecordsPage() {
  const [records, setRecords] = useState<AcceptanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [inboundFilter, setInboundFilter] = useState<InboundFilter>('all');
  const [qualityFilter, setQualityFilter] = useState('全部');
  const [datePreset, setDatePreset] = useState('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [searchText, setSearchText] = useState('');
  const [detailRecord, setDetailRecord] = useState<AcceptanceRecord | null>(null);
  const [showBindModal, setShowBindModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { config, isConfigured } = useScaleConfig();
  const { boundDevice, bindDevice, unbindDevice, isBound } = useInboundDevice();

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const range = datePreset === 'custom'
        ? { start: customStart, end: customEnd }
        : getDateRange(datePreset);

      let query = supabase
        .from('acceptance_records')
        .select('*')
        .order('accepted_at', { ascending: false });

      if (range.start) {
        query = query.gte('accepted_at', `${range.start}T00:00:00+08:00`);
      }
      if (range.end) {
        query = query.lte('accepted_at', `${range.end}T23:59:59+08:00`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRecords((data ?? []) as AcceptanceRecord[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [datePreset, customStart, customEnd]);

  const handleSync = useCallback(async () => {
    if (!isBound || !boundDevice || !isConfigured) {
      setSyncMsg({ type: 'error', text: '请先绑定设备并完成电子秤连接配置' });
      return;
    }
    setSyncing(true);
    setSyncMsg(null);
    try {
      const { records: syncedRecords } = await fetchDeviceInboundRecords(config, {
        deviceSn: boundDevice.device_sn,
        deviceIp: boundDevice.device_ip ?? undefined,
        size: 50,
      });

      if (syncedRecords.length === 0) {
        setSyncMsg({ type: 'success', text: '没有新数据，设备上暂无待同步的入库记录' });
        return;
      }

      // 去重：已存在的 record_no 跳过
      const existingNos = new Set(records.map((r) => r.record_no));
      const newRecords = syncedRecords.filter((sr) => !existingNos.has(sr.syncedId));

      if (newRecords.length === 0) {
        setSyncMsg({ type: 'success', text: `设备上有 ${syncedRecords.length} 条记录，已全部同步过，无需重复导入` });
        return;
      }

      // 批量插入 acceptance_records — 同时匹配入库产品和供应商 ID
      // 收集所有食材名和供应商名做批量匹配
      const ingredientNames = [...new Set(newRecords.map((sr: SyncedInboundRecord) => sr.ingredient))];
      const supplierNames = [...new Set(newRecords.map((sr: SyncedInboundRecord) => sr.supplier).filter(Boolean))];

      let materialMap: Record<string, number> = {};
      let supplierMap: Record<string, number> = {};

      if (ingredientNames.length > 0) {
        const { data: materials } = await supabase
          .from('inbound_materials')
          .select('id, name')
          .in('name', ingredientNames)
          .eq('is_active', true);
        materialMap = Object.fromEntries(
          ((materials ?? []) as { id: number; name: string }[]).map((m) => [m.name, m.id])
        );
      }

      if (supplierNames.length > 0) {
        const { data: supps } = await supabase
          .from('suppliers')
          .select('id, name')
          .in('name', supplierNames)
          .eq('is_active', true);
        supplierMap = Object.fromEntries(
          ((supps ?? []) as { id: number; name: string }[]).map((s) => [s.name, s.id])
        );
      }

      const rows = newRecords.map((sr: SyncedInboundRecord) => ({
        record_no: sr.syncedId,
        ingredient: sr.ingredient,
        supplier: sr.supplier || '',
        expected: sr.expected,
        actual: sr.actual,
        deviation: sr.deviation,
        unit: sr.unit || 'kg',
        inspector: sr.inspector || '',
        certificates: sr.certificates ?? [],
        status: sr.status,
        inbound_status: 'submitted',
        inbound_at: sr.recordTime,
        accepted_at: sr.recordTime,
        inbound_material_id: materialMap[sr.ingredient] || null,
        supplier_id: supplierMap[sr.supplier] || null,
      }));

      const { error: insertErr } = await supabase.from('acceptance_records').insert(rows);
      if (insertErr) throw insertErr;

      setSyncMsg({ type: 'success', text: `成功同步 ${newRecords.length} 条入库记录（设备：${boundDevice.device_name}）` });
      fetchRecords();
    } catch (e: unknown) {
      setSyncMsg({
        type: 'error',
        text: e instanceof Error ? e.message : '同步失败，请检查设备连接',
      });
    } finally {
      setSyncing(false);
    }
  }, [isBound, boundDevice, isConfigured, config, records, fetchRecords]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const qualityMap: Record<string, string> = { '合格': 'pass', '偏差预警': 'warning', '不合格': 'fail' };

  const filtered = records.filter((r) => {
    const matchInbound = inboundFilter === 'all' || r.inbound_status === inboundFilter;
    const matchQuality = qualityFilter === '全部' || r.status === qualityMap[qualityFilter];
    const matchSearch = !searchText.trim() ||
      r.ingredient.includes(searchText) ||
      r.supplier.includes(searchText) ||
      r.record_no.includes(searchText) ||
      r.inspector.includes(searchText);
    return matchInbound && matchQuality && matchSearch;
  });

  // Stats
  const totalCount = records.length;
  const submittedCount = records.filter((r) => r.inbound_status === 'submitted').length;
  const pendingCount = records.filter((r) => r.inbound_status === 'pending').length;
  const failCount = records.filter((r) => r.status === 'fail').length;

  // Total actual weight submitted
  const totalWeight = records
    .filter((r) => r.inbound_status === 'submitted')
    .reduce((sum, r) => sum + (r.actual || 0), 0);

  return (
    <AppLayout title="入库记录" breadcrumb={['餐饮管理', '入库记录']}>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: '验收总批次', value: totalCount, icon: 'ri-file-list-3-line', color: 'text-slate-700', bg: 'bg-slate-100' },
          { label: '已入库批次', value: submittedCount, icon: 'ri-store-3-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: '待入库批次', value: pendingCount, icon: 'ri-time-line', color: 'text-amber-500', bg: 'bg-amber-50' },
          { label: '入库总重量', value: `${totalWeight.toFixed(1)}kg`, icon: 'ri-scales-line', color: 'text-slate-600', bg: 'bg-slate-100' },
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

      {/* Device Binding Bar */}
      <div className={`mb-4 flex items-center justify-between px-4 py-3 rounded-xl border ${
        isBound ? 'bg-emerald-50/40 border-emerald-100' : 'bg-slate-50 border-slate-100'
      }`}>
        <div className="flex items-center gap-3">
          {isBound && boundDevice ? (
            <>
              <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-100">
                <i className="ri-scales-3-line text-emerald-600 text-lg" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{boundDevice.device_name}</span>
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {boundDevice.device_ip || '无 IP'}
                  </span>
                  <span className="text-xs text-slate-400">· {boundDevice.canteen} · {boundDevice.zone}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  设备 SN: <span className="font-mono">{boundDevice.device_sn}</span>
                  {boundDevice.comm_protocol && <span className="ml-3">协议: {boundDevice.comm_protocol}</span>}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-200">
                <i className="ri-link-unlink text-slate-500 text-lg" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600">未绑定入库电子秤设备</p>
                <p className="text-xs text-slate-400 mt-0.5">绑定后可从电子秤设备同步入库数据到此页面</p>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isBound ? (
            <>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing || !isConfigured}
                className="flex items-center gap-1.5 text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncing ? (
                  <><i className="ri-loader-4-line animate-spin" />同步中...</>
                ) : (
                  <><i className="ri-refresh-line" />同步数据</>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowBindModal(true)}
                className="flex items-center gap-1 text-xs border border-slate-200 text-slate-500 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-swap-line text-sm" />切换设备
              </button>
              <button
                type="button"
                onClick={unbindDevice}
                className="flex items-center gap-1 text-xs border border-red-200 text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-50 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-link-unlink text-sm" />解除绑定
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowBindModal(true)}
              className="flex items-center gap-1.5 text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-link" />绑定设备
            </button>
          )}
        </div>
      </div>

      {/* Sync Message */}
      {syncMsg && (
        <div className={`mb-4 flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs ${
          syncMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
        }`}>
          <i className={syncMsg.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
          {syncMsg.text}
          <button
            type="button"
            onClick={() => setSyncMsg(null)}
            className="ml-auto text-current opacity-50 hover:opacity-100 cursor-pointer"
          >
            <i className="ri-close-line" />
          </button>
        </div>
      )}

      {!isConfigured && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs bg-amber-50 text-amber-700">
          <i className="ri-information-line" />
          尚未配置电子秤连接参数，请先在「食材验收管理 → 配置」中完成连接配置后才能同步数据
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-100">
        {/* Filter Bar */}
        <div className="px-5 py-4 border-b border-slate-50 space-y-3">
          {/* Row 1: date + search */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              {[
                { key: 'today', label: '今日' },
                { key: 'week', label: '本周' },
                { key: 'month', label: '本月' },
                { key: 'custom', label: '自定义' },
              ].map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setDatePreset(p.key)}
                  className={`text-xs px-3 py-1 rounded-md cursor-pointer whitespace-nowrap transition-colors ${
                    datePreset === p.key ? 'bg-white text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {datePreset === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-slate-400"
                />
                <span className="text-slate-400 text-xs">至</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-slate-400"
                />
                <button
                  type="button"
                  onClick={fetchRecords}
                  className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  查询
                </button>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <i className="ri-search-line text-slate-400 text-sm" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索食材、供应商、编号..."
                className="text-xs bg-transparent focus:outline-none w-48 text-slate-700 placeholder:text-slate-400"
              />
            </div>

            <button
              type="button"
              onClick={fetchRecords}
              className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-refresh-line" />
              刷新
            </button>
            <button
              type="button"
              onClick={() => {
                const headers = ['验收编号','验收时间','食材名称','供应商','实际重量','单位','偏差','验收结果','验收员','入库状态','入库时间'];
                const rows = filtered.map((r) => [
                  r.record_no,
                  formatDate(r.accepted_at),
                  r.ingredient,
                  r.supplier || '',
                  r.actual > 0 ? r.actual : '',
                  r.unit,
                  r.expected > 0 ? `${r.deviation > 0 ? '+' : ''}${r.deviation}%` : '',
                  { pass: '合格', warning: '偏差预警', fail: '不合格' }[r.status as string] || r.status,
                  r.inspector || '',
                  { submitted: '已入库', pending: '待入库', failed: '入库失败' }[r.inbound_status as string] || '',
                  formatDate(r.inbound_at),
                ]);
                const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
                const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `入库记录_${todayBeijing()}.csv`;
                a.click(); URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-download-line" />
              导出 CSV
            </button>
          </div>

          {/* Row 2: status filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1">入库状态</span>
              {(['all', 'submitted', 'pending', 'failed'] as InboundFilter[]).map((f) => {
                const labelMap = { all: '全部', submitted: '已入库', pending: '待入库', failed: '入库失败' };
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setInboundFilter(f)}
                    className={`text-xs px-3 py-1 rounded-full cursor-pointer whitespace-nowrap transition-colors ${
                      inboundFilter === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {labelMap[f]}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1">验收结果</span>
              {['全部', '合格', '偏差预警', '不合格'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setQualityFilter(tab)}
                  className={`text-xs px-3 py-1 rounded-full cursor-pointer whitespace-nowrap transition-colors ${
                    qualityFilter === tab ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <span className="ml-auto text-xs text-slate-400">
              共 <strong className="text-slate-700">{filtered.length}</strong> 条记录
              {failCount > 0 && (
                <span className="ml-2 text-red-500">• {failCount} 条不合格</span>
              )}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <i className="ri-loader-4-line animate-spin text-2xl mr-3" />
              <span className="text-sm">加载记录...</span>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50">
                  {['验收编号', '验收时间', '食材名称', '供应商', '实际重量', '偏差', '验收结果', '验收员', '合格证书', '入库状态', '入库时间', '操作'].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const qCfg = statusConfig[r.status as keyof typeof statusConfig];
                  const iCfg = inboundStatusConfig[r.inbound_status as keyof typeof inboundStatusConfig] ?? inboundStatusConfig.pending;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-3 text-xs font-mono text-slate-400">{r.record_no}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(r.accepted_at)}</td>
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
                      <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                        {r.actual > 0 ? `${r.actual} ${r.unit}` : '—'}
                      </td>
                      <td className={`px-4 py-3 text-sm font-semibold ${Math.abs(r.deviation) > 5 ? 'text-red-500' : 'text-slate-600'}`}>
                        {r.expected > 0 ? `${r.deviation > 0 ? '+' : ''}${r.deviation}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full w-fit ${qCfg.bg} ${qCfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${qCfg.dot}`} />
                          {qCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{r.inspector || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(r.certificates ?? []).length > 0
                            ? (r.certificates ?? []).map((c: string) => (
                                <span key={c} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                  {c.length > 8 ? `${c.slice(0, 7)}…` : c}
                                </span>
                              ))
                            : <span className="text-xs text-slate-300">—</span>
                          }
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full w-fit ${iCfg.bg} ${iCfg.text}`}>
                          <i className={`${iCfg.icon} text-xs`} />
                          {iCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {formatDate(r.inbound_at)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setDetailRecord(r)}
                          className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-2.5 py-1 rounded-lg cursor-pointer whitespace-nowrap hover:bg-slate-50"
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={12} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <div className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-100">
                          <i className="ri-file-list-3-line text-2xl" />
                        </div>
                        <p className="text-sm">暂无符合条件的入库记录</p>
                        <p className="text-xs">尝试调整筛选条件或日期范围</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Bind Device Modal */}
      {showBindModal && (
        <InboundDeviceBindModal
          currentBoundId={boundDevice?.id ?? null}
          onBind={(device) => {
            bindDevice(device);
            setShowBindModal(false);
            setSyncMsg({ type: 'success', text: `已绑定设备「${device.device_name}」，可点击「同步数据」拉取入库记录` });
          }}
          onClose={() => setShowBindModal(false)}
        />
      )}

      {/* Detail Modal */}
      {detailRecord && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold text-slate-800">验收记录详情</h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">{detailRecord.record_no}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRecord(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <i className="ri-close-line text-slate-500" />
              </button>
            </div>

            <div className="space-y-3">
              {[
                { label: '食材名称', value: detailRecord.ingredient },
                { label: '供应商', value: detailRecord.supplier || '—' },
                { label: '验收时间', value: formatDate(detailRecord.accepted_at) },
                { label: '验收员', value: detailRecord.inspector || '—' },
                { label: '预计重量', value: detailRecord.expected > 0 ? `${detailRecord.expected} ${detailRecord.unit}` : '—' },
                { label: '实际重量', value: detailRecord.actual > 0 ? `${detailRecord.actual} ${detailRecord.unit}` : '—' },
                { label: '偏差', value: detailRecord.expected > 0 ? `${detailRecord.deviation > 0 ? '+' : ''}${detailRecord.deviation}%` : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between py-2 border-b border-slate-50">
                  <span className="text-xs text-slate-400 w-24 flex-shrink-0">{label}</span>
                  <span className="text-sm text-slate-700 text-right">{value}</span>
                </div>
              ))}

              <div className="flex items-start justify-between py-2 border-b border-slate-50">
                <span className="text-xs text-slate-400 w-24 flex-shrink-0">验收结果</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[detailRecord.status].bg} ${statusConfig[detailRecord.status].text}`}>
                  {statusConfig[detailRecord.status].label}
                </span>
              </div>

              <div className="flex items-start justify-between py-2 border-b border-slate-50">
                <span className="text-xs text-slate-400 w-24 flex-shrink-0">入库状态</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${inboundStatusConfig[detailRecord.inbound_status as keyof typeof inboundStatusConfig]?.bg} ${inboundStatusConfig[detailRecord.inbound_status as keyof typeof inboundStatusConfig]?.text}`}>
                  {inboundStatusConfig[detailRecord.inbound_status as keyof typeof inboundStatusConfig]?.label ?? '待入库'}
                </span>
              </div>

              {detailRecord.inbound_at && (
                <div className="flex items-start justify-between py-2 border-b border-slate-50">
                  <span className="text-xs text-slate-400 w-24 flex-shrink-0">入库时间</span>
                  <span className="text-sm text-slate-700">{formatDate(detailRecord.inbound_at)}</span>
                </div>
              )}

              {(detailRecord.certificates ?? []).length > 0 && (
                <div className="flex items-start justify-between py-2">
                  <span className="text-xs text-slate-400 w-24 flex-shrink-0">合格证书</span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {(detailRecord.certificates ?? []).map((c: string) => (
                      <span key={c} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setDetailRecord(null)}
              className="w-full mt-5 text-sm border border-slate-200 rounded-lg py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}