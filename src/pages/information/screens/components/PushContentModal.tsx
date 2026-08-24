import { useState } from 'react';

interface ContentItem {
  id: string;
  title: string;
  type: string;
  status: string;
  preview: string;
  author: string;
  updateTime: string;
  screens: string[];
}

interface Screen {
  id: string;
  name: string;
  location: string;
  currentContentId: string;
  status: string;
}

interface PushContentModalProps {
  screen: Screen;
  contents: ContentItem[];
  onClose: () => void;
  onPush: (contentId: string) => void;
}

const statusTag: Record<string, { label: string; cls: string }> = {
  published: { label: '已发布', cls: 'bg-emerald-50 text-emerald-600' },
  draft: { label: '草稿', cls: 'bg-slate-100 text-slate-500' },
  scheduled: { label: '计划中', cls: 'bg-amber-50 text-amber-600' },
  archived: { label: '已归档', cls: 'bg-slate-100 text-slate-400' },
};

const typeIconMap: Record<string, string> = {
  菜谱公告: 'ri-restaurant-line',
  安全公示: 'ri-shield-check-line',
  临时通知: 'ri-notification-3-line',
  互动内容: 'ri-survey-line',
  统计报告: 'ri-bar-chart-2-line',
};

export default function PushContentModal({ screen, contents, onClose, onPush }: PushContentModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('全部');
  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState(false);

  const pushableItems = contents.filter(
    (item) => item.status === 'published' || item.status === 'scheduled',
  );

  const types = ['全部', ...Array.from(new Set(pushableItems.map((i) => i.type)))];

  const filtered = pushableItems.filter((item) => {
    const matchType = filterType === '全部' || item.type === filterType;
    const matchSearch =
      item.title.includes(searchText) || item.type.includes(searchText) || item.preview.includes(searchText);
    return matchType && matchSearch;
  });

  const selected = pushableItems.find((i) => i.id === selectedId) ?? null;

  const handlePush = () => {
    if (!selected) return;
    setPushing(true);
    setTimeout(() => {
      setPushing(false);
      setPushed(true);
      setTimeout(() => {
        onPush(selected.id);
        onClose();
      }, 900);
    }, 1400);
  };

  const currentContent = contents.find((c) => c.id === screen.currentContentId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-2xl mx-4 max-h-[88vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center bg-emerald-50 rounded-lg">
              <i className="ri-send-plane-line text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">推送内容至设备</p>
              <p className="text-xs text-slate-400 mt-0.5">{screen.name} · {screen.location}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer transition-colors"
          >
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {/* Current content hint */}
        <div className="mx-6 mt-4 flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
          <i className="ri-tv-2-line text-slate-400 text-sm" />
          <span className="text-xs text-slate-500">当前播放：</span>
          <span className="text-xs font-medium text-slate-700">{currentContent?.title || '未推送'}</span>
        </div>

        {/* Search + filter */}
        <div className="px-6 mt-3 flex items-center gap-2">
          <div className="flex-1 relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input
              type="text"
              placeholder="搜索内容..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full text-sm pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-emerald-400 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                className={`text-xs px-2.5 py-1 rounded-full cursor-pointer whitespace-nowrap transition-colors ${
                  filterType === t
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto px-6 mt-3 space-y-2 pb-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <i className="ri-inbox-2-line text-2xl block mb-2" />
              <p className="text-sm">暂无可推送内容</p>
            </div>
          )}
          {filtered.map((item) => {
            const tag = statusTag[item.status];
            const icon = typeIconMap[item.type] ?? 'ri-file-text-line';
            const isSelected = selectedId === item.id;
            const alreadyOnScreen = item.screens?.includes(screen.name);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(isSelected ? null : item.id)}
                className={`w-full text-left rounded-xl border-2 p-3 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-emerald-400 bg-emerald-50/60'
                    : 'border-slate-100 hover:border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0 ${
                      isSelected ? 'bg-emerald-100' : 'bg-slate-100'
                    }`}
                  >
                    <i className={`${icon} ${isSelected ? 'text-emerald-600' : 'text-slate-500'} text-base`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">{item.title}</span>
                        {alreadyOnScreen && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500">
                            当前在播
                          </span>
                        )}
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${tag.cls}`}>{tag.label}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 mb-1">{item.type} · {item.author} · {item.updateTime.split(' ')[0]}</p>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{item.preview}</p>
                    {item.screens && item.screens.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.screens.map((s) => (
                          <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 flex items-center justify-center rounded-full bg-emerald-500 flex-shrink-0 mt-0.5">
                      <i className="ri-check-line text-white text-xs" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <div>
            {selected ? (
              <div className="flex items-center gap-1.5 text-sm text-slate-700">
                <i className="ri-checkbox-circle-fill text-emerald-500" />
                已选：<span className="font-medium">{selected.title}</span>
              </div>
            ) : (
              <p className="text-xs text-slate-400">请从上方选择一项内容进行推送</p>
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
              disabled={!selected || pushing || pushed}
              className={`text-xs px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap transition-all flex items-center gap-1.5 ${
                pushed
                  ? 'bg-emerald-500 text-white'
                  : selected && !pushing
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : pushing
                  ? 'bg-emerald-400 text-white cursor-wait'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {pushed ? (
                <>
                  <i className="ri-check-line" />推送成功
                </>
              ) : pushing ? (
                <>
                  <i className="ri-loader-4-line animate-spin" />推送中...
                </>
              ) : (
                <>
                  <i className="ri-send-plane-line" />立即推送
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}