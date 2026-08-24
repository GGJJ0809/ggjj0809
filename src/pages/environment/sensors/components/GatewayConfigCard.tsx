import { useState, useCallback } from 'react';
import { loadSensorGateway, saveSensorGateway } from '@/hooks/useSensorHttpConfig';
import type { SensorGatewayConfig } from '@/hooks/useSensorHttpConfig';
import { getLocalServerUrl } from '@/lib/localServer';

interface RegisterResult {
  ok: boolean;
  msg: string;
}

interface DiagResult {
  path: string;
  status: 'ok' | 'error' | 'running';
  responseCode?: number;
  hasKey?: boolean;
  hasExchangeKey?: boolean;
  keyValue?: string;
  keyLen?: number;
  exchangeKeyValue?: string;
  rawSnippet?: string;
  msg: string;
}

async function registerGatewayDevice(gw: SensorGatewayConfig): Promise<RegisterResult> {
  if (!gw.gatewaySn?.trim() || !gw.gatewayKey?.trim()) {
    return { ok: false, msg: '请先填写网关 SN 和 KEY' };
  }
  try {
    const url = getLocalServerUrl('/api/sensor/sync-bindings');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gatewaySn: gw.gatewaySn.trim(),
        gatewayKey: gw.gatewayKey.trim(),
        devices: [],
      }),
    });
    if (!res.ok) {
      const reg = await fetch(getLocalServerUrl('/api/device/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sn: gw.gatewaySn.trim(), key: gw.gatewayKey.trim() }),
      });
      const json = await reg.json().catch(() => ({ code: -1 }));
      if (reg.ok && (json.code === 10000 || json.code === 200 || json.code === 0)) {
        return { ok: true, msg: '网关已成功注册到本地服务（通过 register 接口）' };
      }
      return { ok: false, msg: json.msg || `HTTP ${res.status}` };
    }
    const json = await res.json().catch(() => ({ code: -1 }));
    if (json.code === 0 || json.code === 10000 || json.code === 200) {
      return { ok: true, msg: '网关已成功注册到本地服务（KEY 已写入设备表）' };
    }
    return { ok: false, msg: json.msg || '注册失败' };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : '网络错误' };
  }
}

async function diagPath(path: string, sn: string): Promise<DiagResult> {
  const url = getLocalServerUrl(path);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'machine-sn': sn || 'TEST_SN', 'machine-num': sn || 'TEST_SN' },
    });
    const text = await res.text().catch(() => '');
    let json: Record<string, any> = {};
    try { json = JSON.parse(text); } catch { /* not json */ }
    const responseCode = res.status;
    const dataObj = json.data as Record<string, any> | undefined;
    const hasKey = dataObj && typeof dataObj === 'object' && 'key' in dataObj;
    const hasExchangeKey = dataObj && typeof dataObj === 'object' && 'exchangeKey' in dataObj;
    const keyValue = hasKey ? String(dataObj!.key) : undefined;
    const exchangeKeyValue = hasExchangeKey ? String(dataObj!.exchangeKey) : undefined;
    const keyLen = keyValue ? keyValue.length : undefined;
    const rawSnippet = text.slice(0, 300);
    if (res.ok && (json.code === 10000 || json.code === 0 || json.code === 200)) {
      return {
        path,
        status: 'ok',
        responseCode,
        hasKey,
        hasExchangeKey,
        keyValue,
        keyLen,
        exchangeKeyValue,
        rawSnippet,
        msg: hasKey || hasExchangeKey ? `接口正常，返回了 key` : `接口正常，但响应中无 key 字段`,
      };
    }
    return {
      path,
      status: 'error',
      responseCode,
      hasKey,
      hasExchangeKey,
      rawSnippet,
      msg: `HTTP ${responseCode}，code=${json.code ?? '?'}`,
    };
  } catch (e) {
    return {
      path,
      status: 'error',
      msg: e instanceof Error ? e.message : '请求失败（网络错误或服务未启动）',
    };
  }
}

