import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { todayBeijing } from '@/lib/dateUtils';
import DisplayHeader from './components/DisplayHeader';
import CateringStats from './components/CateringStats';
import SeasonInfo from './components/SeasonInfo';
import AlarmTicker from './components/AlarmTicker';

interface BottomStat {
  label: string;
  value: string;
  unit: string;
  icon: string;
  color: string;
}

export default function Display2Page() {
  const navigate = useNavigate();
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [bottomStats, setBottomStats] = useState<BottomStat[]>([
    { label: '今日菜品', value: '—', unit: '种', icon: 'ri-bowl-line', color: 'text-emerald-400' },
    { label: '用餐人数', value: '—', unit: '人', icon: 'ri-user-line', color: 'text-sky-400' },
    { label: '平均重量', value: '—', unit: 'g/次', icon: 'ri-scales-line', color: 'text-amber-400' },
    { label: '验收批次', value: '—', unit: '批', icon: 'ri-clipboard-line', color: 'text-purple-400' },
    { label: '留样记录', value: '—', unit: '份', icon: 'ri-flask-line', color: 'text-rose-400' },
    { label: 'AI识别', value: '—', unit: '次', icon: 'ri-robot-2-line', color: 'text-cyan-400' },
  ]);

  const fetchBottomStats = async () => {
    try {
      const today = todayBeijing();

      const { data: dishCount } = await supabase
        .from('tray_stations')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      const { data: pickupCount } = await supabase
        .from('tray_pickup_logs')
        .select('id', { count: 'exact', head: true })
        .gte('pickup_time', `${today}T00:00:00`);

      const { data: avgWeight } = await supabase
        .from('tray_pickup_logs')
        .select('pickup_weight')
        .gte('pickup_time', `${today}T00:00:00`);

      const { data: acceptCount } = await supabase
        .from('acceptance_records')
        .select('id', { count: 'exact', head: true })
        .gte('check_date', today);

      const { data: sampleCount } = await supabase
        .from('sample_records')
        .select('id', { count: 'exact', head: true })
        .gte('sample_date', today);

      const { data: aiCount } = await supabase
        .from('ai_recognition_events')
        .select('id', { count: 'exact', head: true })
        .gte('occurred_at', `${today}T00:00:00`);

      const avg = avgWeight && avgWeight.length > 0
        ? Math.round(avgWeight.reduce((s, r) => s + (Number(r.pickup_weight) || 0), 0) / avgWeight.length)
        : 0;

      setBottomStats([
        { label: '今日菜品', value: String(dishCount || 0), unit: '种', icon: 'ri-bowl-line', color: 'text-emerald-400' },
        { label: '用餐人数', value: String(pickupCount || 0), unit: '人', icon: 'ri-user-line', color: 'text-sky-400' },
        { label: '平均重量', value: String(avg), unit: 'g/次', icon: 'ri-scales-line', color: 'text-amber-400' },
        { label: '验收批次', value: String(acceptCount || 0), unit: '批', icon: 'ri-clipboard-line', color: 'text-purple-400' },
        { label: '留样记录', value: String(sampleCount || 0), unit: '份', icon: 'ri-flask-line', color: 'text-rose-400' },
        { label: 'AI识别', value: String(aiCount || 0), unit: '次', icon: 'ri-robot-2-line', color: 'text-cyan-400' },
      ]);
    } catch (e) {
      console.error('[Display2] bottom stats fetch error:', e);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setLastUpdate(new Date());
    }, 30000);
    fetchBottomStats();
    const statTimer = setInterval(fetchBottomStats, 30000);
    return () => {
      clearInterval(timer);
      clearInterval(statTimer);
    };
  }, []);

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-950 overflow-hidden">
      {/* Top header: 56px */}
      <div className="h-14 flex-shrink-0">
        <DisplayHeader onlineCount={0} warningCount={0} dangerCount={0} />
      </div>

      {/* Status bar */}
      <div className="h-9 flex-shrink-0 flex items-center gap-4 px-6 bg-slate-900 border-b border-slate-800">
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>最后更新 {lastUpdate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
      </div>

      {/* Main content: two columns — 中间餐饮统计 + 右侧时令信息 */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Center: 餐饮统计表 */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden p-4">
          <CateringStats />
        </div>

        {/* Right: 时令节气 + 饮食禁忌 + 剩余材料 */}
        <div className="w-[42%] flex-shrink-0 flex flex-col overflow-hidden border-l border-slate-800 p-4">
          <SeasonInfo />
        </div>
      </div>

      {/* Bottom stats bar */}
      <div className="h-12 flex-shrink-0 flex items-center gap-1 px-4 bg-slate-900 border-t border-slate-800">
        {bottomStats.map((s) => (
          <div key={s.label} className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/50 border border-slate-800">
            <i className={`${s.icon} ${s.color} text-xs`} />
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-bold font-mono text-slate-200">{s.value}</span>
              <span className="text-[10px] text-slate-500">{s.unit}</span>
            </div>
            <span className="text-[10px] text-slate-600">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Bottom alarm ticker: 40px */}
      <div className="h-10 flex-shrink-0">
        <AlarmTicker />
      </div>

      {/* Exit button */}
      <button
        type="button"
        onClick={() => navigate('/environment/air-quality')}
        className="fixed bottom-14 right-4 opacity-0 hover:opacity-100 transition-opacity bg-slate-800/80 hover:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap border border-slate-600"
        style={{ zIndex: 100 }}
      >
        <i className="ri-arrow-left-line mr-1" />退出大屏
      </button>
    </div>
  );
}