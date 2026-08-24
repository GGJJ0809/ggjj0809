import { useState } from 'react';
import type { ScaleDevice, CreateScaleDeviceInput } from '../hooks/useScaleDevices';

interface Props {
  device?: ScaleDevice | null;
  onClose: () => void;
  onSave: (input: CreateScaleDeviceInput, id?: number) => void;
  onSaveAndAdd?: (input: CreateScaleDeviceInput) => void;
}

type TabKey = 'basic' | 'params';

const emptyForm: CreateScaleDeviceInput = {
  device_no: '',
  device_name: '',
  device_sn: '',
  device_ip: '',
  device_key: '',
  gateway: '',
  install_address: '',
  device_mac: '',
  zone: '',
  canteen: '',
  stall: '',
  password: '',
  max_capacity: undefined,
  precision_value: undefined,
  unit: 'kg',
  division_value: undefined,
  comm_protocol: 'TCP',
  status: 'active',
  notes: '',
};

export default function ScaleDeviceModal({ device, onClose, onSave, onSaveAndAdd }: Props) {
  const isEdit = Boolean(device);
  const [tab, setTab] = useState<TabKey>('basic');
  const [form, setForm] = useState<CreateScaleDeviceInput>(
    device
      ? {
          device_no: device.device_no,
          device_name: device.device_name,
          device_sn: device.device_sn,
          device_ip: device.device_ip ?? '',
          device_key: device.device_key,
          gateway: device.gateway ?? '',
          install_address: device.install_address ?? '',
          device_mac: device.device_mac ?? '',
          zone: device.zone,
          canteen: device.canteen,
          stall: device.stall ?? '',
          password: device.password ?? '',
          max_capacity: device.max_capacity ?? undefined,
          precision_value: device.precision_value ?? undefined,
          unit: device.unit ?? 'kg',
          division_value: device.division_value ?? undefined,
          comm_protocol: device.comm_protocol ?? 'TCP',
          status: device.status ?? 'active',
          notes: device.notes ?? '',
        }
      : { ...emptyForm }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const setField = <K extends keyof CreateScaleDeviceInput>(
    key: K,
    value: CreateScaleDeviceInput[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.device_no.trim()) next.device_no = '请输入设备编号';
    if (!form.device_name.trim()) next.device_name = '请输入设备名称';
    if (!form.device_sn.trim()) next.device_sn = '请输入设备Sn';
    if (!form.device_key.trim()) next.device_key = '请输入设备key';
    if (!form.zone.trim()) next.zone = '请选择所属区域';
    if (!form.canteen.trim()) next.canteen = '请选择所属食堂';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (andAdd = false) => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (andAdd && onSaveAndAdd) {
        await onSaveAndAdd(form);
        setForm({ ...emptyForm });
        setTab('basic');
      } else {
        await onSave(form, device?.id);
        onClose();
      }
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : e && typeof (e as Record<string, unknown>).message === 'string'
            ? (e as Record<string, unknown>).message as string
            : String(e || '保存失败');
      setErrors({ submit: msg });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = (field: string) =>
    `w-full text-sm border rounded-lg px-3 py-2 focus:outline-none ${
      errors[field] ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-slate-400'
    }`;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50">
              <i className="ri-scales-3-line text-emerald-600 text-base" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">
              {isEdit ? '编辑' : '新增'} - AI称
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"
          >
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 px-6 pt-4 border-b border-slate-50">
          {[
            { key: 'basic', label: '基本信息' },
            { key: 'params', label: '设备参数' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as TabKey)}
              className={`text-sm pb-3 cursor-pointer whitespace-nowrap transition-colors border-b-2 ${
                tab === t.key
                  ? 'text-emerald-700 border-emerald-500 font-medium'
                  : 'text-slate-400 border-transparent hover:text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'basic' && (
            <div className="grid grid-cols-2 gap-x-5 gap-y-4">
              {/* 设备编号 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  <span className="text-red-500 mr-0.5">*</span>设备编号
                </label>
                <input
                  type="text"
                  value={form.device_no}
                  onChange={(e) => setField('device_no', e.target.value)}
                  placeholder="请输入设备编号"
                  className={inputClass('device_no')}
                />
                {errors.device_no && (
                  <p className="text-xs text-red-500 mt-1">{errors.device_no}</p>
                )}
              </div>

              {/* 设备名称 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  <span className="text-red-500 mr-0.5">*</span>设备名称
                </label>
                <input
                  type="text"
                  value={form.device_name}
                  onChange={(e) => setField('device_name', e.target.value)}
                  placeholder="请输入设备名称"
                  className={inputClass('device_name')}
                />
                {errors.device_name && (
                  <p className="text-xs text-red-500 mt-1">{errors.device_name}</p>
                )}
              </div>

              {/* 设备Sn */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  <span className="text-red-500 mr-0.5">*</span>设备Sn
                </label>
                <input
                  type="text"
                  value={form.device_sn}
                  onChange={(e) => setField('device_sn', e.target.value)}
                  placeholder="请输入设备Sn"
                  className={inputClass('device_sn')}
                />
                {errors.device_sn && (
                  <p className="text-xs text-red-500 mt-1">{errors.device_sn}</p>
                )}
              </div>

              {/* 设备Ip */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">设备Ip</label>
                <input
                  type="text"
                  value={form.device_ip}
                  onChange={(e) => setField('device_ip', e.target.value)}
                  placeholder="请输入设备Ip"
                  className={inputClass('device_ip')}
                />
              </div>

              {/* 设备key */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  <span className="text-red-500 mr-0.5">*</span>设备key
                </label>
                <input
                  type="text"
                  value={form.device_key}
                  onChange={(e) => setField('device_key', e.target.value)}
                  placeholder="请输入设备key"
                  className={inputClass('device_key')}
                />
                {errors.device_key && (
                  <p className="text-xs text-red-500 mt-1">{errors.device_key}</p>
                )}
              </div>

              {/* 网关 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">网关</label>
                <input
                  type="text"
                  value={form.gateway}
                  onChange={(e) => setField('gateway', e.target.value)}
                  placeholder="请输入网关"
                  className={inputClass('gateway')}
                />
              </div>

              {/* 安装地址 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">安装地址</label>
                <input
                  type="text"
                  value={form.install_address}
                  onChange={(e) => setField('install_address', e.target.value)}
                  placeholder="请输入安装地址"
                  className={inputClass('install_address')}
                />
              </div>

              {/* 设备Mac */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">设备Mac</label>
                <input
                  type="text"
                  value={form.device_mac}
                  onChange={(e) => setField('device_mac', e.target.value)}
                  placeholder="请输入设备Mac"
                  className={inputClass('device_mac')}
                />
              </div>

              {/* 所属区域 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  <span className="text-red-500 mr-0.5">*</span>所属区域
                </label>
                <select
                  value={form.zone}
                  onChange={(e) => setField('zone', e.target.value)}
                  className={inputClass('zone')}
                >
                  <option value="">请选择所属区域</option>
                  <option value="验收区">验收区</option>
                  <option value="仓储区">仓储区</option>
                  <option value="加工区">加工区</option>
                  <option value="烹饪区">烹饪区</option>
                  <option value="配餐区">配餐区</option>
                </select>
                {errors.zone && <p className="text-xs text-red-500 mt-1">{errors.zone}</p>}
              </div>

              {/* 所属食堂 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  <span className="text-red-500 mr-0.5">*</span>所属食堂
                </label>
                <select
                  value={form.canteen}
                  onChange={(e) => setField('canteen', e.target.value)}
                  className={inputClass('canteen')}
                >
                  <option value="">请选择食堂</option>
                  <option value="第一食堂">第一食堂</option>
                  <option value="第二食堂">第二食堂</option>
                  <option value="第三食堂">第三食堂</option>
                  <option value="教工餐厅">教工餐厅</option>
                </select>
                {errors.canteen && <p className="text-xs text-red-500 mt-1">{errors.canteen}</p>}
              </div>

              {/* 所属档口 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">所属档口</label>
                <select
                  value={form.stall}
                  onChange={(e) => setField('stall', e.target.value)}
                  className={inputClass('stall')}
                >
                  <option value="">请选择档口</option>
                  <option value="蔬菜档">蔬菜档</option>
                  <option value="肉类档">肉类档</option>
                  <option value="干货档">干货档</option>
                  <option value="冷冻档">冷冻档</option>
                  <option value="水产档">水产档</option>
                  <option value="米面档">米面档</option>
                </select>
              </div>

              {/* 密码 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">密码</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setField('password', e.target.value)}
                  placeholder="请输入密码"
                  className={inputClass('password')}
                />
              </div>

              {/* 状态 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">启用状态</label>
                <select
                  value={form.status}
                  onChange={(e) => setField('status', e.target.value)}
                  className={inputClass('status')}
                >
                  <option value="active">启用</option>
                  <option value="inactive">停用</option>
                </select>
              </div>

              {/* 备注 */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">备注</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="请输入备注信息"
                  rows={2}
                  className={inputClass('notes')}
                />
              </div>
            </div>
          )}

          {tab === 'params' && (
            <div className="grid grid-cols-2 gap-x-5 gap-y-4">
              {/* 最大称量 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">最大称量</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={form.max_capacity ?? ''}
                    onChange={(e) =>
                      setField('max_capacity', e.target.value === '' ? undefined : parseFloat(e.target.value))
                    }
                    placeholder="如：30"
                    className={inputClass('max_capacity')}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    {form.unit}
                  </span>
                </div>
              </div>

              {/* 精度 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">精度</label>
                <input
                  type="number"
                  step="0.001"
                  value={form.precision_value ?? ''}
                  onChange={(e) =>
                    setField('precision_value', e.target.value === '' ? undefined : parseFloat(e.target.value))
                  }
                  placeholder="如：0.001"
                  className={inputClass('precision_value')}
                />
              </div>

              {/* 单位 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">单位</label>
                <select
                  value={form.unit}
                  onChange={(e) => setField('unit', e.target.value)}
                  className={inputClass('unit')}
                >
                  <option value="kg">kg（千克）</option>
                  <option value="g">g（克）</option>
                  <option value="t">t（吨）</option>
                  <option value="lb">lb（磅）</option>
                </select>
              </div>

              {/* 分度值 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">分度值</label>
                <input
                  type="number"
                  step="0.001"
                  value={form.division_value ?? ''}
                  onChange={(e) =>
                    setField('division_value', e.target.value === '' ? undefined : parseFloat(e.target.value))
                  }
                  placeholder="如：0.005"
                  className={inputClass('division_value')}
                />
              </div>

              {/* 通讯协议 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">通讯协议</label>
                <select
                  value={form.comm_protocol}
                  onChange={(e) => setField('comm_protocol', e.target.value)}
                  className={inputClass('comm_protocol')}
                >
                  <option value="TCP">TCP</option>
                  <option value="UDP">UDP</option>
                  <option value="RS232">RS232</option>
                  <option value="RS485">RS485</option>
                  <option value="HTTP">HTTP</option>
                  <option value="MQTT">MQTT</option>
                </select>
              </div>
            </div>
          )}

          {errors.submit && (
            <div className="mt-4 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
              <i className="ri-error-warning-line" />
              {errors.submit}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            取消
          </button>
          <div className="flex gap-2">
            {!isEdit && onSaveAndAdd && (
              <button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm bg-emerald-500 text-white rounded-lg px-4 py-2 hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {saving ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-add-line" />}
                保存并继续新增
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={saving}
              className="flex items-center gap-1.5 text-sm bg-slate-800 text-white rounded-lg px-4 py-2 hover:bg-slate-700 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {saving ? <i className="ri-loader-4-line animate-spin" /> : null}
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}