import { useState, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { useScaleOperators, type CreateOperatorInput, type EditOperatorInput } from './hooks/useScaleOperators';
import { useScaleDevices } from '@/pages/catering/acceptance/hooks/useScaleDevices';
import OperatorModal from './components/OperatorModal';

interface Toast { id: number; type: 'success' | 'error'; msg: string; }

const LOCAL_SERVER_URL = 'http://192.168.2.33:8081';
const LOGIN_API = `${LOCAL_SERVER_URL}/api/auth/scale-operator/login`;

// 提示栏组件
function HintBar() {
  const [copied, setCopied] = useState(false);

  const copyUrl = useCallback(() => {
    navigator.clipboard.writeText(LOGIN_API).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  return (
    <div className="px-5 py-3 bg-emerald-50/60 border-b border-emerald-50">
      <div className="flex items-start gap-2">
        <i className="ri-information-line text-emerald-500 text-xs mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-emerald-700">
            本机服务器 <strong>192.168.2.33:8081</strong>，操作员登录 API 已就绪。秤上输入
            {' '}<strong>工号 + 密码（默认 2019）</strong>，
            登录成功后 Token 会自动保存到本地，秤重启无需重新登录。
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <code className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono truncate max-w-xs">
              {LOGIN_API}
            </code>
            <button
              type="button"
              onClick={copyUrl}
              className="flex-shrink-0 flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 cursor-pointer"
            >
              <i className={copied ? 'ri-checkbox-circle-line' : 'ri-file-copy-line'} />
              {copied ? '已复制' : '复制'}
            </button>
            <span className="text-xs text-emerald-500">— 工号字段兼容 work_no / username / operatorId 等多种格式</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScaleOperatorsPage() {
  const [deviceFilter, setDeviceFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingOperator, setEditingOperator] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { operators, loading, error, fetchOperators, createOperator, updateOperator, deleteOperator } = useScaleOperators();
  const { devices } = useScaleDevices();

  const addToast = (type: 'success' | 'error', msg: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  };

  const deviceOptions = devices.map((d) => ({ sn: d.device_sn, name: d.device_name }));

  const filtered = operators.filter((o) => {
    const matchDevice = !deviceFilter || o.device_sn === deviceFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || o.name.toLowerCase().includes(q) || o.work_no.toLowerCase().includes(q);
    return matchDevice && matchSearch;
  });

  const selectedOperator = editingOperator != null ? operators.find((o) => o.id === editingOperator) ?? null : null;

  const handleCreate = async (input: CreateOperatorInput) => {
    await createOperator(input);
    addToast('success', `操作员「${input.name}」已添加`);
  };

  const handleEdit = async (input: EditOperatorInput, id: number) => {
    await updateOperator(id, input);
    const op = operators.find((o) => o.id === id);
    addToast('success', op ? `「${op.name}」已更新` : '操作员已更新');
  };

  const handleDelete = async (id: number) => {
    const op = operators.find((o) => o.id === id);
    try {
      await deleteOperator(id);
      addToast('success', op ? `「${op.name}」已删除` : '操作员已删除');
      setDeleteConfirm(null);
    } catch (e: unknown) {
      addToast('error', e instanceof Error ? e.message : '删除失败');
    }
  };

  const activeCount = operators.filter((o) => o.is_active).length;
  const adminCount = operators.filter((o) => o.role === 'admin').length;

  return (
    <AppLayout title="电子秤操作员管理" breadcrumb={['餐饮管理', '电子秤操作员管理']}>
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

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {[
          { label: '操作员总数', value: operators.length, icon: 'ri-team-line', color: 'text-slate-700', bg: 'bg-slate-100' },
          { label: '已启用', value: activeCount, icon: 'ri-user-follow-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: '已停用', value: operators.length - activeCount, icon: 'ri-user-unfollow-line', color: 'text-slate-400', bg: 'bg-slate-50' },
          { label: '管理员', value: adminCount, icon: 'ri-shield-user-line', color: 'text-amber-600', bg: 'bg-amber-50' },
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
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={deviceFilter}
              onChange={(e) => { setDeviceFilter(e.target.value); }}
              className="text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white"
            >
              <option value="">全部设备</option>
              {devices.map((d) => (
                <option key={d.device_sn} value={d.device_sn}>{d.device_name}</option>
              ))}
            </select>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <i className="ri-search-line text-slate-400 text-xs" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索工号或姓名"
                className="text-xs bg-transparent focus:outline-none text-slate-700 w-40"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-add-line" />新增操作员
            </button>
            <button
              type="button"
              onClick={() => fetchOperators(deviceFilter || undefined)}
              className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-refresh-line" />
              刷新
            </button>
          </div>
        </div>

        {/* Hint bar */}
        <HintBar />

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <i className="ri-loader-4-line animate-spin text-2xl mr-3" />
              <span className="text-sm">加载操作员...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
              <i className="ri-error-warning-line text-2xl text-red-400" />
              <p className="text-sm text-red-500">{error}</p>
              <button
                type="button"
                onClick={() => fetchOperators(deviceFilter || undefined)}
                className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                重试
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50">
                  {['工号', '登录名称', '姓名', '关联设备', '角色', '手机号', '状态', '创建时间', '操作'].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const device = devices.find((d) => d.device_sn === o.device_sn);
                  return (
                    <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono text-slate-700">{o.work_no}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{o.login_name || o.work_no}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{o.name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {device ? `${device.device_name} (${o.device_sn})` : o.device_sn || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          o.role === 'admin' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {o.role === 'admin' ? '管理员' : '操作员'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{o.phone || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          o.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {o.is_active ? '启用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {new Date(o.created_at).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => { setEditingOperator(o.id); }}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 cursor-pointer"
                            title="编辑"
                          >
                            <i className="ri-edit-line text-slate-500 text-sm" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm(o.id)}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 cursor-pointer"
                            title="删除"
                          >
                            <i className="ri-delete-bin-line text-red-400 text-sm" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <div className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100">
                          <i className="ri-user-add-line text-3xl" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-500">暂无操作员</p>
                          <p className="text-xs mt-1">
                            点击「新增操作员」手动录入，请确保工号与厂商 DRP 系统中的账号一致
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <OperatorModal
          mode="create"
          deviceOptions={deviceOptions}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreate}
        />
      )}

      {/* Edit Modal */}
      {editingOperator !== null && selectedOperator && (
        <OperatorModal
          mode="edit"
          operator={selectedOperator}
          deviceOptions={deviceOptions}
          onClose={() => setEditingOperator(null)}
          onSave={handleEdit}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50">
                <i className="ri-error-warning-line text-red-500 text-xl" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-800">确认删除</h3>
                <p className="text-xs text-slate-500 mt-0.5">删除后该操作员将从本系统移除，不可恢复</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm)}
                className="text-sm bg-red-500 text-white rounded-lg px-4 py-2 hover:bg-red-600 cursor-pointer whitespace-nowrap"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}