export default function GatewayConfigCard() {
  const [gw, setGw] = useState<SensorGatewayConfig>(() => loadSensorGateway() ?? { host: '192.168.2.33', port: 8081 });
  const [expanded, setExpanded] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [diagResults, setDiagResults] = useState<DiagResult[]>([]);
  const [diagRunning, setDiagRunning] = useState(false);

  const update = useCallback((patch: Partial<SensorGatewayConfig>) => {
    setGw((prev) => {
      const next = { ...prev, ...patch };
      saveSensorGateway(next);
      return next;
    });
  }, []);

  const handleRegister = useCallback(async () => {
    setRegistering(true);
    setRegisterResult(null);
    const result = await registerGatewayDevice(gw);
    setRegisterResult(result);
    setRegistering(false);
    setTimeout(() => setRegisterResult(null), 8000);
  }, [gw]);

  const handleDiag = useCallback(async () => {
    setDiagRunning(true);
    setDiagResults([]);
    const sn = gw.gatewaySn?.trim() || 'TEST_SN';
    const paths = [
      '/api/health',
      '/yunshitang/api/android/other/timestamp',
      '/yunshitang/api/android/other/exchange/key',
      '/api/v4/device/common/base/timestamp',
      '/api/v4/device/common/base/exchange/key',
      '/api/v1/android/back/timestamp',
      '/api/v1/android/back/exchange/key',
    ];
    for (const p of paths) {
      setDiagResults((prev) => [...prev, { path: p, status: 'running', msg: '测试中...' }]);
      const r = await diagPath(p, sn);
      setDiagResults((prev) => prev.map((x) => (x.path === p ? r : x)));
    }
    setDiagRunning(false);
  }, [gw]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden mb-5">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-amber-50">
            <i className="ri-router-line text-amber-600 text-base" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-800">传感器网关配置</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {gw.gatewaySn
                ? `网关 SN: ${gw.gatewaySn}${gw.merchantId ? ` · 商户号: ${gw.merchantId}` : ''}`
                : '配置 MQTT 传感器网关 SN / KEY / 商户号，确保密钥交换成功'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {gw.gatewaySn && (
            <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-full">
              已配置
            </span>
          )}
          {expanded ? <i className="ri-arrow-up-s-line text-slate-400" /> : <i className="ri-arrow-down-s-line text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-50 pt-4 space-y-4">
          {/* 说明横幅 */}
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            <i className="ri-information-line text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 leading-relaxed">
              <p className="font-semibold mb-1">传感器网关密钥交换失败排查指南</p>
              <p>
                若设备屏幕显示「交换密钥失败」或「设备未在后台添加」，说明
                <strong> 网关 SN + KEY 未注册</strong>，或密钥交换响应格式不匹配。请：
              </p>
              <ol className="mt-1.5 ml-3 list-decimal space-y-0.5">
                <li>填写 SN / KEY / 商户号后点「注册网关到本地」</li>
                <li>点「接口诊断」确认各路径正常响应，<strong>特别关注 key 值的长度是否 ≥ 16</strong></li>
                <li>注册成功后<strong>重启传感器网关设备</strong></li>
              </ol>
            </div>
          </div>

          {/* 表单区 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 网关 SN */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                网关 SN <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-2 focus-within:border-amber-400 bg-white">
                <i className="ri-router-line text-slate-400 text-sm flex-shrink-0" />
                <input
                  type="text"
                  value={gw.gatewaySn ?? ''}
                  onChange={(e) => update({ gatewaySn: e.target.value })}
                  placeholder="如：2000002972"
                  className="flex-1 text-sm border-none outline-none bg-transparent font-mono text-slate-700 min-w-0"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">设备屏幕「关于设备」→ 序列号</p>
            </div>

            {/* 网关 KEY */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                网关 KEY <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-2 focus-within:border-amber-400 bg-white">
                <i className="ri-key-2-line text-slate-400 text-sm flex-shrink-0" />
                <input
                  type="text"
                  value={gw.gatewayKey ?? ''}
                  onChange={(e) => update({ gatewayKey: e.target.value })}
                  placeholder="如：541252"
                  className="flex-1 text-sm border-none outline-none bg-transparent font-mono text-slate-700 min-w-0"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">设备屏幕「关于设备」→ 验证码</p>
            </div>

            {/* 商户号 */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                商户号 <span className="text-slate-400 font-normal">(MQTT 认证)</span>
              </label>
              <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-2 focus-within:border-amber-400 bg-white">
                <i className="ri-building-2-line text-slate-400 text-sm flex-shrink-0" />
                <input
                  type="text"
                  value={gw.merchantId ?? ''}
                  onChange={(e) => update({ merchantId: e.target.value })}
                  placeholder="如：586919357196537900"
                  className="flex-1 text-sm border-none outline-none bg-transparent font-mono text-slate-700 min-w-0"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">MQTT 认证用户名: backDevice@商户号@SN</p>
            </div>
          </div>

          {/* MQTT Topic 预览 */}
          {gw.gatewaySn && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
              <p className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                <i className="ri-signal-tower-line text-slate-400" />
                MQTT 推送 Topic 预览
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 w-24 flex-shrink-0">数据推送</span>
                  <code className="font-mono text-emerald-600 bg-white border border-slate-200 rounded px-2 py-0.5 text-xs">
                    back-device-iot-sensor/{gw.merchantId || '{merchantId}'}/{gw.gatewaySn}
                  </code>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 w-24 flex-shrink-0">设备在线</span>
                  <code className="font-mono text-sky-600 bg-white border border-slate-200 rounded px-2 py-0.5 text-xs">
                    back-device-online-v4.{gw.merchantId || '{merchantId}'}.{gw.gatewaySn}
                  </code>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 w-24 flex-shrink-0">MQTT 认证</span>
                  <code className="font-mono text-amber-600 bg-white border border-slate-200 rounded px-2 py-0.5 text-xs">
                    backDevice@{gw.merchantId || '{merchantId}'}@{gw.gatewaySn}
                    {' '}/ 密码: {gw.gatewaySn}
                  </code>
                </div>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleRegister}
              disabled={registering || !gw.gatewaySn?.trim() || !gw.gatewayKey?.trim()}
              className="flex items-center gap-2 text-sm bg-amber-500 text-white px-4 py-2.5 rounded-xl hover:bg-amber-600 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {registering ? (
                <><i className="ri-loader-4-line animate-spin" />注册中...</>
              ) : (
                <><i className="ri-shield-keyhole-line" />注册网关到本地</>
              )}
            </button>

            <button
              type="button"
              onClick={handleDiag}
              disabled={diagRunning}
              className="flex items-center gap-2 text-sm border border-sky-200 text-sky-600 bg-sky-50 px-4 py-2.5 rounded-xl hover:bg-sky-100 cursor-pointer whitespace-nowrap disabled:opacity-50 transition-colors"
            >
              {diagRunning ? (
                <><i className="ri-loader-4-line animate-spin" />诊断中...</>
              ) : (
                <><i className="ri-stethoscope-line" />接口诊断</>
              )}
            </button>

            <div className="text-xs text-slate-400 flex items-center gap-1">
              <i className="ri-information-line" />
              注册后网关 SN/KEY 写入本地设备表，密钥交换自动使用正确 KEY
            </div>
          </div>

          {/* 注册结果提示 */}
          {registerResult && (
            <div
              className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
                registerResult.ok
                  ? 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                  : 'bg-red-50 border border-red-100 text-red-700'
              }`}
            >
              <i className={registerResult.ok ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} />
              {registerResult.msg}
              {registerResult.ok && (
                <span className="ml-2 text-emerald-600 font-medium">
                  — 请重启传感器网关设备以重新初始化
                </span>
              )}
            </div>
          )}

          {/* 接口诊断结果 */}
          {diagResults.length > 0 && (
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <i className="ri-stethoscope-line text-slate-500 text-sm" />
                <span className="text-xs font-semibold text-slate-600">接口诊断结果（含 key 值详情）</span>
                <span className="text-xs text-slate-400 ml-auto">
                  绿色=正常 · 红色=异常 · <strong>key 长度 &lt; 16 的设备可能拒绝</strong>
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {diagResults.map((r) => (
                  <div key={r.path} className="flex items-start gap-3 px-4 py-2.5">
                    <div className="flex-shrink-0 mt-0.5">
                      {r.status === 'running' && <i className="ri-loader-4-line animate-spin text-slate-400 text-sm" />}
                      {r.status === 'ok' && r.hasKey && (r.keyLen && r.keyLen >= 16 ? (
                        <i className="ri-checkbox-circle-fill text-emerald-500 text-sm" />
                      ) : (
                        <i className="ri-alert-fill text-orange-400 text-sm" />
                      ))}
                      {r.status === 'ok' && !r.hasKey && <i className="ri-checkbox-circle-line text-slate-400 text-sm" />}
                      {r.status === 'error' && <i className="ri-close-circle-line text-red-400 text-sm" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className={`text-xs font-mono ${r.status === 'ok' && r.hasKey ? 'text-emerald-700 font-bold' : r.status === 'error' ? 'text-slate-400' : 'text-slate-600'}`}>
                          {r.path}
                        </code>
                        {r.responseCode && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${r.responseCode < 300 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                            HTTP {r.responseCode}
                          </span>
                        )}
                        {r.hasKey && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${r.keyLen && r.keyLen >= 16 ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                            key={r.keyValue?.slice(0, 24)}{r.keyValue && r.keyValue.length > 24 ? '...' : ''} (len={r.keyLen})
                          </span>
                        )}
                        {r.hasExchangeKey && (
                          <span className="text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded font-mono">
                            exchKey={r.exchangeKeyValue?.slice(0, 16)}...
                          </span>
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 ${r.status === 'error' ? 'text-red-500' : 'text-slate-400'}`}>
                        {r.msg}
                      </p>
                      {r.hasKey && r.keyLen && r.keyLen < 16 && (
                        <p className="text-xs mt-1 text-orange-600 bg-orange-50 rounded px-2 py-1 border border-orange-100">
                          <i className="ri-error-warning-line mr-1" />
                          <strong>key 太短 ({r.keyLen} 字符)</strong> — 传感器网关固件可能要求 key ≥ 16 字符才接受。
                          请确保设备 KEY 字段填写正确（至少 6 位），服务器会自动增强为 32 位安全密钥。
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {!diagRunning && (
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
                  {(() => {
                    const keyPaths = diagResults.filter((r) => r.status === 'ok' && r.hasKey);
                    const shortKeyPaths = keyPaths.filter((r) => r.keyLen && r.keyLen < 16);
                    if (shortKeyPaths.length > 0) {
                      return (
                        <p className="text-xs text-orange-700">
                          <i className="ri-alert-fill mr-1" />
                          <strong>警告</strong>：以下路径返回的 key 长度不足 16：{shortKeyPaths.map((r) => r.path).join('、')}
                          {' '}— 传感器网关固件可能拒绝短 key。请重启应用后再诊断（v6 版本已自动增强短 key）。
                        </p>
                      );
                    }
                    if (keyPaths.length > 0) {
                      return (
                        <p className="text-xs text-emerald-700">
                          <i className="ri-checkbox-circle-fill mr-1" />
                          <strong>服务器已就绪</strong>：{keyPaths.length} 条路径返回 key，key 长度均合格。
                          {' '}— 如果设备仍报错，说明设备固件校验的字段与服务器响应不匹配，请查看服务器日志进一步排查。
                        </p>
                      );
                    }
                    const errorCount = diagResults.filter((r) => r.status === 'error').length;
                    if (errorCount === diagResults.length) {
                      return (
                        <p className="text-xs text-red-600">
                          <i className="ri-error-warning-line mr-1" />
                          所有接口请求失败，请确认服务已启动（8081 端口）且防火墙放通
                        </p>
                      );
                    }
                    return (
                      <p className="text-xs text-amber-600">
                        <i className="ri-alert-line mr-1" />
                        接口可达但无 key 返回，说明服务在线但 exchange/key 路由有问题，请查看日志
                      </p>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* 端口提示 */}
          <div className="flex flex-wrap items-start gap-4 text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
            <div className="flex items-start gap-1.5">
              <i className="ri-error-warning-line text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-slate-600">端口开放要求</p>
                <p className="mt-0.5">
                  <strong>8081</strong>（主 HTTP）·
                  <strong className="ml-1">8082</strong>（设备密钥交换代理，固件硬编码）·
                  <strong className="ml-1">1883</strong>（MQTT Broker）
                </p>
                <p className="mt-0.5 text-slate-400">
                  若防火墙阻止，请运行：
                  <code className="ml-1 bg-white border border-slate-200 rounded px-1 font-mono text-slate-600">
                    sudo ufw allow 8081,8082,1883/tcp
                  </code>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}