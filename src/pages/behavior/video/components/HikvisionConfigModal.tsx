import { useState } from 'react';
import type { HikvisionDevice, HikvisionChannel } from '@/hooks/useHikvision';

interface Props {
  devices: HikvisionDevice[];
  channels: HikvisionChannel[];
  onSave: (devices: HikvisionDevice[], channels: HikvisionChannel[]) => void;
  onClose: () => void;
}

export default function HikvisionConfigModal({ devices: initDevices, channels: initChannels, onSave, onClose }: Props) {
  const [devices, setDevices] = useState<HikvisionDevice[]>(initDevices);
  const [channels, setChannels] = useState<HikvisionChannel[]>(initChannels);

  const [showForm, setShowForm] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null); // "deviceId_channelNo"

  const [form, setForm] = useState({
    name: '',
    rtspUrl: '',
    location: '',
    enabled: true,
  });

  const openAdd = () => {
    setEditingKey(null);
    setForm({ name: '', rtspUrl: '', location: '', enabled: true });
    setShowForm(true);
  };

  const openEdit = (ch: HikvisionChannel) => {
    const dev = devices.find((d) => d.id === ch.deviceId);
    setEditingKey(`${ch.deviceId}_${ch.channelNo}`);
    setForm({
      name: ch.name,
      rtspUrl: ch.rtspUrl,
      location: ch.location,
      enabled: ch.enabled,
    });
    setShowForm(true);
  };

  const findOrCreateDevice = (): HikvisionDevice => {
    // 从 RTSP URL 中提取 IP 自动创建设备
    const ipMatch = form.rtspUrl.match(/@([^:]+):/);
    const ip = ipMatch ? ipMatch[1] : '未识别';
    const existing = devices.find((d) => d.ip === ip);
    if (existing) return existing;
    const newDev: HikvisionDevice = {
      id: `dev_${Date.now()}`,
      name: `摄像头设备 (${ip})`,
      ip,
      enabled: true,
    };
    setDevices((prev) => [...prev, newDev]);
    return newDev;
  };

  const handleSaveChannel = () => {
    if (!form.name.trim() || !form.rtspUrl.trim()) return;

    if (editingKey) {
      const [deviceId, channelNoStr] = editingKey.split('_');
      const channelNo = Number(channelNoStr);
      setChannels((prev) =>
        prev.map((c) =>
          c.deviceId === deviceId && c.channelNo === channelNo
            ? { ...c, name: form.name.trim(), rtspUrl: form.rtspUrl.trim(), location: form.location.trim(), enabled: form.enabled }
            : c
        )
      );
    } else {
      const dev = findOrCreateDevice();
      const nextNo = channels.filter((c) => c.deviceId === dev.id).length + 1;
      const newCh: HikvisionChannel = {
        deviceId: dev.id,
        channelNo: nextNo,
        name: form.name.trim(),
        location: form.location.trim(),
        rtspUrl: form.rtspUrl.trim(),
        enabled: form.enabled,
      };
      setChannels((prev) => [...prev, newCh]);
    }
    setShowForm(false);
  };

  const handleRemove = (deviceId: string, channelNo: number) => {
    setChannels((prev) => prev.filter((c) => !(c.deviceId === deviceId && c.channelNo === channelNo)));
  };

  const handleSaveAll = () => {
    onSave(devices, channels);
    onClose();
  };

  const sampleRtspUrl = 'rtsp://admin:password@192.168.1.64:554/Streaming/Channels/102';

  const rtspSupported =
    typeof window !== 'undefined' && !!(window as any).electronAPI?.rtspStart;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50">
              <i className="ri-live-line text-emerald-600 text-base" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">RTSP 摄像头配置</h3>
              <p className="text-xs text-slate-400 mt-0.5">直连海康威视 RTSP 视频流</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {/* Environment warning — browser users */}
        {!rtspSupported && (
          <div className="flex items-start gap-2 bg-amber-50 border-b border-amber-100 px-6 py-3">
            <i className="ri-error-warning-line text-amber-500 text-sm mt-0.5" />
            <div className="text-xs text-amber-700">
              <p className="font-semibold mb-0.5">桌面客户端 IPC 通道未就绪，RTSP 视频流无法播放</p>
              <p>您仍可在此添加和编辑摄像头配置，但实时画面需通过<strong>桌面客户端</strong>查看（支持麒麟系统）。如果已安装桌面客户端，请重启应用后再试。</p>
            </div>
          </div>
        )}

        {/* Info bar */}
        <div className="flex items-start gap-2 bg-emerald-50 border-b border-emerald-100 px-6 py-3">
          <i className="ri-information-line text-emerald-500 text-sm mt-0.5" />
          <div className="text-xs text-emerald-700">
            <p className="font-semibold mb-0.5">配置说明</p>
            <p>填写摄像头名称和完整的 RTSP 地址即可添加。推荐使用子码流（末尾为 <strong>02</strong>），更流畅、省带宽。摄像头需与电脑在同一局域网。</p>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-1.5">
            {channels.map((ch) => {
              const dev = devices.find((d) => d.id === ch.deviceId);
              return (
                <div key={`${ch.deviceId}_${ch.channelNo}`} className="flex items-center gap-3 border border-slate-100 rounded-xl px-4 py-3 bg-slate-50/50">
                  <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 flex-shrink-0 text-xs font-mono font-semibold text-slate-500">
                    {ch.channelNo}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{ch.name}</p>
                    <p className="text-xs text-slate-400 font-mono truncate">{ch.rtspUrl}</p>
                    {ch.location && <p className="text-xs text-slate-400 mt-0.5">{ch.location} · {dev?.ip}</p>}
                  </div>
                  <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${ch.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${ch.enabled ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                    {ch.enabled ? '启用' : '禁用'}
                  </div>
                  <button type="button" onClick={() => openEdit(ch)} className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-2.5 py-1 rounded-lg cursor-pointer whitespace-nowrap hover:bg-white">
                    编辑
                  </button>
                  <button type="button" onClick={() => handleRemove(ch.deviceId, ch.channelNo)} className="text-xs text-red-400 hover:text-red-600 border border-red-100 px-2.5 py-1 rounded-lg cursor-pointer whitespace-nowrap hover:bg-red-50">
                    删除
                  </button>
                </div>
              );
            })}

            {channels.length === 0 && (
              <div className="text-center py-10 text-slate-400">
                <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-slate-100 mx-auto mb-3">
                  <i className="ri-camera-line text-2xl text-slate-300" />
                </div>
                <p className="text-sm">暂未添加摄像头</p>
                <p className="text-xs mt-1 mb-4">点击下方按钮添加 RTSP 摄像头</p>
              </div>
            )}

            <button
              type="button"
              onClick={openAdd}
              className="flex items-center justify-center gap-2 text-sm border-2 border-dashed border-slate-200 rounded-xl px-4 py-3.5 w-full text-slate-500 hover:border-emerald-300 hover:text-emerald-600 cursor-pointer transition-colors"
            >
              <i className="ri-add-circle-line text-base" />
              添加 RTSP 摄像头
            </button>

            {/* Add/Edit Form */}
            {showForm && (
              <div className="border border-slate-200 rounded-xl p-4 bg-white mt-3">
                <p className="text-sm font-semibold text-slate-700 mb-3">
                  {editingKey ? '编辑摄像头' : '添加 RTSP 摄像头'}
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      摄像头名称 <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="如：收货区摄像头"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      RTSP 视频流地址 <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.rtspUrl}
                      onChange={(e) => setForm((p) => ({ ...p, rtspUrl: e.target.value }))}
                      placeholder={sampleRtspUrl}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 font-mono"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      格式：rtsp://用户名:密码@IP:554/Streaming/Channels/通道号流类型
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">安装位置（可选）</label>
                    <input
                      type="text"
                      value={form.location}
                      onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                      placeholder="如：食堂一楼后厨入口"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="ch-enabled"
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
                      className="cursor-pointer"
                    />
                    <label htmlFor="ch-enabled" className="text-xs text-slate-600 cursor-pointer">启用此摄像头</label>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <div className="flex-1" />
                  <button type="button" onClick={() => setShowForm(false)} className="text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-50 cursor-pointer whitespace-nowrap">取消</button>
                  <button type="button" onClick={handleSaveChannel} className="text-xs bg-emerald-600 text-white rounded-lg px-4 py-2 hover:bg-emerald-700 cursor-pointer whitespace-nowrap">保存</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            <i className="ri-information-line mr-1" />
            配置保存在本地，刷新页面不丢失
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap">取消</button>
            <button type="button" onClick={handleSaveAll} className="text-sm bg-slate-800 text-white rounded-lg px-5 py-2 hover:bg-slate-700 cursor-pointer whitespace-nowrap">完成</button>
          </div>
        </div>
      </div>
    </div>
  );
}