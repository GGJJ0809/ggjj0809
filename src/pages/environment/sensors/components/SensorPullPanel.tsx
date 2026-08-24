import { useState, useEffect, useRef, useCallback } from 'react';
import type { SensorHttpDevice } from '@/hooks/useSensorHttpConfig';

interface PullLog {
  id: string;
  deviceName: string;
  zone: string;
  time: string;
  status: 'ok' | 'error';
  msg: string;
  values?: Record<string, number | null>;
  smokeAlarm?: boolean;
  sensorId?: string;
  payload?: Record<string, unknown>;
}

interface MqttLogEntry {
  id: string;
  sensorId: string;
  topic: string;
  payload: Record<string, unknown>;
  status: 'ok' | 'error';
  msg: string;
  time: string;
  timestamp: number;
}

interface Props {
  devices: SensorHttpDevice[];
  onClose: () => void;
}

// ── 查询 MQTT 推送日志 ──
async function fetchMqttLogs(since: number): Promise<MqttLogEntry[]> {
  try {
    const LOCAL_PORT = 8081;
    const resp = await fetch(`http://localhost:${LOCAL_PORT}/api/sensor/mqtt-logs?since=${since}`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return [];
    const json = await resp.json();
    return (json.data?.logs || []) as MqttLogEntry[];
  } catch {
    return [];
  }
}

export default function SensorPullPanel({ devices, onClose }: Props) {
  const [logs, setLogs] = useState<PullLog[]>([]);
  const [mqttSince, setMqttSince] = useState(0);
  const mqttTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const enabledDevices = devices.filter((d) => d.enabled);

  const addLog = useCallback((log: Omit<PullLog, 'id'>) => {
    setLogs((prev) => [{ ...log, id: `log_${Date.now()}_${Math.random()}` }, ...prev].slice(0, 100));
  }, []);

  // MQTT 推送日志轮询
  useEffect(() => {
    const checkMqttLogs = async () => {
      const newLogs = await fetchMqttLogs(mqttSince);
      if (newLogs.length > 0) {
        setMqttSince(newLogs[0]?.timestamp || Date.now());
        const mqttDevices = devices.filter((d) => d.enabled);
        newLogs.forEach((entry) => {
          const matchedDevice = mqttDevices.find((d) => entry.sensorId === d.sensorId || entry.topic?.includes(d.sensorId));
          const isGatewayOnline = entry.topic?.includes('back-device-online-v4') || entry.topic?.includes('back-device-heart');
          const zoneName = isGatewayOnline ? '网关' : (matchedDevice?.zone || '未知区域');
          const deviceName = isGatewayOnline ? entry.sensorId : (matchedDevice?.name || entry.sensorId);
          addLog({
            deviceName,
            zone: zoneName,
            time: entry.time,
            status: entry.status,
            msg: entry.msg,
            sensorId: entry.sensorId,
            payload: entry.payload,
          });
        });
      }
    };
    checkMqttLogs();
    mqttTimerRef.current = setInterval(checkMqttLogs, 3000);
    return () => {
      if (mqttTimerRef.current) clearInterval(mqttTimerRef.current);
    };
  }, [mqttSince, devices, addLog]);

  useEffect(() => {
    return () => {
      if (mqttTimerRef.current) clearInterval(mqttTimerRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-50">
              <i className="ri-signal-tower-line text-base text-emerald-500" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">MQTT 推送数据监控</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {enabledDevices.length} 个已启用设备 · 每 3 秒自动刷新 · Topic: back-device-iot-sensor/{'{'}merchantId{'}'}/{'{'}gatewaySn{'}'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {enabledDevices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <div className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100 mb-3">
              <i className="ri-sensor-line text-2xl" />
            </div>
            <p className="text-sm font-medium">暂无已启用的传感器</p>
            <p className="text-xs mt-1">请先在传感器管理中配置 MQTT Topic 并启用</p>
          </div>
        ) : (
          <>
            {/* Device list header */}
            <div className="px-6 py-3 border-b border-slate-50 flex-shrink-0">
              <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                <i className="ri-list-check-2" />监听中的设备（{enabledDevices.length} 个）
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {enabledDevices.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-400 animate-pulse" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{d.name}</p>
                      <p className="text-xs text-slate-400 truncate font-mono">
                        {d.mqttTopic || '未配置 Topic'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Logs */}
            <div className="flex-1 overflow-y-auto px-6 py-3">
              <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                <i className="ri-terminal-line" />MQTT 推送日志
                {logs.length > 0 && <span className="font-normal text-slate-400 ml-1">（{logs.length} 条）</span>}
                <span className="ml-2 text-xs text-emerald-500 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                  <i className="ri-refresh-line mr-1" />每 3 秒自动刷新
                </span>
              </p>
              {logs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <i className="ri-file-list-3-line text-2xl mb-2 block" />
                  <p className="text-xs">暂无 MQTT 推送数据</p>
                  <p className="text-xs mt-0.5">确认网关已连接 MQTT Broker 并开始推送数据</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((log) => (
                    <div key={log.id} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg text-xs ${
                      log.status === 'ok' ? 'bg-emerald-50' : 'bg-red-50'
                    }`}>
                      <span className="text-slate-400 font-mono flex-shrink-0 mt-0.5">{log.time}</span>
                      <i className={`flex-shrink-0 mt-0.5 ${
                        log.status === 'ok' ? 'ri-checkbox-circle-line text-emerald-500' : 'ri-error-warning-line text-red-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <span className={`font-medium ${
                          log.status === 'ok' ? 'text-emerald-700' : 'text-red-600'
                        }`}>
                          [{log.zone}] {log.deviceName}
                        </span>
                        <span className={`ml-1 ${log.status === 'error' ? 'text-red-500' : 'text-slate-500'}`}>
                          {log.msg}
                        </span>
                        {log.values && (
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-emerald-600 font-mono">
                            {Object.entries(log.values)
                              .filter(([, v]) => v !== null && v !== undefined)
                              .map(([k, v]) => (
                                <span key={k}>{k}: {v}</span>
                              ))}
                          </div>
                        )}
                        {log.payload && (
                          <div className="mt-1 text-[10px] text-slate-400 font-mono bg-slate-100 rounded px-2 py-1 truncate">
                            {JSON.stringify(log.payload)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}