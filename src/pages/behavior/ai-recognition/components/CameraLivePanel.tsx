import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHikvision } from '@/hooks/useHikvision';
import CameraFrame from '@/pages/behavior/video/components/CameraFrame';

export default function CameraLivePanel() {
  const { devices, channels, isConfigured } = useHikvision();
  const [selectedChannelKey, setSelectedChannelKey] = useState<string | null>(null);
  const navigate = useNavigate();

  const rtspSupported =
    typeof window !== 'undefined' && !!(window as any).electronAPI?.rtspStart;

  const enabledDevices = devices.filter((d) => d.enabled);
  const enabledChannels = channels.filter((c) => c.enabled);

  // All device+channel pairs
  const pairs = enabledChannels.map((ch) => {
    const device = enabledDevices.find((d) => d.id === ch.deviceId);
    return device ? { device, channel: ch, key: `${ch.deviceId}_ch${ch.channelNo}` } : null;
  }).filter(Boolean) as { device: ReturnType<typeof enabledDevices[number]>; channel: typeof enabledChannels[number]; key: string }[];

  const selectedPair = selectedChannelKey
    ? pairs.find((p) => p.key === selectedChannelKey)
    : pairs[0] || null;

  if (!isConfigured || pairs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl border border-slate-100 text-center p-8">
        <div className="w-16 h-16 flex items-center justify-center rounded-full bg-slate-100 mb-4">
          <i className="ri-camera-off-line text-slate-400 text-3xl" />
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-1">尚未配置海康摄像头</p>
        <p className="text-xs text-slate-400 mb-1 max-w-xs">
          配置录像机 IP 和摄像头通道后，可在此实时查看监控画面，AI 识别事件将关联对应摄像头
        </p>
        {!rtspSupported && (
          <p className="text-xs text-amber-500 mb-5 max-w-xs">
            注意：浏览器无法直接播放 RTSP，实时画面需通过桌面客户端查看
          </p>
        )}
        <button
          type="button"
          onClick={() => navigate('/behavior/video')}
          className="flex items-center gap-1.5 text-sm bg-slate-900 text-white px-4 py-2.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap"
        >
          <i className="ri-settings-3-line" />
          前往视频监控配置
        </button>
      </div>
    );
  }

  // ── 非桌面客户端有配置但无法播放时的小提示 ──
  if (!rtspSupported && pairs.length > 0) {
    return (
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2">
          <i className="ri-error-warning-line text-amber-500 text-sm flex-shrink-0" />
          <span className="text-xs text-amber-700">桌面客户端 IPC 通道未就绪，实时画面需通过桌面客户端查看（支持麒麟系统）</span>
        </div>
        {/* Show camera frames — they will display their own error state */}
        {selectedPair && (
          <div className="bg-slate-900 rounded-xl overflow-hidden">
            <CameraFrame
              channel={selectedPair.channel}
              selected
            />
            <div className="px-4 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">{selectedPair.channel.name}</p>
                <p className="text-white/40 text-xs">{selectedPair.channel.location || selectedPair.device.name} · {selectedPair.device.ip}</p>
              </div>
            </div>
          </div>
        )}
        {pairs.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pairs.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setSelectedChannelKey(p.key)}
                className={`flex-shrink-0 w-32 cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                  (selectedChannelKey === p.key || (!selectedChannelKey && p === pairs[0]))
                    ? 'border-emerald-400'
                    : 'border-transparent hover:border-slate-500'
                }`}
              >
                <CameraFrame channel={p.channel} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-3 min-w-0">
      {/* Main large view */}
      {selectedPair && (
        <div className="bg-slate-900 rounded-xl overflow-hidden">
          <CameraFrame
            device={selectedPair.device}
            channel={selectedPair.channel}
            refreshInterval={3000}
            selected
          />
          <div className="px-4 py-2.5 flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">{selectedPair.channel.name}</p>
              <p className="text-white/40 text-xs">{selectedPair.channel.location || selectedPair.device.name} · {selectedPair.device.ip}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 text-xs">实时</span>
              <span className="text-white/30 text-xs ml-2">3s 刷新</span>
            </div>
          </div>
        </div>
      )}

      {/* Thumbnail strip */}
      {pairs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {pairs.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setSelectedChannelKey(p.key)}
              className={`flex-shrink-0 w-32 cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                (selectedChannelKey === p.key || (!selectedChannelKey && p === pairs[0]))
                  ? 'border-emerald-400'
                  : 'border-transparent hover:border-slate-500'
              }`}
            >
              <CameraFrame
                device={p.device}
                channel={p.channel}
                refreshInterval={5000}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}