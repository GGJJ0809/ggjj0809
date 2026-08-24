import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import DisplayHeader from './components/DisplayHeader';
import CameraGrid from './components/CameraGrid';
import MenuPanel from './components/MenuPanel';
import Ticker from './components/Ticker';
import { useDisplayConfig } from '@/hooks/useDisplayConfig';

function getScreenIdFromUrl(): string {
  const search = window.location.search;
  const match = search.match(/[?\u0026]screenId=([^\u0026]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  return '';
}

function DisplayContent({ screenId }: { screenId: string }) {
  const navigate = useNavigate();
  const { config, loading } = useDisplayConfig(true, 'default');
  const hasLoaded = useRef(false);

  // 标记首次加载完成
  useEffect(() => {
    if (!loading) {
      hasLoaded.current = true;
    }
  }, [loading]);

  // Electron 大屏模式下：ESC 发送 IPC 退出全屏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const api = (window as any).electronAPI;
        if (api?.isDisplayMode) {
          console.log('[Display] ESC pressed in display mode');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 首次加载显示 loading，后续静默刷新不闪烁
  if (loading && !hasLoaded.current) {
    return (
      <div className="flex flex-col w-screen h-screen bg-black overflow-hidden items-center justify-center">
        <i className="ri-loader-4-line animate-spin text-emerald-400 text-7xl" />
        <p className="text-slate-500 text-2xl mt-3">同步大屏数据中...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-screen h-screen bg-black overflow-hidden">
      {/* Top header bar */}
      <DisplayHeader screenId={screenId} />

      {/* Main content: Camera grid + Menu panel — each 50% width */}
      <div className="flex flex-1 min-h-0">
        {/* Left: 9-grid cameras (50% width) */}
        <div className="w-1/2 flex-shrink-0">
          <CameraGrid />
        </div>

        {/* Right: Menu panel (50% width) */}
        <div className="w-1/2 flex-shrink-0">
          <MenuPanel config={config} />
        </div>
      </div>

      {/* Bottom: Scrolling ticker */}
      <Ticker config={config} />

      {/* Exit full screen button (hidden unless hover) */}
      <button
        type="button"
        onClick={() => navigate('/information/screens')}
        className="fixed bottom-12 right-4 opacity-0 hover:opacity-100 transition-opacity bg-slate-800/80 hover:bg-slate-700 text-white text-xl px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap border border-slate-600"
        style={{ zIndex: 100 }}
      >
        <i className="ri-arrow-left-line mr-1" />退出大屏
      </button>
    </div>
  );
}

export default function DisplayPage() {
  const params = useParams();
  const screenId = params.screenId || getScreenIdFromUrl() || 'default';

  return <DisplayContent screenId={screenId} />;
}