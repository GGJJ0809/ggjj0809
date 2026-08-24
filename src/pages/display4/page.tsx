import { useNavigate } from 'react-router-dom';
import DisplayHeader from './components/DisplayHeader';
import EnvironmentMonitor from './components/EnvironmentMonitor';
import SeasonInfo from './components/SeasonInfo';
import DishRanking from './components/DishRanking';
import FinanceSummary from './components/FinanceSummary';
import SupplierInfo from './components/SupplierInfo';
import ShowcaseImages from './components/ShowcaseImages';
import AlarmTicker from '@/pages/display2/components/AlarmTicker';

export default function Display4Page() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-950 overflow-hidden">
      {/* Top header */}
      <div className="h-20 flex-shrink-0">
        <DisplayHeader />
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 flex gap-3 p-3 overflow-hidden">
        {/* Left column: 时令节气 + 环境监控 */}
        <div className="flex-[0.8] min-w-0 flex flex-col gap-3 min-h-0">
          <div className="flex-[1.52] min-h-0">
            <SeasonInfo />
          </div>
          <div className="flex-[3.6] min-h-0">
            <EnvironmentMonitor />
          </div>
        </div>

        {/* Center column: 财务概览 + 供应商信息 + 点餐排行 TOP3 */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
          <div className="flex-[0.6] min-h-0">
            <FinanceSummary />
          </div>
          <div className="flex-[1.15] min-h-0">
            <SupplierInfo />
          </div>
          <div className="flex-[0.64] min-h-0">
            <DishRanking maxItems={3} />
          </div>
        </div>

        {/* Right column: 1×4 竖排菜价公示 */}
        <div className="w-[220px] flex-shrink-0 min-h-0">
          <ShowcaseImages />
        </div>
      </div>

      {/* Bottom alarm ticker */}
      <div className="h-14 flex-shrink-0">
        <AlarmTicker />
      </div>

      {/* Exit button */}
      <button
        type="button"
        onClick={() => navigate('/environment/air-quality')}
        className="fixed bottom-14 right-4 opacity-0 hover:opacity-100 transition-opacity bg-slate-800/80 hover:bg-slate-700 text-white text-3xl px-4 py-2 rounded-full cursor-pointer whitespace-nowrap border border-slate-600"
        style={{ zIndex: 100 }}
      >
        <i className="ri-arrow-left-line mr-1" />退出大屏
      </button>
    </div>
  );
}