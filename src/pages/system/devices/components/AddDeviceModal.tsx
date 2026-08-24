import { useState } from 'react';
import { nowBeijing } from '@/lib/dateUtils';
import { supabase } from '@/lib/supabase';
import { localDb } from '@/lib/localDb';
import { DEVICE_MODELS, getDeviceTypeByModel } from '@/lib/deviceHelpers';

interface Device {
  id: number;
  device_model: string | null;
  device_name: string;
  device_number: string;
  device_sn: string;
  zone: string | null;
  cafeteria_name: string | null;
  location: string | null;
  maintenance_cycle: string | null;
  socket_meter_id: number | null;
  gateway_sn: string | null;
  gateway_ip: string | null;
  communication_address: number | null;
  temp_low_threshold: number | null;
  temp_high_threshold: number | null;
  humidity_low_threshold: number | null;
  humidity_high_threshold: number | null;
  status: string | null;
  notes: string | null;
}

interface Props {
  device?: Device | null;
  onSave: () => void;
  onClose: () => void;
}



export default function AddDeviceModal({ device, onSave, onClose }: Props) {
  const isEdit = !!device;
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');

  // Step 1: 基本信息
  const [deviceModel, setDeviceModel] = useState(device?.device_model || 'ZHA-S500-WS');
  const [deviceName, setDeviceName] = useState(device?.device_name || '');
  const [deviceNumber, setDeviceNumber] = useState(device?.device_number || '');
  const [deviceSn, setDeviceSn] = useState(device?.device_sn || '');
  const [zone, setZone] = useState(device?.zone || '');
  const [cafeteriaName, setCafeteriaName] = useState(device?.cafeteria_name || '');
  const [location, setLocation] = useState(device?.location || '');
  const [gatewaySn, setGatewaySn] = useState(device?.gateway_sn || '');
  const [gatewayIp, setGatewayIp] = useState(device?.gateway_ip || '');

  // Step 2: 设备参数
  const [commAddr, setCommAddr] = useState(device?.communication_address?.toString() || '');
  const [tempLow, setTempLow] = useState(device?.temp_low_threshold?.toString() || '');
  const [tempHigh, setTempHigh] = useState(device?.temp_high_threshold?.toString() || '');
  const [humidityLow, setHumidityLow] = useState(device?.humidity_low_threshold?.toString() || '');
  const [humidityHigh, setHumidityHigh] = useState(device?.humidity_high_threshold?.toString() || '');

  const selectedModel = DEVICE_MODELS.find((m) => m.value === deviceModel);
  const deviceType = getDeviceTypeByModel(deviceModel);
  const isTH = deviceType === 'temp_humidity';
  const isZHA500WS = deviceModel === 'ZHA-S500-WS';

  const clearError = () => {
    setError('');
    setErrorDetail('');
  };

  const handleNext = () => {
    clearError();
    if (!deviceName.trim()) { setError('请输入设备名称'); return; }
    if (!deviceNumber.trim()) { setError('请输入设备编号'); return; }
    if (!deviceSn.trim()) { setError('请输入设备SN'); return; }
    if (!zone.trim()) { setError('请输入所属区域'); return; }
    if (!cafeteriaName.trim()) { setError('请输入食堂名称'); return; }
    if (!location.trim()) { setError('请输入位置'); return; }
    // 网关IP校验（必填）
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!gatewayIp.trim()) { setError('请输入网关IP地址'); return; }
    if (!ipPattern.test(gatewayIp.trim())) {
      setError('网关IP格式不正确，请输入如 192.168.2.151');
      return;
    }
    setStep(2);
  };

  const handleBack = () => {
    clearError();
    setStep(1);
  };

  const handleSubmit = async () => {
    clearError();
    if (isTH && !commAddr.trim()) { setError('请输入通信地址（温湿度传感器必填）'); return; }
    const commNum = parseInt(commAddr, 10);
    if (isTH && (Number.isNaN(commNum) || commNum < 1 || commNum > 247)) {
      setError('通信地址必须在 1-247 之间');
      return;
    }
    setSaving(true);

    const payload = {
      device_model: deviceModel,
      device_name: deviceName.trim(),
      device_number: deviceNumber.trim(),
      device_sn: deviceSn.trim(),
      zone: zone.trim() || null,
      cafeteria_name: cafeteriaName.trim() || null,
      location: location.trim() || null,
      gateway_sn: gatewaySn.trim() || null,
      gateway_ip: gatewayIp.trim() || null,
      communication_address: commAddr ? parseInt(commAddr, 10) : null,
      temp_low_threshold: tempLow ? parseFloat(tempLow) : null,
      temp_high_threshold: tempHigh ? parseFloat(tempHigh) : null,
      humidity_low_threshold: humidityLow ? parseFloat(humidityLow) : null,
      humidity_high_threshold: humidityHigh ? parseFloat(humidityHigh) : null,
      status: device?.status || 'offline',
    };

    let supabaseError = '';
    let localDbError = '';

    try {
      if (isEdit) {
        const { error: uErr } = await supabase
          .from('devices')
          .update(payload)
          .eq('id', device!.id);
        if (uErr) {
          supabaseError = uErr.message || uErr.details || JSON.stringify(uErr);
          throw new Error(supabaseError);
        }
        // 同步更新本地 SQLite（轮询引擎读本地数据）
        try {
          await localDb.from('devices').update({ ...payload, updated_at: nowBeijing() }).eq('id', device!.id);
        } catch (localErr: unknown) {
          localDbError = localErr instanceof Error ? localErr.message : String(localErr);
        }
      } else {
        const { error: iErr, data: insertedData } = await supabase
          .from('devices')
          .insert(payload)
          .select()
          .maybeSingle();
        if (iErr) {
          supabaseError = iErr.message || iErr.details || JSON.stringify(iErr);
          throw new Error(supabaseError);
        }
        // 同步写入本地 SQLite（轮询引擎读本地数据，不用 Supabase）
        try {
          const now = nowBeijing();
          const localPayload: Record<string, unknown> = {
            ...payload,
            created_at: now,
            updated_at: now,
          };
          // 如果 Supabase 返回了 id 就带上，确保本地 id 一致
          if (insertedData && (insertedData as Record<string, unknown>).id) {
            localPayload.id = (insertedData as Record<string, unknown>).id;
          }
          await localDb.from('devices').insert(localPayload);
        } catch (localErr: unknown) {
          localDbError = localErr instanceof Error ? localErr.message : String(localErr);
        }
      }

      // 如果有本地同步错误但 Supabase 成功，给用户提示但不阻止流程
      if (localDbError) {
        setError('云端保存成功，但本地同步失败（轮询可能读不到数据）');
        setErrorDetail(localDbError);
      } else {
        onSave();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '保存失败';
      setError(supabaseError || msg);
      setErrorDetail(JSON.stringify({
        source: 'Supabase',
        timestamp: nowBeijing(),
        message: supabaseError || msg,
        payload: payload,
      }, null, 2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 flex items-center justify-center rounded-xl ${
              isTH ? 'bg-sky-50' : deviceType === 'smoke' ? 'bg-orange-50' : 'bg-emerald-50'
            }`}>
              <i className={`${
                isTH ? 'ri-temp-hot-line text-sky-600' : deviceType === 'smoke' ? 'ri-fire-line text-orange-600' : 'ri-haze-2-line text-emerald-600'
              } text-base`} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">
                {isEdit ? '编辑设备' : '新增设备'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEdit ? '修改设备信息及参数' : 'RS485 / Modbus 协议设备'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"
          >
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-slate-50 flex-shrink-0">
          {[1, 2].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { if (s === 1 || (s === 2 && (isEdit || deviceName.trim()))) { clearError(); setStep(s as 1 | 2); } }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                step === s
                  ? 'bg-slate-800 text-white'
                  : step > s
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs ${
                step > s ? 'bg-emerald-500 text-white' : step === s ? 'bg-white/20' : 'bg-slate-200'
              }`}>
                {step > s ? <i className="ri-check-line text-[10px]" /> : s}
              </span>
              {s === 1 ? '基本信息' : '设备参数'}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-4 flex flex-col gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-xs text-red-600 flex-shrink-0">
            <div className="flex items-center gap-2">
              <i className="ri-error-warning-line flex-shrink-0" />
              <span className="font-semibold">{error}</span>
            </div>
            {errorDetail && (
              <div className="mt-1 bg-red-100/50 rounded-lg px-2 py-2 font-mono leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
                {errorDetail}
              </div>
            )}
          </div>
        )}

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 ? (
            <div className="space-y-4">
              {/* Device Model */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  设备型号 <span className="text-red-500">*</span>
                </label>
                <select
                  value={deviceModel}
                  onChange={(e) => setDeviceModel(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-sky-400"
                >
                  {DEVICE_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label} — {m.desc}</option>
                  ))}
                </select>
              </div>

              {/* ZHA-S500-WS special note */}
              {isZHA500WS && (
                <div className="flex items-start gap-2 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2.5 text-xs text-sky-700">
                  <i className="ri-information-line flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium mb-0.5">中安温湿度传感器（ZHA-S500-WS）说明</p>
                    <p className="leading-relaxed">
                      该设备通过 RS485 通讯，使用 Modbus 协议。一台设备占用 <strong>两个通讯地址</strong>：
                      温度占地址 N，湿度占地址 N+1。
                      例如拨码设为 1 时，占用地址 1（温度）和 2（湿度），下一台设备需跳过地址 2 从 3 开始。
                    </p>
                  </div>
                </div>
              )}

              {/* Required fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    设备名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    placeholder="如：操作间温湿度"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    设备编号 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={deviceNumber}
                    onChange={(e) => setDeviceNumber(e.target.value)}
                    placeholder="如：TH-001"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400 font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    设备SN <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={deviceSn}
                    onChange={(e) => setDeviceSn(e.target.value)}
                    placeholder="RS485 通信，SN 可自定义填写"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400 font-mono"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    系统根据通信地址识别设备，SN 任意填写即可
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    所属区域 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                    placeholder="如：kqz / 默认区域 / 01"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    食堂名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={cafeteriaName}
                    onChange={(e) => setCafeteriaName(e.target.value)}
                    placeholder="如：kqz"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    位置 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="如：01"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    网关IP地址 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={gatewayIp}
                    onChange={(e) => setGatewayIp(e.target.value)}
                    placeholder="如：192.168.2.151"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400 font-mono"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Modbus TCP 网关实际 IP，轮询引擎用此 IP 连接并读数据
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    厂商系统网关SN
                  </label>
                  <input
                    type="text"
                    value={gatewaySn}
                    onChange={(e) => setGatewaySn(e.target.value)}
                    placeholder="如：01 或 2000002972"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400 font-mono"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    厂商系统「关联通信网关」字段的值，选填
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Step 2 header info */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${
                  isTH ? 'bg-sky-100' : 'bg-slate-100'
                }`}>
                  <i className={isTH ? 'ri-temp-hot-line text-sky-600' : 'ri-sensor-line text-slate-500'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">
                    {deviceName || '未命名设备'}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {selectedModel?.label} · {selectedModel?.desc}
                  </p>
                </div>
              </div>

              {/* Communication address */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  通信地址 {isTH && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="number"
                  value={commAddr}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!raw) { setCommAddr(''); return; }
                    const num = parseInt(raw, 10);
                    if (Number.isNaN(num)) { setCommAddr(''); return; }
                    if (num < 1) { setCommAddr('1'); return; }
                    if (num > 247) { setCommAddr('247'); return; }
                    setCommAddr(String(num));
                  }}
                  placeholder="RS485 Modbus 通信地址"
                  min={1}
                  max={247}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400 font-mono"
                />
                {isZHA500WS && (
                  <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-xs text-amber-700">
                    <i className="ri-error-warning-line flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium mb-0.5">ZHA-S500-WS 地址占用提醒</p>
                      <p>
                        此设备占用 <strong>地址 {commAddr || 'N'}（温度）</strong> 和 <strong>地址 {commAddr ? parseInt(commAddr, 10) + 1 : 'N+1'}（湿度）</strong>，下一台温湿度传感器通信地址需设为 <strong>{commAddr ? parseInt(commAddr, 10) + 2 : 'N+2'}</strong> 或以上。
                      </p>
                    </div>
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  RS485 总线通信地址范围 1-247，设备拨码设置需与此处一致
                </p>
              </div>

              {/* Temperature thresholds - only for temp_humidity */}
              {isTH && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs font-medium text-slate-600 mb-3">
                    <i className="ri-temp-hot-line text-sky-500 mr-1" />
                    温度阈值设定
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">温度低阈值（℃）</label>
                      <input
                        type="number"
                        value={tempLow}
                        onChange={(e) => setTempLow(e.target.value)}
                        placeholder="如：10"
                        step="0.1"
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">温度高阈值（℃）</label>
                      <input
                        type="number"
                        value={tempHigh}
                        onChange={(e) => setTempHigh(e.target.value)}
                        placeholder="如：30"
                        step="0.1"
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Humidity thresholds - only for temp_humidity */}
              {isTH && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs font-medium text-slate-600 mb-3">
                    <i className="ri-drop-line text-sky-500 mr-1" />
                    湿度阈值设定
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">湿度低阈值（%）</label>
                      <input
                        type="number"
                        value={humidityLow}
                        onChange={(e) => setHumidityLow(e.target.value)}
                        placeholder="如：30"
                        step="0.1"
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">湿度高阈值（%）</label>
                      <input
                        type="number"
                        value={humidityHigh}
                        onChange={(e) => setHumidityHigh(e.target.value)}
                        placeholder="如：70"
                        step="0.1"
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Threshold explanation */}
              {isTH && (
                <div className="flex items-start gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-slate-500">
                  <i className="ri-lightbulb-line flex-shrink-0 mt-0.5 text-amber-500" />
                  <div>
                    <p className="font-medium mb-0.5">阈值说明</p>
                    <p className="leading-relaxed">
                      设备连接成功后，系统会根据实际温湿度与此处阈值对比，超出范围将在「环境监控 → 温湿度检测」页面展示告警状态和检测结果。
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <div>
            {step === 2 && (
              <button
                type="button"
                onClick={handleBack}
                className="text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-arrow-left-line mr-1" />上一步
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              取消
            </button>
            {step === 1 ? (
              <button
                type="button"
                onClick={handleNext}
                className="text-sm bg-sky-500 text-white rounded-lg px-4 py-2 hover:bg-sky-600 cursor-pointer whitespace-nowrap"
              >
                下一步 <i className="ri-arrow-right-line ml-1" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="text-sm bg-emerald-500 text-white rounded-lg px-4 py-2 hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <><i className="ri-loader-4-line animate-spin mr-1" />保存中...</>
                ) : (
                  <><i className="ri-check-line mr-1" />{isEdit ? '保存修改' : '确定新增'}</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}