import { useState } from 'react';
import type { ScaleOperator, CreateOperatorInput, EditOperatorInput } from '../hooks/useScaleOperators';

interface EditModeProps {
  mode: 'edit';
  operator: ScaleOperator;
  deviceOptions: { sn: string; name: string }[];
  onClose: () => void;
  onSave: (input: EditOperatorInput, id: number) => Promise<void>;
}

interface CreateModeProps {
  mode: 'create';
  deviceOptions: { sn: string; name: string }[];
  onClose: () => void;
  onSave: (input: CreateOperatorInput) => Promise<void>;
}

type Props = EditModeProps | CreateModeProps;

export default function OperatorModal(props: Props) {
  const { mode, deviceOptions, onClose } = props;

  // ── edit mode state ──
  const [editDeviceSn, setEditDeviceSn] = useState(
    mode === 'edit' ? props.operator.device_sn : deviceOptions[0]?.sn ?? ''
  );
  const [editIsActive, setEditIsActive] = useState(
    mode === 'edit' ? props.operator.is_active : true
  );

  // ── create mode state ──
  const [workNo, setWorkNo] = useState('');
  const [loginName, setLoginName] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('operator');
  const [createDeviceSn, setCreateDeviceSn] = useState(deviceOptions[0]?.sn ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEdit = mode === 'edit';

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await (props as EditModeProps).onSave(
          { device_sn: editDeviceSn, is_active: editIsActive },
          (props as EditModeProps).operator.id
        );
      } else {
        if (!workNo.trim()) { setError('请输入工号'); setSaving(false); return; }
        if (!loginName.trim()) { setError('请输入登录名称'); setSaving(false); return; }
        if (!name.trim()) { setError('请输入姓名'); setSaving(false); return; }
        if (!password.trim()) { setError('请输入密码'); setSaving(false); return; }
        if (!createDeviceSn) { setError('请选择关联设备'); setSaving(false); return; }
        await (props as CreateModeProps).onSave({
          work_no: workNo.trim(),
          login_name: loginName.trim(),
          name: name.trim(),
          password: password.trim(),
          phone: phone.trim() || undefined,
          role,
          device_sn: createDeviceSn,
        });
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-slate-800">
              {isEdit ? '编辑操作员' : '新增操作员'}
            </h3>
            {isEdit && (
              <p className="text-xs text-slate-400 mt-0.5">
                工号 {(props as EditModeProps).operator.work_no} · {(props as EditModeProps).operator.name}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {isEdit ? (
            <>
              {/* Edit mode: hint */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-100">
                <i className="ri-information-line text-slate-400 text-sm mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-500">
                  工号、姓名、角色不可修改（对应电子秤设备上的账号信息）。只能调整关联设备和启用状态。
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">关联电子秤</label>
                <select value={editDeviceSn} onChange={(e) => setEditDeviceSn(e.target.value)} className={inputClass}>
                  {deviceOptions.map((d) => (
                    <option key={d.sn} value={d.sn}>{d.name} ({d.sn})</option>
                  ))}
                  {deviceOptions.length === 0 && <option value="">暂无设备</option>}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">状态</label>
                <select value={editIsActive ? 'true' : 'false'} onChange={(e) => setEditIsActive(e.target.value === 'true')} className={inputClass}>
                  <option value="true">启用</option>
                  <option value="false">停用</option>
                </select>
              </div>

              {/* Read-only fields */}
              <div className="space-y-2 pt-2 border-t border-slate-50">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">工号</span>
                  <span className="text-slate-700 font-mono">{(props as EditModeProps).operator.work_no}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">姓名</span>
                  <span className="text-slate-700">{(props as EditModeProps).operator.name}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">角色</span>
                  <span className="text-slate-700">{(props as EditModeProps).operator.role === 'admin' ? '管理员' : '操作员'}</span>
                </div>
                {(props as EditModeProps).operator.phone && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">手机号</span>
                    <span className="text-slate-700">{(props as EditModeProps).operator.phone}</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Create mode: hint */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100">
                <i className="ri-information-line text-amber-500 text-sm mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  登录名称用于电子秤上登录认证，工号作为唯一标识。请确保工号与厂商 DRP 系统中的一致。
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  工号 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={workNo}
                  onChange={(e) => {
                    setWorkNo(e.target.value);
                    if (!loginName) setLoginName(e.target.value);
                  }}
                  placeholder="唯一标识，如：001"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  登录名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  placeholder="电子秤登录时输入的用户名"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  操作人员姓名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="显示名称"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  登录密码 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="电子秤登录密码"
                    className={inputClass + ' pr-10'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <i className={showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">手机号</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="选填"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">角色</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
                  <option value="operator">操作员</option>
                  <option value="admin">管理员</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  关联电子秤 <span className="text-red-500">*</span>
                </label>
                <select value={createDeviceSn} onChange={(e) => setCreateDeviceSn(e.target.value)} className={inputClass}>
                  {deviceOptions.map((d) => (
                    <option key={d.sn} value={d.sn}>{d.name} ({d.sn})</option>
                  ))}
                  {deviceOptions.length === 0 && <option value="">暂无设备</option>}
                </select>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
              <i className="ri-error-warning-line flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 border-t border-slate-100 flex-shrink-0">
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
            onClick={handleSubmit}
            disabled={saving}
            className="text-sm bg-slate-800 text-white rounded-lg px-4 py-2 hover:bg-slate-700 cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            {saving ? '保存中...' : isEdit ? '保存' : '确认添加'}
          </button>
        </div>
      </div>
    </div>
  );
}