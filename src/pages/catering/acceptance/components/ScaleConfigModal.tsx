import { useState } from 'react';
import type { FullScaleConfig } from '@/hooks/useScaleConfig';
import { testScaleConnection, fetchDeviceToken } from '@/services/scaleApi';
import type { DeviceTokenResult } from '@/services/scaleApi';

interface Props {
  config: FullScaleConfig;
  onSave: (config: FullScaleConfig) => void;
  onClose: () => void;
}

export default function ScaleConfigModal({ config, onSave, onClose }: Props) {
  const [form, setForm] = useState<FullScaleConfig>({ ...config });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; detail?: string; url?: string } | null>(null);
  const [saveError, setSaveError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginResult, setLoginResult] = useState<DeviceTokenResult | null>(null);

  const handleChange = (key: keyof FullScaleConfig, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTestResult(null);
    setSaveError('');
  };

  const handleTest = async () => {
    if (!form.baseUrl || !form.merchantId || !form.xToken) {
      setTestResult({ ok: false, msg: '请先填写完整的 Base URL、Merchant-Id 和 X-Token' });
      return;
    }
    setTesting(true);
    setTestResult(null);

    const previewUrl = `${form.baseUrl.replace(/\/$/, '')}/api/v4/device/drp/common/user-page-test?version=1.0&nonceStr=...&timestamp=${Date.now()}`;

    try {
      const result = await testScaleConnection({
        baseUrl: form.baseUrl,
        merchantId: form.merchantId,
        xToken: form.xToken,
        machineSn: form.machineSn,
      });

      const bodyStr = result.body ? JSON.stringify(result.body, null, 2) : null;

      if (result.status === 401 || result.status === 403) {
        setTestResult({
          ok: false,
          msg: `认证失败 (${result.status})，请检查 Merchant-Id 和 X-Token`,
          detail: bodyStr ?? undefined,
          url: previewUrl,
        });
      } else if (result.status === 404) {
        setTestResult({
          ok: false,
          msg: `接口不存在 (404)，请检查 Base URL 是否正确`,
          detail: bodyStr ?? undefined,
          url: previewUrl,
        });
      } else if (result.ok) {
        setTestResult({
          ok: true,
          msg: `连接成功！服务器响应 ${result.status}`,
          detail: bodyStr ?? undefined,
          url: previewUrl,
        });
      } else {
        setTestResult({
          ok: false,
          msg: `服务器响应异常 (${result.status})`,
          detail: bodyStr ?? undefined,
          url: previewUrl,
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult({ ok: false, msg, url: previewUrl });
    } finally {
      setTesting(false);
    }
  };

  const handleLogin = async () => {
    if (!form.baseUrl || !form.merchantId || !form.xToken) {
      setLoginResult({
        ok: false, status: 0, token: null, rawBody: null,
        message: '请先填写 Base URL、Merchant-Id 和 X-Token',
      });
      return;
    }
    if (!form.machineSn) {
      setLoginResult({
        ok: false, status: 0, token: null, rawBody: null,
        message: '请先填写 Machine SN，设备登录需要设备序列号',
      });
      return;
    }
    setLoggingIn(true);
    setLoginResult(null);

    try {
      const result = await fetchDeviceToken({
        baseUrl: form.baseUrl,
        merchantId: form.merchantId,
        xToken: form.xToken,
        machineSn: form.machineSn,
      });
      setLoginResult(result);
      if (result.ok && result.token) {
        setForm((prev) => ({ ...prev, accessToken: result.token! }));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoginResult({
        ok: false, status: 0, token: null, rawBody: null, message: msg,
      });
    } finally {
      setLoggingIn(false);
    }
  };

  const handleSave = () => {
    if (!form.baseUrl.trim()) { setSaveError('请填写 Base URL'); return; }
    if (!form.merchantId.trim()) { setSaveError('请填写 Merchant-Id'); return; }
    if (!form.xToken.trim()) { setSaveError('请填写 X-Token'); return; }
    if (!form.warehouseId?.trim()) { setSaveError('请填写仓库 ID（入库提交时必需）'); return; }
    if (form.warehouseId && !/^\d+$/.test(form.warehouseId.trim())) {
      setSaveError('仓库 ID 必须为纯数字');
      return;
    }
    if (!form.fetchUserId?.trim()) { setSaveError('请填写领取人 ID（入库接口必填）'); return; }
    if (form.fetchUserId && !/^\d+$/.test(form.fetchUserId.trim())) {
      setSaveError('领取人 ID 必须为纯数字');
      return;
    }
    setSaveError('');
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header - 固定 */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100">
              <i className="ri-scales-3-line text-slate-600 text-base" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">电子秤设备配置</h3>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {/* 可滚动内容区 */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

        {/* Tips */}
        <div className="flex gap-2.5 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 mb-4">
          <i className="ri-information-line text-amber-500 text-base flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700 leading-relaxed space-y-1">
            <p className="font-medium">如何获取以下配置信息？</p>
            <p>联系您的<span className="font-medium">电子秤设备供应商</span>，索取「接口对接文档」或「系统账号信息」，其中会包含 Base URL、Merchant-Id 和 X-Token。</p>
            <p>也可登录供应商提供的<span className="font-medium">管理后台</span>，在「开发者设置」或「商户信息」页面查找。</p>
          </div>
        </div>

        {/* Auth Section */}
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">连接配置</p>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Base URL <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.baseUrl}
              onChange={(e) => handleChange('baseUrl', e.target.value)}
              placeholder="http://192.168.1.100:8080"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
            />
            <p className="text-xs text-slate-400 mt-1">服务器 IP 地址和端口，不含接口路径</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Merchant-Id <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.merchantId}
                onChange={(e) => handleChange('merchantId', e.target.value)}
                placeholder="商户 ID"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                X-Token <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={form.xToken}
                onChange={(e) => handleChange('xToken', e.target.value)}
                placeholder="接口 Token"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Machine SN <span className="text-slate-400 font-normal">（可选）</span>
            </label>
            <input
              type="text"
              value={form.machineSn ?? ''}
              onChange={(e) => handleChange('machineSn', e.target.value)}
              placeholder="电子秤设备序列号"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
            />
          </div>

          {/* Device Login */}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={handleLogin}
              disabled={loggingIn}
              className="flex items-center gap-1.5 text-sm bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-2 hover:bg-amber-100 cursor-pointer whitespace-nowrap disabled:opacity-50 transition-colors"
            >
              <i className={`ri-key-2-line ${loggingIn ? 'animate-spin' : ''}`} />
              {loggingIn ? '登录中...' : '设备登录'}
            </button>
            {form.accessToken && (
              <div className="flex-1 flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                <i className="ri-shield-check-line text-emerald-500 text-sm flex-shrink-0" />
                <span className="text-xs text-emerald-700 font-mono truncate">
                  {form.accessToken.slice(0, 16)}...
                </span>
              </div>
            )}
          </div>

          {loginResult && (
            <div className={`rounded-lg text-xs overflow-hidden ${loginResult.ok ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
              <div className={`flex items-center gap-2 px-3 py-2.5 ${loginResult.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                <i className={loginResult.ok ? 'ri-checkbox-circle-line text-sm' : 'ri-error-warning-line text-sm'} />
                <span className="font-medium">{loginResult.message}</span>
              </div>
              {loginResult.rawBody && !loginResult.ok && (
                <pre className="mx-3 mb-2 px-2.5 py-2 rounded text-xs font-mono leading-relaxed whitespace-pre-wrap break-all max-h-48 overflow-y-auto bg-white/60 text-red-700">
                  {typeof loginResult.rawBody === 'string' ? loginResult.rawBody : JSON.stringify(loginResult.rawBody, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* 业务配置 */}
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 mt-1">业务配置</p>
        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                仓库 ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={form.warehouseId ?? ''}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  handleChange('warehouseId', v);
                }}
                placeholder="纯数字，如：1001"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
              <p className="text-xs text-slate-400 mt-1">入库提交必填，仅支持数字</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                领取人 ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={form.fetchUserId ?? ''}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  handleChange('fetchUserId', v);
                }}
                placeholder="纯数字，如：101"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
              <p className="text-xs text-slate-400 mt-1">领料人的用户 ID，入库接口必填</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              食堂 ID <span className="text-slate-400 font-normal">（可选）</span>
            </label>
            <input
              type="text"
              value={form.canteenId ?? ''}
              onChange={(e) => handleChange('canteenId', e.target.value)}
              placeholder="食堂 / 餐厅 ID"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
            />
          </div>
        </div>

        {saveError && (
          <div className="mb-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
            <i className="ri-error-warning-line flex-shrink-0" />
            {saveError}
          </div>
        )}

        {testResult && (
          <div className={`mb-4 rounded-lg text-xs overflow-hidden ${testResult.ok ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
            <div className={`flex items-center gap-2 px-3 py-2.5 ${testResult.ok ? 'text-emerald-700' : 'text-red-600'}`}>
              <i className={testResult.ok ? 'ri-checkbox-circle-line text-sm' : 'ri-error-warning-line text-sm'} />
              <span className="font-medium">{testResult.msg}</span>
            </div>
            {testResult.url && (
              <div className="px-3 pb-2 flex items-start gap-1.5">
                <span className="text-slate-400 shrink-0">请求地址：</span>
                <span className="font-mono text-slate-500 break-all">{testResult.url}</span>
              </div>
            )}
            {testResult.detail && (
              <pre className={`mx-3 mb-2 px-2.5 py-2 rounded text-xs font-mono leading-relaxed whitespace-pre-wrap break-all max-h-36 overflow-y-auto bg-white/60 ${testResult.ok ? 'text-emerald-800' : 'text-red-700'}`}>
                {testResult.detail}
              </pre>
            )}
          </div>
        )}

        </div>{/* end scrollable */}

        {/* Footer - 固定底部 */}
        <div className="flex gap-2 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <i className={`ri-wifi-line ${testing ? 'animate-spin' : ''}`} />
            {testing ? '测试中...' : '测试连接'}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="text-sm bg-slate-800 text-white rounded-lg px-4 py-2 hover:bg-slate-700 cursor-pointer whitespace-nowrap"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}