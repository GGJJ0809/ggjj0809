import { useState } from 'react';
import { useHikvision } from '@/hooks/useHikvision';
import CameraFrame from '@/pages/behavior/video/components/CameraFrame';

export default function CameraGrid() {
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const { channels, devices, isConfigured } = useHikvision();

  // 启用的摄像头通道
  const enabledDevices = devices.filter((d) => d.enabled);
  const enabledChannels = channels.filter((c) => c.enabled && c.rtspUrl);

  const cameraPairs = enabledChannels.map((ch) => {
    const dev = enabledDevices.find((d) => d.id === ch.deviceId);
    return dev ? { ch, dev, key: `${dev.id}_${ch.channelNo}` } : null;
  }).filter(Boolean) as { ch: typeof enabledChannels[number]; dev: typeof enabledDevices[number]; key: string }[];

  // 固定 9 格，不足补空
  const displaySlots = [...cameraPairs];
  while (displaySlots.length < 9) {
    displaySlots.push({ ch: null, dev: null, key: `empty_${displaySlots.length}` } as any);
  }

  const rtspSupported = typeof window !== 'undefined' && !!(window as any).electronAPI?.rtspStart;

  return (
    <div className="grid grid-cols-3 gap-0.5 h-full bg-black">
      {displaySlots.slice(0, 9).map((slot) => {
        const isEmpty = !slot.ch;
        const isActive = activeCell === slot.key;

        return (
          <div
            key={slot.key}
            className={`relative overflow-hidden group cursor-pointer transition-all duration-300 ${isActive ? 'ring-2 ring-inset ring-emerald-400 z-10' : ''}`}
          >
            {isEmpty || !isConfigured ? (
              <div
                className="w-full h-full bg-slate-950 flex flex-col items-center justify-center"
                onClick={() => setActiveCell(isActive ? null : slot.key)}
              >
                <i className="ri-camera-off-line text-slate-600 text-7xl mb-1" />
                <span className="text-slate-600 text-xl">{isConfigured ? '未配置' : '未配置摄像头'}</span>
              </div>
            ) : (
              <CameraFrame
                channel={slot.ch}
                fillContainer
                showRefresh={rtspSupported}
                showScanline
                isActive={isActive}
                onClick={() => setActiveCell(isActive ? null : slot.key)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}