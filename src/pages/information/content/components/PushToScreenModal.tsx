import { useState } from 'react';

interface ScreenDevice {
  id: string;
  name: string;
  location: string;
  resolution: string;
  status: string;
}

type ContentItem = {
  id: string;
  title: string;
  type: string;
  status: string;
  screens: string[];
  preview: string;
};

interface PushToScreenModalProps {
  content: ContentItem;
  screens: ScreenDevice[];
  onClose: () => void;
  onPush: (screenIds: string[]) => void;
}

const deviceStatusConfig = {
  online: { label: '在线', dot: 'bg-emerald-400', text: 'text-emerald-600' },
  offline: { label: '离线', dot: 'bg-slate-300', text: 'text-slate-400' },
  warning: { label: '异常', dot: 'bg-amber-400', text: 'text-amber-500' },
};

export default function PushToScreenModal({ content, screens, onClose, onPush }: PushToScreenModalProps) {
  const [selectedScreens, setSelectedScreens] = useState<string[]>(content.screens ?? []);
  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState(false);

  const toggleScreen = (screenId: string, status: string) => {
    if (status === 'offline') return;
    setSelectedScreens((prev) =>
      prev.includes(screenId) ? prev.filter((s) => s !== screenId) : [...prev, screenId],
    );
  };

  const selectAll = () => {
    const available = screens.filter((s) => s.status !== 'offline').map((s) => s.id);
    setSelectedScreens(available);
  };

  const clearAll = () => setSelectedScreens([]);

  const handlePush = () => {
    if (selectedScreens.length === 0) return;
    setPushing(true);
    setTimeout(() => {
      setPushing(false);
      setPushed(true);
      setTimeout(() => {
        onPush(selectedScreens);
        onClose();
      }, 900);
    }, 1400);
  };

  const onlineCount = screens.filter((s) => s.status === 'online').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-lg mx-4 flex flex-col shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-semibold text-slate-800">推送至大屏展示</p>
            <p className="text-xs text-slate-400 mt-0.5">{content.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer transition-colors"
          >
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {/* Screen list header */}
        <div className="flex items-center justify-between px-6 mt-4 mb-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-slate-700">选择屏幕</p>
            <span className="text-xs text-slate-400">({onlineCount} 台可用)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-emerald-600 hover:text-emerald-700 cursor-pointer whitespace-nowrap transition-colors"
            >
              全选
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer whitespace-nowrap transition-colors"
            >
              清空
            </button>
          </div>
        </div>

        {/* Screen list */}
        <div className="px-6 space-y-2 max-h-64 overflow-y-auto pb-1">
          {screens.map((device) => {
            const cfg = deviceStatusConfig[device.status as keyof typeof deviceStatusConfig];
            const isSelected = selectedScreens.includes(device.id);
            const isOffline = device.status === 'offline';
            const wasAlready = content.screens.includes(device.id);

            return (
              <button
                key={device.id}
                type="button"
                onClick={() => toggleScreen(device.id, device.status)}
                disabled={isOffline}
                className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                  isOffline
                    ? 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-60'
                    : isSelected
                    ? 'border-emerald-400 bg-emerald-50/70 cursor-pointer'
                    : 'border-slate-100 hover:border-slate-200 bg-white cursor-pointer'
                }`}
              >
                {/* Checkbox */}
                <div
                  className={`w-4 h-4 flex items-center justify-center rounded flex-shrink-0 border transition-colors ${
                    isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                  }`}
                >
                  {isSelected && <i className="ri-check-line text-white text-xs" />}
                </div>

                {/* Screen icon */}
                <div
                  className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${
                    isSelected ? 'bg-emerald-100' : 'bg-slate-100'
                  }`}
                >
                  <i className={`ri-tv-2-line text-sm ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{device.name}</span>
                    {wasAlready && !isOffline && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500">已推送</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 truncate">{device.location} · {device.resolution}</p>
                </div>

                {/* Status */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  <span className={`text-xs ${cfg.text}`}>{cfg.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 mt-3 border-t border-slate-100 flex items-center justify-between">
          <div>
            {selectedScreens.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <i className="ri-checkbox-circle-fill text-emerald-500 text-sm" />
                <span className="text-xs text-slate-700">
                  已选 <span className="font-semibold text-emerald-600">{selectedScreens.length}</span> 台
                </span>
              </div>
            ) : (
              <p className="text-xs text-slate-400">请选择至少一台屏幕</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handlePush}
              disabled={selectedScreens.length === 0 || pushing || pushed}
              className={`text-xs px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap transition-all flex items-center gap-1.5 ${
                pushed
                  ? 'bg-emerald-500 text-white'
                  : selectedScreens.length > 0 && !pushing
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : pushing
                  ? 'bg-emerald-400 text-white cursor-wait'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {pushed ? (
                <><i className="ri-check-line" />推送成功</>
              ) : pushing ? (
                <><i className="ri-loader-4-line animate-spin" />推送中...</>
              ) : (
                <><i className="ri-send-plane-line" />立即推送</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}