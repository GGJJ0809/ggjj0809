import { useState, useEffect } from 'react';
import { useScaleDevices, type ScaleDevice } from '@/pages/catering/acceptance/hooks/useScaleDevices';
import type { BoundDevice } from '../hooks/useInboundDevice';

interface Props {
  currentBoundId: number | null;
  onBind: (device: BoundDevice) => void;
  onClose: () => void;
}

export default function InboundDeviceBindModal({ currentBoundId, onBind, onClose }: Props) {
  const { devices, loading, error } = useScaleDevices();
  const [selectedId, setSelectedId] = useState<number | null>(currentBoundId);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('全部');
  const [bindError, setBindError] = useState<string | null>(null);

  const zones = ['全部', ...Array.from(new Set(devices.map((d) => d.zone).filter(Boolean)))];

  const filtered = devices.filter((d) => {
    const matchSearch =
      !search.trim() ||
      d.device_name.includes(search) ||
      d.device_no.includes(search) ||
      d.device_sn.includes(search) ||
      (d.device_ip ?? '').includes(search);
    const matchZone = zoneFilter === '全部' || d.zone === zoneFilter;
    return matchSearch && matchZone;
  });

  const activeDevices = filtered.filter((d) => d.status === 'active');

  const handleConfirm = () => {
    if (!selectedId) return;
    const device = devices.find((d) => d.id === selectedId);
    if (!device) return;

    if (!device.device_ip) {
      setBindError('该设备未配置 IP 地址，无法在局域网内通信。请先在「电子秤设备管理」中补充设备 IP。');
      return;
    }

    setBindError(null);
    onBind({
      id: device.id,
      device_no: device.device_no,
      device_name: device.device_name,
      device_sn: device.device_sn,
      device_ip: device.device_ip,
      device_key: device.device_key,
      zone: device.zone,
      canteen: device.canteen,
      stall: device.stall,
      comm_protocol: device.comm_protocol,
      status: device.status,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100">
              <i className="ri-link text-slate-600 text-lg" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">绑定入库电子秤设备</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                选择一台局域网内的电子秤设备，入库数据将同步到此页面
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"
          >
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-50 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索设备编号、名称、SN、IP..."
              className="w-full text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-slate-400"
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
            <div className="flex items-center justify-center py-20 text-slate-400">
              <i className="ri-loader-4-line animate-spin text-2xl mr-3" />
              <span className="text-sm">加载设备列表...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-20 text-red-500">
              <i className="ri-error-warning-line text-2xl mr-3" />
              <span className="text-sm">{error}</span>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50 sticky top-0 bg-white">
                  <th className="text-left text-xs font-medium text-slate-400 px-6 py-3 w-10"></th>
                  <th className="text-left text-xs font-medium text-slate-400 px-3 py-3 whitespace-nowrap">设备名称</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-3 py-3 whitespace-nowrap">设备编号</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-3 py-3 whitespace-nowrap">IP 地址</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-3 py-3 whitespace-nowrap">所属区域</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-3 py-3 whitespace-nowrap">所属食堂</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-3 py-3 whitespace-nowrap">通讯协议</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-3 py-3 whitespace-nowrap">状态</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const isSelected = selectedId === d.id;
                  const isBound = currentBoundId === d.id;
                  const isActive = d.status === 'active';
                  const noIp = !d.device_ip;
                  return (
                    <tr
                      key={d.id}
                      onClick={() => {
                        if (noIp) return;
                        setSelectedId(isSelected ? null : d.id);
                        setBindError(null);
                      }}
                      className={`border-b border-slate-50 transition-colors ${
                        noIp ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'
                      } ${isSelected ? 'bg-emerald-50/40' : ''}`}
                    >
                      <td className="px-6 py-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                        }`}>
                          {isSelected && <i className="ri-check-line text-white text-xs" />}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-800 whitespace-nowrap">{d.device_name}</span>
                          {isBound && (
                            <span className="text-xs bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                              当前绑定
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs font-mono text-slate-400">{d.device_no}</td>
                      <td className="px-3 py-3">
                        {d.device_ip ? (
                          <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                            {d.device_ip}
                          </span>
                        ) : (
                          <span className="text-xs text-red-400 flex items-center gap-1">
                            <i className="ri-error-warning-line" />
                            未配置
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500">{d.zone}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{d.canteen}</td>
                      <td className="px-3 py-3">
                        {d.comm_protocol ? (
                          <span className="text-xs text-slate-500">{d.comm_protocol}</span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {isActive ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            启用
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                            停用
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <div className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-100">
                          <i className="ri-scales-3-line text-2xl" />
                        </div>
                        <p className="text-sm">暂无电子秤设备</p>
                        <p className="text-xs">请先在「食材验收管理 → 电子秤设备」中添加设备</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Error hint */}
        {bindError && (
          <div className="flex items-center gap-2 px-6 py-3 bg-red-50 border-t border-red-100">
            <i className="ri-error-warning-line text-red-500 text-sm" />
            <span className="text-xs text-red-600">{bindError}</span>
          </div>
        )}

        {/* Active device hint */}
        {!bindError && filtered.length > 0 && activeDevices.length === 0 && (
          <div className="flex items-center gap-2 px-6 py-3 bg-amber-50 border-t border-amber-100">
            <i className="ri-information-line text-amber-500 text-sm" />
            <span className="text-xs text-amber-600">当前没有已启用的设备，请先在设备管理中启用设备</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <div className="text-xs text-slate-400">
            {selectedId ? (
              <>已选择：<span className="text-slate-600 font-medium">{devices.find((d) => d.id === selectedId)?.device_name}</span></>
            ) : (
              '请选择一台设备'
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
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedId}
              className="text-sm bg-slate-800 text-white rounded-lg px-5 py-2 hover:bg-slate-700 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              确认绑定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}