import { useState } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { useHikvision } from '@/hooks/useHikvision';
import CameraFrame from './components/CameraFrame';
import HikvisionConfigModal from './components/HikvisionConfigModal';

type Layout = '1x1' | '2x2' | '3x3';

// 检测是否支持 RTSP（桌面客户端才具备 IPC 通道）
const rtspSupported =
  typeof window !== 'undefined' && !!(window as any).electronAPI?.rtspStart;

export default function VideoPage() {
  const [layout, setLayout] = useState<Layout>('2x2');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [fullscreenKey, setFullscreenKey] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [dismissWarning, setDismissWarning] = useState(false);

  const { devices, channels, isConfigured, loading, saveAll } = useHikvision();

  const gridClass: Record<Layout, string> = {
    '1x1': 'grid-cols-1',
    '2x2': 'grid-cols-2',
    '3x3': 'grid-cols-3',
  };
  const displayCount: Record<Layout, number> = { '1x1': 1, '2x2': 4, '3x3': 9 };

  // Flatten all enabled channels with their device info
  const allCameras = channels
    .filter((ch) => ch.enabled && ch.rtspUrl)
    .map((ch) => ({
      ch,
      dev: devices.find((d) => d.id === ch.deviceId && d.enabled),
    }))
    .filter((item): item is { ch: typeof item.ch; dev: NonNullable<typeof item.dev> } => !!item.dev);

  const displayCameras = allCameras.slice(0, displayCount[layout]);

  const fullscreenItem = fullscreenKey
    ? allCameras.find((item) => `${item.dev.id}_${item.ch.channelNo}` === fullscreenKey)
    : null;

  return (
    <AppLayout title="视频监控" breadcrumb={['行为分析', '视频监控']}>
      {/* ── 非桌面客户端：明确的提示（可关闭）── */}
      {!rtspSupported && !dismissWarning && (
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-4">
          <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-rose-100 flex-shrink-0 mt-0.5">
            <i className="ri-computer-line text-rose-500 text-base" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-rose-700 mb-1">
              当前环境不支持 RTSP 流播放
            </p>
            <p className="text-xs text-rose-600 leading-relaxed">
              请使用桌面客户端打开本应用。摄像头配置功能可正常使用，但视频预览需要 Electron 桌面客户端环境。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissWarning(true)}
            className="text-rose-400 hover:text-rose-600 cursor-pointer flex-shrink-0 mt-0.5"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>
      )}

      <div className="flex gap-4">
        {/* Main video area */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-semibold text-slate-800">实时监控</span>
              {isConfigured ? (
                <span className="text-xs text-slate-400">
                  {rtspSupported ? `${allCameras.length} 路在线` : `${allCameras.length} 路已配置`}
                </span>
              ) : (
                <span className="text-xs text-amber-500">未配置 RTSP 通道</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">布局：</span>
              {(['1x1', '2x2', '3x3'] as Layout[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLayout(l)}
                  className={`text-xs px-2.5 py-1 rounded-md cursor-pointer whitespace-nowrap transition-colors ${
                    layout === l ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {l}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowConfig(true)}
                className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-settings-3-line" />
                配置设备
              </button>
            </div>
          </div>

          {/* Loading state */}
          {loading ? (
            <div className="bg-slate-900 rounded-xl flex flex-col items-center justify-center py-24 text-slate-500">
              <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-slate-800 mb-4">
                <i className="ri-loader-4-line text-3xl text-slate-400 animate-spin" />
              </div>
              <p className="text-base text-slate-300 font-medium mb-1">加载摄像头配置中...</p>
            </div>
          ) : !isConfigured ? (
            <div className="bg-slate-900 rounded-xl flex flex-col items-center justify-center py-24 text-slate-500">
              <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-slate-800 mb-4">
                <i className="ri-camera-line text-3xl text-slate-500" />
              </div>
              <p className="text-base text-slate-300 font-medium mb-1">尚未配置 RTSP 摄像头</p>
              <p className="text-sm text-slate-500 mb-5">配置海康威视 RTSP 地址后，通过桌面客户端即可实时查看监控画面</p>
              <button
                type="button"
                onClick={() => setShowConfig(true)}
                className="flex items-center gap-2 bg-emerald-500 text-white text-sm px-5 py-2.5 rounded-xl hover:bg-emerald-600 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line" />
                配置 RTSP 摄像头
              </button>
              <div className="mt-6 grid grid-cols-3 gap-4 text-center text-xs text-slate-600 max-w-sm">
                {[
                  { icon: 'ri-server-line', text: '添加录像机设备' },
                  { icon: 'ri-links-line', text: '填写 RTSP 流地址' },
                  { icon: 'ri-live-line', text: '实时播放摄像头画面' },
                ].map((step) => (
                  <div key={step.text} className="flex flex-col items-center gap-2">
                    <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800">
                      <i className={`${step.icon} text-slate-400`} />
                    </div>
                    <p>{step.text}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : !rtspSupported ? (
            /* RTSP 不可用：即使有配置也不渲染摄像头帧，引导用户使用桌面客户端 */
            <div className="bg-slate-900 rounded-xl flex flex-col items-center justify-center py-20 text-slate-500">
              <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-slate-800 mb-4">
                <i className="ri-computer-line text-3xl text-slate-400" />
              </div>
              <p className="text-base text-slate-300 font-medium mb-1">当前环境不支持 RTSP 流播放</p>
              <p className="text-sm text-slate-500 mb-2">请使用桌面客户端打开本应用以查看实时监控画面</p>
              <p className="text-xs text-slate-600">
                已配置 {allCameras.length} 路摄像头，切换到桌面客户端后即可查看
              </p>
            </div>
          ) : displayCameras.length === 0 ? (
            <div className="bg-slate-900 rounded-xl flex flex-col items-center justify-center py-20 text-slate-500">
              <i className="ri-camera-off-line text-3xl mb-3" />
              <p className="text-sm">没有启用的摄像头通道</p>
              <button type="button" onClick={() => setShowConfig(true)} className="mt-3 text-xs text-emerald-400 cursor-pointer hover:underline">
                去配置通道
              </button>
            </div>
          ) : (
            <div className={`grid ${gridClass[layout]} gap-2`}>
              {displayCameras.map(({ dev, ch }) => {
                const key = `${dev.id}_${ch.channelNo}`;
                return (
                  <CameraFrame
                    key={key}
                    channel={ch}
                    selected={selectedKey === key}
                    onClick={() => setSelectedKey(key)}
                    onFullscreen={() => setFullscreenKey(key)}
                  />
                );
              })}
              {/* Empty slots */}
              {Array.from({ length: Math.max(0, displayCount[layout] - displayCameras.length) }).map((_, i) => (
                <div
                  key={`empty_${i}`}
                  onClick={() => setShowConfig(true)}
                  className="relative rounded-xl overflow-hidden bg-slate-900 cursor-pointer border-2 border-dashed border-slate-700 hover:border-slate-500 transition-colors"
                >
                  <div className="w-full" style={{ paddingTop: '56.25%', position: 'relative' }}>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
                      <i className="ri-add-circle-line text-2xl mb-1" />
                      <span className="text-xs">添加摄像头</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel: Camera list */}
        <div className="w-56 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-600">摄像头列表</p>
            <button
              type="button"
              onClick={() => setShowConfig(true)}
              className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <i className="ri-settings-3-line" />
            </button>
          </div>

          {allCameras.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <i className="ri-camera-line text-2xl mb-2" />
              <p className="text-xs">暂无摄像头</p>
              <button type="button" onClick={() => setShowConfig(true)} className="text-xs text-emerald-500 mt-2 cursor-pointer hover:underline">
                添加设备
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {allCameras.map(({ dev, ch }) => {
                const key = `${dev.id}_${ch.channelNo}`;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={`w-full flex items-center gap-2 p-2.5 rounded-lg text-left cursor-pointer transition-colors border ${
                      selectedKey === key ? 'border-emerald-200 bg-emerald-50' : 'border-transparent bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 flex-shrink-0 text-xs font-mono text-slate-500">
                      {ch.channelNo}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{ch.name}</p>
                      <p className="text-xs text-slate-400 truncate">{ch.location || dev.name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen modal */}
      {fullscreenKey && fullscreenItem && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-6 py-3 bg-black/60">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-white font-medium">{fullscreenItem.ch.name}</span>
              <span className="text-white/50 text-sm">{fullscreenItem.ch.location} · CH{fullscreenItem.ch.channelNo} · {fullscreenItem.dev.ip}</span>
            </div>
            <button
              type="button"
              onClick={() => setFullscreenKey(null)}
              className="text-white/70 hover:text-white cursor-pointer flex items-center gap-1.5 text-sm"
            >
              <i className="ri-close-line text-lg" />
              退出全屏
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="w-full max-w-6xl">
              <CameraFrame channel={fullscreenItem.ch} fillContainer showRefresh={false} showScanline />
            </div>
          </div>
        </div>
      )}

      {/* Config modal */}
      {showConfig && (
        <HikvisionConfigModal
          devices={devices}
          channels={channels}
          onSave={saveAll}
          onClose={() => setShowConfig(false)}
        />
      )}
    </AppLayout>
  );
}