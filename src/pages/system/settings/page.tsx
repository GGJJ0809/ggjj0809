import { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/feature/AppLayout';

interface PortConfig {
  httpPort: number;
  fixedHttpPort: boolean;
  mqttPort: number;
  fixedMqttPort: boolean;
}

interface KeepLogEntry {
  id: string;
  deviceSn: string;
  action: string;
  detail: string;
  status: string;
  time: string;
  timestamp: number;
}

interface PickupConfig {
  stableSeconds: number;
  minDropGrams: number;
}

export default function SettingsPage() {
  const api = (window as any).electronAPI;
  const isElectron = !!api?.dbInfo;

  // Port config state
  const [portConfig, setPortConfig] = useState<PortConfig | null>(null);
  const [portLoading, setPortLoading] = useState(true);
  const [portSaving, setPortSaving] = useState(false);

  // Pickup detection config state
  const [pickupCfg, setPickupCfg] = useState<PickupConfig | null>(null);
  const [editStableSeconds, setEditStableSeconds] = useState('3');
  const [editMinDropGrams, setEditMinDropGrams] = useState('50');
  const [pickupCfgLoading, setPickupCfgLoading] = useState(false);
  const [pickupCfgSaving, setPickupCfgSaving] = useState(false);

  // Keep logs state
  const [keepLogs, setKeepLogs] = useState<KeepLogEntry[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');

  // Form state
  const [editHttpPort, setEditHttpPort] = useState('');
  const [editFixedHttp, setEditFixedHttp] = useState(true);
  const [editMqttPort, setEditMqttPort] = useState('');
  const [editFixedMqtt, setEditFixedMqtt] = useState(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [localPort, setLocalPort] = useState(0);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Load port config
  useEffect(() => {
    async function load() {
      setPortLoading(true);
      try {
        if (isElectron && api) {
          const cfg = await api.portConfig.get();
          setPortConfig(cfg);
          setEditHttpPort(String(cfg.httpPort));
          setEditFixedHttp(cfg.fixedHttpPort);
          setEditMqttPort(String(cfg.mqttPort));
          setEditFixedMqtt(cfg.fixedMqttPort);
          // Get current running port
          try {
            const portInfo = await api.localServer.getPort();
            setLocalPort(portInfo.httpPort || portInfo.port || cfg.httpPort);
          } catch { /* ignore */ }
        } else {
          // Non-electron fallback
          const cfg: PortConfig = { httpPort: 8081, fixedHttpPort: true, mqttPort: 1883, fixedMqttPort: false };
          setPortConfig(cfg);
          setEditHttpPort(String(cfg.httpPort));
          setEditFixedHttp(true);
          setEditMqttPort(String(cfg.mqttPort));
          setEditFixedMqtt(false);
        }
      } finally {
        setPortLoading(false);
      }
    }
    load();
  }, [isElectron]);

  // Load keep logs from local server
  const fetchKeepLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError('');
    try {
      let port = localPort || portConfig?.httpPort || 8081;
      // If in Electron, try to get the actual running port
      if (isElectron && api && port === (portConfig?.httpPort || 8081)) {
        try {
          const info = await api.localServer.getPort();
          if (info.httpPort) port = info.httpPort;
        } catch { /* ignore */ }
      }
      const url = `http://127.0.0.1:${port}/api/keep/logs`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.code === 0) {
        setKeepLogs(json.data.logs || []);
        setLogsTotal(json.data.total || 0);
      } else {
        setLogsError('无法获取留样柜日志');
      }
    } catch (e: unknown) {
      setLogsError(e instanceof Error ? e.message : '请求失败，请检查服务是否运行');
    } finally {
      setLogsLoading(false);
    }
  }, [localPort, portConfig, isElectron]);

  useEffect(() => {
    fetchKeepLogs();
  }, [fetchKeepLogs]);

  // Load pickup detection config from local server
  const fetchPickupConfig = useCallback(async () => {
    setPickupCfgLoading(true);
    try {
      let port = localPort || portConfig?.httpPort || 8081;
      if (isElectron && api && port === (portConfig?.httpPort || 8081)) {
        try {
          const info = await api.localServer.getPort();
          if (info.httpPort) port = info.httpPort;
        } catch { /* ignore */ }
      }
      const res = await fetch(`http://127.0.0.1:${port}/api/pickup-config`);
      const json = await res.json();
      if (json.code === 0 && json.data) {
        setPickupCfg(json.data);
        setEditStableSeconds(String(json.data.stableSeconds));
        setEditMinDropGrams(String(json.data.minDropGrams));
      }
    } catch { /* ignore */ } finally {
      setPickupCfgLoading(false);
    }
  }, [localPort, portConfig, isElectron]);

  useEffect(() => {
    fetchPickupConfig();
  }, [fetchPickupConfig]);

  const handleSavePickupConfig = async () => {
    const stableSeconds = parseInt(editStableSeconds, 10);
    const minDropGrams = parseInt(editMinDropGrams, 10);
    if (isNaN(stableSeconds) || stableSeconds < 1 || stableSeconds > 300) {
      showToast('error', '稳定时长需在 1-300 秒之间');
      return;
    }
    if (isNaN(minDropGrams) || minDropGrams < 1 || minDropGrams > 5000) {
      showToast('error', '最小取餐量需在 1-5000 克之间');
      return;
    }
    setPickupCfgSaving(true);
    try {
      let port = localPort || portConfig?.httpPort || 8081;
      if (isElectron && api && port === (portConfig?.httpPort || 8081)) {
        try {
          const info = await api.localServer.getPort();
          if (info.httpPort) port = info.httpPort;
        } catch { /* ignore */ }
      }
      const res = await fetch(`http://127.0.0.1:${port}/api/pickup-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stableSeconds, minDropGrams }),
      });
      const json = await res.json();
      if (json.code === 0) {
        setPickupCfg(json.data);
        setEditStableSeconds(String(json.data.stableSeconds));
        setEditMinDropGrams(String(json.data.minDropGrams));
        showToast('success', '取餐判定参数已保存，立即生效');
      } else {
        showToast('error', '保存失败');
      }
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : '保存失败，请确认服务已启动');
    } finally {
      setPickupCfgSaving(false);
    }
  };

  const isPickupChanged = pickupCfg
    && (parseInt(editStableSeconds, 10) !== pickupCfg.stableSeconds
      || parseInt(editMinDropGrams, 10) !== pickupCfg.minDropGrams);

  // Auto-refresh keep logs every 10 seconds
  useEffect(() => {
    autoRefreshRef.current = setInterval(fetchKeepLogs, 10000);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [fetchKeepLogs]);

  const handleSavePort = async () => {
    if (!isElectron) {
      showToast('error', '端口配置仅在桌面端可用');
      return;
    }
    const httpPort = parseInt(editHttpPort, 10);
    const mqttPort = parseInt(editMqttPort, 10);
    if (isNaN(httpPort) || httpPort < 1024 || httpPort > 65535) {
      showToast('error', 'HTTP 端口需在 1024-65535 之间');
      return;
    }
    if (isNaN(mqttPort) || mqttPort < 1 || mqttPort > 65535) {
      showToast('error', 'MQTT 端口需在 1-65535 之间');
      return;
    }
    setPortSaving(true);
    try {
      const result = await api.portConfig.set({
        httpPort,
        fixedHttpPort: editFixedHttp,
        mqttPort,
        fixedMqttPort: editFixedMqtt,
      });
      if (result.success) {
        setPortConfig(result.config);
        showToast('success', '端口配置已保存，重启应用后生效');
      } else {
        showToast('error', '保存失败');
      }
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : '保存失败');
    } finally {
      setPortSaving(false);
    }
  };

  const isConfigChanged = portConfig
    && (parseInt(editHttpPort, 10) !== portConfig.httpPort
      || editFixedHttp !== portConfig.fixedHttpPort
      || parseInt(editMqttPort, 10) !== portConfig.mqttPort
      || editFixedMqtt !== portConfig.fixedMqttPort);

  const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
    ok: { label: '成功', bg: 'bg-emerald-50', text: 'text-emerald-600' },
    warn: { label: '告警', bg: 'bg-amber-50', text: 'text-amber-600' },
    error: { label: '失败', bg: 'bg-red-50', text: 'text-red-500' },
  };

  const actionLabels: Record<string, string> = {
    '留样记录上报': '留样上报',
    '开门记录': '开门记录',
    '紧急开门': '紧急开门',
    '柜门状态更新': '状态更新',
    '到期告警': '到期告警',
    '设备状态': '设备上线',
    '拉取食谱': '拉取食谱',
  };

  return (
    <AppLayout title="系统设置" breadcrumb={['系统管理', '系统设置']}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm border ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
          <i className={toast.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
          {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 端口配置 */}
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg">
              <i className="ri-plug-line text-slate-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">服务端口配置</h3>
              <p className="text-xs text-slate-400">修改后需重启应用生效</p>
            </div>
          </div>

          {portLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <i className="ri-loader-4-line animate-spin mr-2" />
              <span className="text-sm">加载配置...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* HTTP Port */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">HTTP 服务端口</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editHttpPort}
                    onChange={(e) => setEditHttpPort(e.target.value)}
                    min={1024}
                    max={65535}
                    className="w-28 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editFixedHttp}
                      onChange={(e) => setEditFixedHttp(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
                    />
                    <span className="text-xs text-slate-500">锁定端口</span>
                  </label>
                  {localPort > 0 && (
                    <span className="text-xs text-slate-400">
                      (当前运行: <strong className="text-slate-700">{localPort}</strong>)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {editFixedHttp
                    ? '端口被占用时不会自动切换，会直接报错提示'
                    : '端口被占用时自动尝试下一个端口'}
                </p>
              </div>

              {/* MQTT Port */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">MQTT Broker 端口</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editMqttPort}
                    onChange={(e) => setEditMqttPort(e.target.value)}
                    min={1}
                    max={65535}
                    className="w-28 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editFixedMqtt}
                      onChange={(e) => setEditFixedMqtt(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
                    />
                    <span className="text-xs text-slate-500">锁定端口</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSavePort}
                  disabled={!isConfigChanged || portSaving || !isElectron}
                  className="flex items-center gap-1.5 text-sm bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className="ri-save-line" />
                  {portSaving ? '保存中...' : '保存配置'}
                </button>
                {!isElectron && (
                  <p className="text-xs text-amber-600">
                    <i className="ri-information-line mr-1" />
                    端口配置仅在桌面端可用
                  </p>
                )}
                {isConfigChanged && isElectron && (
                  <p className="text-xs text-amber-500">
                    <i className="ri-error-warning-line mr-1" />
                    保存后需重启应用
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Quick info */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">服务端口说明</h3>
            <div className="space-y-3 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <i className="ri-check-line text-emerald-500 mt-0.5 flex-shrink-0" />
                <span><strong>HTTP 端口 (8081)</strong>：设备通过此端口注册、拉取菜品、上报留样数据。端口锁定后，8082 代理也会自动指向此端口。</span>
              </div>
              <div className="flex items-start gap-2">
                <i className="ri-check-line text-emerald-500 mt-0.5 flex-shrink-0" />
                <span><strong>MQTT 端口 (1883)</strong>：取餐设备通过 MQTT 协议注册和接收实时推送。</span>
              </div>
              <div className="flex items-start gap-2">
                <i className="ri-check-line text-emerald-500 mt-0.5 flex-shrink-0" />
                <span><strong>8082 代理端口</strong>：自动启动，将 8082 的请求转发到 HTTP 主端口（部分设备固件硬编码 8082）。</span>
              </div>
              <div className="flex items-start gap-2">
                <i className="ri-check-line text-amber-500 mt-0.5 flex-shrink-0" />
                <span>如果端口被其他程序占用，可在此修改或关闭占用程序后重启应用。</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 取餐判定参数 ───────────────────────────────────────────────── */}
      <div className="mt-6 bg-white rounded-xl border border-slate-100 p-5">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 flex items-center justify-center bg-emerald-50 rounded-lg">
            <i className="ri-scales-line text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">取餐判定参数</h3>
            <p className="text-xs text-slate-400">调整设备取餐记录的检测灵敏度，保存后立即生效（无需重启）</p>
          </div>
        </div>

        {pickupCfgLoading ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <i className="ri-loader-4-line animate-spin mr-2" />
            <span className="text-sm">加载配置...</span>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-6">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">稳定时长（秒）</label>
              <input
                type="number"
                value={editStableSeconds}
                onChange={(e) => setEditStableSeconds(e.target.value)}
                min={1}
                max={300}
                className="w-28 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
              <p className="text-xs text-slate-400 mt-1">重量停止下降多久算「一次取餐结束」</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">最小取餐量（克）</label>
              <input
                type="number"
                value={editMinDropGrams}
                onChange={(e) => setEditMinDropGrams(e.target.value)}
                min={1}
                max={5000}
                className="w-28 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
              <p className="text-xs text-slate-400 mt-1">低于此取餐量不记录，防抖动噪声</p>
            </div>
            <div className="flex items-end gap-3">
              <button
                type="button"
                onClick={handleSavePickupConfig}
                disabled={!isPickupChanged || pickupCfgSaving}
                className="flex items-center gap-1.5 text-sm bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="ri-save-line" />
                {pickupCfgSaving ? '保存中...' : '保存参数'}
              </button>
              {isPickupChanged && (
                <p className="text-xs text-emerald-600 mb-2">
                  <i className="ri-information-line mr-1" />
                  保存后立即生效
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── 留样柜设备日志 ───────────────────────────────────────────────── */}
      <div className="mt-6 bg-white rounded-xl border border-slate-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center bg-amber-50 rounded-lg">
              <i className="ri-file-list-3-line text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">留样柜设备日志</h3>
              <p className="text-xs text-slate-400">
                设备上报的所有操作记录，共 {logsTotal} 条 · 每10秒自动刷新
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchKeepLogs}
            disabled={logsLoading}
            className="flex items-center gap-1.5 text-xs border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <i className={`ri-refresh-line ${logsLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        <div className="overflow-x-auto">
          {logsLoading && keepLogs.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <i className="ri-loader-4-line animate-spin text-xl mr-2" />
              <span className="text-sm">加载日志...</span>
            </div>
          ) : logsError && keepLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <i className="ri-link-unlink text-slate-300 text-3xl mb-2" />
              <p className="text-sm text-slate-500 mb-1">无法获取设备日志</p>
              <p className="text-xs text-slate-400 mb-3">{logsError}</p>
              <button
                type="button"
                onClick={fetchKeepLogs}
                className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-200 cursor-pointer whitespace-nowrap"
              >
                重试
              </button>
            </div>
          ) : keepLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <i className="ri-inbox-archive-line text-slate-200 text-4xl mb-3" />
              <p className="text-sm text-slate-400">暂无留样柜设备日志</p>
              <p className="text-xs text-slate-300 mt-1">设备上报数据后会自动记录</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap w-36">时间</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap">设备 SN</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap">操作类型</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">详情</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap w-20">状态</th>
                </tr>
              </thead>
              <tbody>
                {keepLogs.map((log) => {
                  const sc = statusConfig[log.status] || statusConfig.ok;
                  return (
                    <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap font-mono">
                        {log.time}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-slate-500 whitespace-nowrap">
                        {log.deviceSn}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-slate-700 font-medium whitespace-nowrap">
                          {actionLabels[log.action] || log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 max-w-xs truncate">
                        {log.detail}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'warn' ? 'bg-amber-400' : log.status === 'error' ? 'bg-red-400' : 'bg-emerald-400'}`} />
                          {sc.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}