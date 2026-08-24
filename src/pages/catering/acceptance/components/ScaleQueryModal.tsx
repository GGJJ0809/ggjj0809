import { useState, useEffect, useRef } from 'react';
import type { ScaleConfig } from '@/services/scaleApi';
import {
  fetchMaterialCategoryList,
  extractMaterials,
  getMaterialName,
  getExpectedWeight,
  getActualWeight,
} from '@/services/scaleApi';

export interface ImportedRecord {
  id: string;
  time: string;
  ingredient: string;
  supplier: string;
  expected: number;
  actual: number;
  deviation: number;
  unit: string;
  inspector: string;
  status: 'pass' | 'warning' | 'fail';
  certificates: string[];
}

interface Props {
  config: ScaleConfig;
  onImport: (records: ImportedRecord[]) => void;
  onClose: () => void;
  onGoConfig?: () => void;
}

function calcStatus(deviation: number): 'pass' | 'warning' | 'fail' {
  const abs = Math.abs(deviation);
  if (abs > 8) return 'fail';
  if (abs > 3) return 'warning';
  return 'pass';
}

function calcDeviation(expected: number, actual: number): number {
  if (expected === 0) return 0;
  return parseFloat((((actual - expected) / expected) * 100).toFixed(1));
}

export default function ScaleQueryModal({ config, onImport, onClose, onGoConfig }: Props) {
  const isConfigured = Boolean(config.baseUrl && config.merchantId && config.xToken);
  const [fetchMaterialId, setFetchMaterialId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<ImportedRecord[]>([]);
  const [inspector, setInspector] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanMode, setScanMode] = useState(true);
  const [scanFlash, setScanFlash] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [showRaw, setShowRaw] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 弹窗打开后自动聚焦到输入框，方便扫码枪直接扫入
  useEffect(() => {
    if (scanMode) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [scanMode]);

  const handleScanInput = (value: string) => {
    setFetchMaterialId(value);
    setError(null);
    // 扫码枪扫完会在末尾加 Enter，由 onKeyDown 触发查询
  };

  const triggerScanFlash = () => {
    setScanFlash(true);
    setTimeout(() => setScanFlash(false), 600);
  };

  const handleQuery = async () => {
    if (!fetchMaterialId.trim()) {
      setError('请输入领料单号');
      return;
    }
    setLoading(true);
    setError(null);
    setRecords([]);
    setSelected(new Set());
    setRawResponse(null);
    setShowRaw(false);

    try {
      const resp = await fetchMaterialCategoryList(config, fetchMaterialId.trim());
      setRawResponse(resp);
      const materials = extractMaterials(resp);

      if (materials.length === 0) {
        setError('未查询到食材数据，请展开「原始响应」查看接口返回内容');
        setShowRaw(true);
        setLoading(false);
        return;
      }

      const now = new Date();
      const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      const imported: ImportedRecord[] = materials.map((m, idx) => {
        const expected = getExpectedWeight(m);
        const actual = getActualWeight(m);
        const deviation = calcDeviation(expected, actual);
        return {
          id: `AC${String(Date.now()).slice(-6)}${String(idx).padStart(2, '0')}`,
          time: timeStr,
          ingredient: getMaterialName(m),
          supplier: m.supplier ?? '',
          expected,
          actual,
          deviation,
          unit: m.unit ?? 'kg',
          inspector: inspector || '—',
          status: calcStatus(deviation),
          certificates: [],
        };
      });

      setRecords(imported);
      setSelected(new Set(imported.map((r) => r.id)));
      if (scanMode) {
        triggerScanFlash();
        // 扫码模式下查询完成后清空输入框并重新聚焦，方便继续扫下一单
        setTimeout(() => {
          setFetchMaterialId('');
          inputRef.current?.focus();
        }, 800);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === records.length) setSelected(new Set());
    else setSelected(new Set(records.map((r) => r.id)));
  };

  const handleImport = () => {
    const toImport = records
      .filter((r) => selected.has(r.id))
      .map((r) => ({ ...r, inspector: inspector || r.inspector }));
    onImport(toImport);
    onClose();
  };

  const statusConfig = {
    pass: { label: '合格', bg: 'bg-emerald-50', text: 'text-emerald-600' },
    warning: { label: '偏差预警', bg: 'bg-amber-50', text: 'text-amber-600' },
    fail: { label: '不合格', bg: 'bg-red-50', text: 'text-red-600' },
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b border-slate-100 transition-colors duration-300 ${scanFlash ? 'bg-emerald-50' : 'bg-white'}`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50">
              <i className="ri-scales-3-line text-emerald-600 text-base" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">读取电子秤数据</h3>
              {scanMode && (
                <p className="text-xs text-emerald-600 flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  扫码模式已启用，可直接扫码
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 扫码 / 手动 切换 */}
            <button
              type="button"
              onClick={() => setScanMode((v) => !v)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${
                scanMode
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <i className={scanMode ? 'ri-barcode-line' : 'ri-keyboard-line'} />
              {scanMode ? '扫码模式' : '手动输入'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"
            >
              <i className="ri-close-line text-slate-500" />
            </button>
          </div>
        </div>

        {/* Not configured warning */}
        {!isConfigured && (
          <div className="flex items-center gap-3 mx-6 mt-4 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
              <i className="ri-error-warning-line text-amber-500 text-lg" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-800">尚未配置电子秤设备</p>
              <p className="text-xs text-amber-600 mt-0.5">请先填写 Base URL、Merchant-Id 和 X-Token，才能连接电子秤读取数据</p>
            </div>
            {onGoConfig && (
              <button
                type="button"
                onClick={() => { onClose(); onGoConfig(); }}
                className="flex items-center gap-1 text-xs text-amber-700 border border-amber-200 bg-white px-3 py-1.5 rounded-lg hover:bg-amber-50 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-settings-3-line" />去配置
              </button>
            )}
          </div>
        )}

        {/* Query */}
        <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/50">
          {scanMode && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg">
              <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                <i className="ri-barcode-line text-emerald-600 text-lg" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-emerald-800">扫码枪模式</p>
                <p className="text-xs text-emerald-600">将光标保持在输入框内，扫码枪扫描后将自动触发查询</p>
              </div>
              <button
                type="button"
                onClick={() => { inputRef.current?.focus(); }}
                className="text-xs text-emerald-600 border border-emerald-200 px-2 py-1 rounded cursor-pointer whitespace-nowrap hover:bg-emerald-100"
              >
                重新聚焦
              </button>
            </div>
          )}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                领料单号 <span className="text-red-500">*</span>
                {scanMode && <span className="ml-1.5 text-emerald-500 font-normal">（扫码枪直接扫入）</span>}
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={fetchMaterialId}
                  onChange={(e) => scanMode ? handleScanInput(e.target.value) : (setFetchMaterialId(e.target.value), setError(null))}
                  placeholder={scanMode ? '等待扫码枪输入...' : '请输入领料单号'}
                  className={`w-full text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none transition-colors ${
                    scanMode
                      ? 'border-emerald-300 focus:border-emerald-500 pr-8'
                      : 'border-slate-200 focus:border-slate-400'
                  }`}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                  onBlur={() => {
                    // 扫码模式下失焦后短暂提示
                    if (scanMode && !loading) {
                      setTimeout(() => inputRef.current?.focus(), 200);
                    }
                  }}
                />
                {scanMode && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
                    <i className="ri-barcode-line text-emerald-400 text-sm" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">验收员姓名</label>
              <input
                type="text"
                value={inspector}
                onChange={(e) => setInspector(e.target.value)}
                placeholder="请输入验收员姓名"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-slate-400"
              />
            </div>
            <button
              type="button"
              onClick={handleQuery}
              disabled={loading || !isConfigured}
              title={!isConfigured ? '请先在「配置」中填写电子秤连接信息' : undefined}
              className="flex items-center gap-1.5 text-sm bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <i className="ri-loader-4-line animate-spin" />
                  查询中...
                </>
              ) : (
                <>
                  <i className="ri-search-line" />
                  查询
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <i className="ri-error-warning-line" />
              {error}
            </div>
          )}

          {/* 原始响应调试面板 */}
          {rawResponse && (
            <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 cursor-pointer text-xs text-slate-500 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <i className="ri-code-line text-slate-400" />
                  <span className="font-medium">原始响应（调试）</span>
                  {records.length === 0 && (
                    <span className="text-amber-500 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full text-xs">
                      请查看返回内容
                    </span>
                  )}
                </div>
                <i className={`${showRaw ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-slate-400`} />
              </button>
              {showRaw && (
                <pre className="px-3 py-3 text-xs font-mono text-slate-700 whitespace-pre-wrap break-all max-h-64 overflow-y-auto bg-white leading-relaxed">
                  {JSON.stringify(rawResponse, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        {records.length > 0 && (
          <div className="flex-1 overflow-auto">
            <div className="px-6 py-3 flex items-center justify-between border-b border-slate-50">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.size === records.length}
                  onChange={toggleAll}
                  className="cursor-pointer"
                />
                <span className="text-xs text-slate-500">
                  共 {records.length} 条，已选 {selected.size} 条
                </span>
              </div>
              <span className="text-xs text-slate-400">确认数据后点击「导入验收」</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50">
                  {['', '食材名称', '预期重量', '实际重量', '偏差', '单位', '状态'].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-slate-400 px-4 py-2 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const cfg = statusConfig[r.status];
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${selected.has(r.id) ? '' : 'opacity-40'}`}
                    >
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-800 whitespace-nowrap">{r.ingredient}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-600">{r.expected || '—'}</td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-slate-800">{r.actual || '—'}</td>
                      <td className={`px-4 py-2.5 text-sm font-semibold ${Math.abs(r.deviation) > 5 ? 'text-red-500' : 'text-slate-600'}`}>
                        {r.expected > 0 ? (r.deviation > 0 ? `+${r.deviation}%` : `${r.deviation}%`) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">{r.unit}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {records.length === 0 && !loading && !error && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400">
            <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-slate-100 mb-4">
              {scanMode
                ? <i className="ri-barcode-line text-3xl text-emerald-400" />
                : <i className="ri-scales-3-line text-3xl" />
              }
            </div>
            {scanMode ? (
              <>
                <p className="text-sm font-medium text-slate-600">等待扫码枪扫描...</p>
                <p className="text-xs mt-1.5 text-slate-400">将扫码枪对准领料单上的条形码扫描</p>
                <div className="mt-4 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  输入框已聚焦，可直接扫码
                </div>
              </>
            ) : (
              <>
                <p className="text-sm">输入领料单号后点击查询</p>
                <p className="text-xs mt-1">系统将自动读取电子秤称重数据</p>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            <i className="ri-information-line mr-1" />
            偏差超过 3% 预警，超过 8% 不合格
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              取消
            </button>
            {records.length > 0 && (
              <button
                type="button"
                onClick={handleImport}
                disabled={selected.size === 0}
                className="flex items-center gap-1.5 text-sm bg-emerald-500 text-white rounded-lg px-4 py-2 hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="ri-download-cloud-line" />
                导入验收（{selected.size} 条）
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}