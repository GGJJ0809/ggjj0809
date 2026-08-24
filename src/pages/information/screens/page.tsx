import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/feature/AppLayout';
import { useDisplayConfig } from '@/hooks/useDisplayConfig';
import { nowBeijing } from '@/lib/dateUtils';
import type { DisplayScreen } from '@/hooks/useDisplayConfig';
import LayoutEditorModal from './components/LayoutEditorModal';
import PushContentModal from './components/PushContentModal';

const statusConfig = {
  online: { label: '在线', bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-400' },
  offline: { label: '离线', bg: 'bg-slate-50', text: 'text-slate-500', dot: 'bg-slate-300' },
  warning: { label: '异常', bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-400' },
};

export default function ScreensPage() {
  const navigate = useNavigate();
  const { config, loading, createScreen, editScreen, removeScreen } = useDisplayConfig();
  const [selected, setSelected] = useState<DisplayScreen | null>(null);
  const [brightness, setBrightness] = useState(80);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newScreen, setNewScreen] = useState({
    name: '', location: '', resolution: '1920×1080', type: 'LED显示屏', status: 'online' as const,
    currentContentId: '', brightness: 80, ip: '', lastPush: '', zones: ['主内容区'],
  });

  const screens = config?.screens ?? [];
  const contents = config?.contents ?? [];

  const getCurrentContentTitle = (screen: DisplayScreen) => {
    const content = contents.find((c) => c.id === screen.currentContentId);
    return content?.title || '未推送';
  };

  const handleBrightnessChange = async (val: number) => {
    setBrightness(val);
    if (selected) {
      await editScreen(selected.id, { brightness: val });
    }
  };

  const handleAddScreen = async () => {
    if (!newScreen.name.trim()) return;
    const now = nowBeijing();
    await createScreen({ ...newScreen, lastPush: now });
    setNewScreen({
      name: '', location: '', resolution: '1920×1080', type: 'LED显示屏', status: 'online',
      currentContentId: '', brightness: 80, ip: '', lastPush: '', zones: ['主内容区'],
    });
    setShowAddModal(false);
  };

  const handleDeleteScreen = async () => {
    if (!selected) return;
    if (!confirm(`确定删除屏幕「${selected.name}」？`)) return;
    await removeScreen(selected.id);
    setSelected(null);
  };

  const handleLaunchDisplay = async (screenId: string) => {
    const api = (window as any).electronAPI;
    if (api?.displayOpen) {
      const result = await api.displayOpen(screenId);
      if (result.success) {
        alert(`大屏窗口「${screenId}」已启动`);
      } else {
        alert('启动失败: ' + (result.error || '未知错误'));
      }
    } else {
      navigate(`/display/${screenId}`);
    }
  };

  const getScreenUrl = (screenId: string) => {
    return `${window.location.origin}/display/${screenId}`;
  };

  const onlineCount = screens.filter((s) => s.status === 'online').length;
  const isElectron = typeof (window as any).electronAPI !== 'undefined';

  return (
    <AppLayout title="屏幕管理" breadcrumb={['信息公示', '屏幕管理']}>
      {/* Quick access to display page */}
      <div className="mb-4 flex items-center justify-between bg-slate-900 rounded-xl px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center bg-emerald-500/20 rounded-lg">
            <i className="ri-tv-2-line text-emerald-400 text-lg" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold">大屏电视展示</p>
            <p className="text-slate-400 text-xs">每台LED大屏独立配置，可显示不同内容</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/display')}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
          >
            <i className="ri-fullscreen-line" />进入大屏展示
          </button>
        </div>
      </div>

      {/* Electron display window hint */}
      {isElectron && (
        <div className="mb-3 bg-emerald-50 rounded-lg px-4 py-3 border border-emerald-100 flex items-center gap-3">
          <i className="ri-tv-2-line text-emerald-500 text-lg" />
          <div className="flex-1">
            <p className="text-emerald-700 text-sm font-medium">Electron 大屏模式已就绪</p>
            <p className="text-emerald-600 text-xs">点击下方列表中「启动大屏」按钮即可在指定大屏电视上显示内容</p>
          </div>
          <div className="text-xs text-emerald-600 bg-emerald-100 px-2 py-1 rounded">
            ESC 退出全屏
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {[
          { label: '设备总数', value: screens.length, icon: 'ri-computer-line', color: 'text-slate-700', bg: 'bg-slate-100' },
          { label: '在线设备', value: onlineCount, icon: 'ri-wifi-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: '异常设备', value: screens.filter((s) => s.status === 'warning').length, icon: 'ri-error-warning-line', color: 'text-amber-500', bg: 'bg-amber-50' },
          { label: '离线设备', value: screens.filter((s) => s.status === 'offline').length, icon: 'ri-wifi-off-line', color: 'text-red-500', bg: 'bg-red-50' },
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Screen list */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
            <p className="text-sm font-semibold text-slate-800">屏幕设备列表</p>
            <button type="button" onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 text-xs bg-emerald-500 text-white px-2.5 py-1 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
              <i className="ri-add-line" />添加
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {loading ? (
              <div className="p-8 text-center text-slate-400">
                <i className="ri-loader-4-line animate-spin text-xl" />
                <p className="text-xs mt-2">加载中...</p>
              </div>
            ) : screens.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                暂无屏幕设备
              </div>
            ) : (
              screens.map((screen) => {
                const cfg = statusConfig[screen.status as keyof typeof statusConfig];
                return (
                  <button key={screen.id} type="button" onClick={() => { setSelected(screen); setBrightness(screen.brightness); }}
                    className={`w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:bg-slate-50 transition-colors ${selected?.id === screen.id ? 'bg-slate-50 border-l-2 border-emerald-400' : ''}`}>
                    <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-100 flex-shrink-0">
                      <i className="ri-tv-2-line text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-800 truncate">{screen.name}</p>
                        <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{screen.location}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span>{screen.resolution}</span>
                        <span>·</span>
                        <span>{screen.type}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Device detail + controls */}
        <div className="lg:col-span-2 space-y-4">
          {selected ? (
            <>
              {/* Device info card */}
              <div className="bg-white rounded-xl border border-slate-100 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-800">{selected.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{selected.location} · {selected.ip}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleDeleteScreen}
                      className="text-xs border border-red-200 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 cursor-pointer whitespace-nowrap">删除</button>
                    <button type="button" onClick={() => setShowPushModal(true)} className="text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
                      <i className="ri-send-plane-line mr-1" />推送内容
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { label: '分辨率', value: selected.resolution, icon: 'ri-fullscreen-line' },
                    { label: '设备类型', value: selected.type, icon: 'ri-computer-line' },
                  ].map((info) => (
                    <div key={info.label} className="bg-slate-50 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <i className={`${info.icon} text-slate-400 text-sm`} />
                        <span className="text-xs text-slate-400">{info.label}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-700">{info.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'IP地址', value: selected.ip || '—', icon: 'ri-global-line' },
                    { label: '最后推送', value: selected.lastPush.split(' ')[1] || '—', icon: 'ri-time-line' },
                    { label: '当前内容', value: getCurrentContentTitle(selected), icon: 'ri-article-line' },
                  ].map((info) => (
                    <div key={info.label} className="bg-slate-50 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <i className={`${info.icon} text-slate-400 text-sm`} />
                        <span className="text-xs text-slate-400">{info.label}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-700">{info.value}</p>
                    </div>
                  ))}
                </div>

                {/* Current content */}
                <div className="bg-slate-50 rounded-lg p-3 mb-4">
                  <p className="text-xs text-slate-500 mb-1">当前推送内容</p>
                  <p className="text-sm font-medium text-slate-800">{getCurrentContentTitle(selected)}</p>
                </div>
              </div>

              {/* Access URL & Launch */}
              <div className="bg-white rounded-xl border border-slate-100 p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">大屏访问地址</h3>
                <div className="bg-slate-900 rounded-lg p-4 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="ri-link text-emerald-400 text-xs" />
                    <span className="text-slate-400 text-xs">浏览器访问地址</span>
                  </div>
                  <code className="text-emerald-400 text-xs font-mono select-all block break-all">{getScreenUrl(selected.id)}</code>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleLaunchDisplay(selected.id)}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                  >
                    <i className="ri-tv-2-line" />{isElectron ? '启动大屏窗口' : '在新窗口打开'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(getScreenUrl(selected.id));
                      alert('地址已复制到剪贴板');
                    }}
                    className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm px-4 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap transition-colors"
                  >
                    <i className="ri-file-copy-line" />复制地址
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {isElectron
                    ? '点击「启动大屏窗口」将在副屏或全屏模式下打开该屏幕专属内容'
                    : '复制上方地址，在对应大屏电视的浏览器中打开即可'}
                </p>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-slate-100 h-80 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <i className="ri-tv-2-line text-3xl mb-2 block" />
                <p className="text-sm">选择左侧设备查看详情</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add screen modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">添加屏幕</h3>
              <button type="button" onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <i className="ri-close-line text-lg" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">屏幕名称</label>
                <input type="text" value={newScreen.name}
                  onChange={(e) => setNewScreen({ ...newScreen, name: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">位置</label>
                <input type="text" value={newScreen.location}
                  onChange={(e) => setNewScreen({ ...newScreen, location: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">IP地址</label>
                  <input type="text" value={newScreen.ip}
                    onChange={(e) => setNewScreen({ ...newScreen, ip: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">设备类型</label>
                  <select value={newScreen.type}
                    onChange={(e) => setNewScreen({ ...newScreen, type: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white">
                    <option>LED显示屏</option>
                    <option>LED大屏</option>
                    <option>液晶显示器</option>
                    <option>防水显示屏</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">分辨率</label>
                <input type="text" value={newScreen.resolution}
                  onChange={(e) => setNewScreen({ ...newScreen, resolution: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setShowAddModal(false)}
                className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">取消</button>
              <button type="button" onClick={handleAddScreen}
                className="text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
                <i className="ri-add-line mr-1" />添加
              </button>
            </div>
          </div>
        </div>
      )}

      {showLayoutEditor && selected && (
        <LayoutEditorModal
          screenName={selected.name}
          resolution={selected.resolution}
          initialZones={selected.zones}
          onClose={() => setShowLayoutEditor(false)}
          onSave={(zones) => editScreen(selected.id, { zones })}
        />
      )}
      {showPushModal && selected && (
        <PushContentModal
          screen={selected}
          contents={contents}
          onClose={() => setShowPushModal(false)}
          onPush={(contentId) => editScreen(selected.id, { currentContentId: contentId, lastPush: nowBeijing() })}
        />
      )}
    </AppLayout>
  );
}