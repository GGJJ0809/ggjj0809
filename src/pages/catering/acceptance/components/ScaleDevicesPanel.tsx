import { useState } from 'react';
import type { ScaleDevice } from '../hooks/useScaleDevices';

interface Props {
  devices: ScaleDevice[];
  loading: boolean;
  error: string | null;
  onAdd: () => void;
  onEdit: (device: ScaleDevice) => void;
  onDelete: (id: number) => void;
}

export default function ScaleDevicesPanel({ devices, loading, error, onAdd, onEdit, onDelete }: Props) {
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('全部');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const zones = ['全部', ...Array.from(new Set(devices.map((d) => d.zone).filter(Boolean)))];

  const filtered = devices.filter((d) => {
    const matchesSearch =
      !search.trim() ||
      d.device_name.includes(search) ||
      d.device_no.includes(search) ||
      d.device_sn.includes(search);
    const matchesZone = zoneFilter === '全部' || d.zone === zoneFilter;
    return matchesSearch && matchesZone;
  });

  return (
    <div className="bg-white rounded-xl border border-slate-100 flex flex-col max-h-[80vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50">
            <i className="ri-scales-3-line text-emerald-600 text-base" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">电子秤设备管理</h3>
            <p className="text-xs text-slate-400">共 {devices.length} 台设备</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap"
        >
          <i className="ri-add-line" />新增设备
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-50 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索设备编号、名称、Sn..."
            className="w-full text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-slate-400"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {zones.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoneFilter(z)}
              className={`text-xs px-2.5 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${
                zoneFilter === z
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {z}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <i className="ri-loader-4-line animate-spin text-2xl mr-3" />
            <span className="text-sm">加载设备列表...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-red-500">
            <i className="ri-error-warning-line text-2xl mr-3" />
            <span className="text-sm">{error}</span>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-50">
                {['设备编号', '设备名称', '设备Sn', '设备Ip', '所属区域', '所属食堂', '所属档口', '状态', '操作'].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-xs font-mono text-slate-500">{d.device_no}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">{d.device_name}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-400">{d.device_sn}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{d.device_ip || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{d.zone}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{d.canteen}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{d.stall || '—'}</td>
                  <td className="px-4 py-3">
                    {d.status === 'active' ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />启用
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full w-fit">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />停用
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(d)}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 cursor-pointer text-slate-500"
                        title="编辑"
                      >
                        <i className="ri-edit-line text-sm" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(d.id)}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 cursor-pointer text-red-400"
                        title="删除"
                      >
                        <i className="ri-delete-bin-line text-sm" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <div className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-100">
                        <i className="ri-scales-3-line text-2xl" />
                      </div>
                      <p className="text-sm">暂无电子秤设备</p>
                      <p className="text-xs">点击右上角「新增设备」添加</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirm */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50">
                <i className="ri-error-warning-line text-red-500 text-lg" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">确认删除</p>
                <p className="text-xs text-slate-500 mt-0.5">删除后不可恢复，是否继续？</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="text-sm bg-red-500 text-white rounded-lg px-4 py-2 hover:bg-red-600 cursor-pointer whitespace-nowrap"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}