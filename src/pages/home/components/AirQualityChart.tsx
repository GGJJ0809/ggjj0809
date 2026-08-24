import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/lib/supabase';

interface ChartPoint {
  time: string;
  pm25: number | null;
  pm10: number | null;
  temp: number | null;
  humidity: number | null;
}

const metrics = [
  { key: 'pm25', label: 'PM2.5 (μg/m³)', color: '#ef4444' },
  { key: 'pm10', label: 'PM10 (μg/m³)', color: '#f59e0b' },
  { key: 'temp', label: '温度 (℃)', color: '#10b981' },
];

export default function AirQualityChart() {
  const [active, setActive] = useState<string[]>(['pm25', 'pm10', 'temp']);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const toggle = (key: string) => {
    setActive((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  useEffect(() => {
    let isFirstLoad = true;
    const fetchData = async () => {
      if (isFirstLoad) setLoading(true);
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

      const { data } = await supabase
        .from('environment_readings')
        .select('*')
        .gte('recorded_at', startOfDay)
        .order('recorded_at', { ascending: true })
        .limit(500);

      if (!data || data.length === 0) {
        setChartData([]);
        if (isFirstLoad) {
          setLoading(false);
          isFirstLoad = false;
        }
        return;
      }

      // Group by hour, take the latest reading in each hour
      const hourMap = new Map<string, ChartPoint>();
      (data as any[]).forEach((r) => {
        const d = new Date(r.recorded_at);
        const hourKey = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        // For each time slot, keep the latest reading
        const existing = hourMap.get(hourKey);
        if (!existing || new Date(r.recorded_at) > new Date(existing.time)) {
          hourMap.set(hourKey, {
            time: hourKey,
            pm25: r.pm25 ?? null,
            pm10: r.pm10 ?? null,
            temp: r.temp ?? null,
            humidity: r.humidity ?? null,
          });
        }
      });

      // If too many points, sample every Nth point
      let points = Array.from(hourMap.values());
      if (points.length > 30) {
        const step = Math.ceil(points.length / 30);
        points = points.filter((_, i) => i % step === 0);
      }

      setChartData(points);
      if (isFirstLoad) {
        setLoading(false);
        isFirstLoad = false;
      }
    };

    fetchData();
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">空气质量实时趋势</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {loading ? '加载中...' : chartData.length > 0 ? `今日数据 · ${chartData.length} 条记录` : '今日暂无数据'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {metrics.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => toggle(m.key)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all cursor-pointer whitespace-nowrap ${
                active.includes(m.key)
                  ? 'border-transparent text-white'
                  : 'border-slate-200 text-slate-400 bg-white'
              }`}
              style={active.includes(m.key) ? { backgroundColor: m.color, borderColor: m.color } : {}}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: active.includes(m.key) ? 'white' : m.color }}
              />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[220px] text-slate-400">
          <i className="ri-bar-chart-line text-3xl mb-2" />
          <p className="text-sm">暂无今日趋势数据</p>
          <p className="text-xs mt-1">传感器数据开始采集后将自动显示</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
            />
            <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 12 }} />
            {metrics.map((m) =>
              active.includes(m.key) ? (
                <Line
                  key={m.key}
                  type="monotone"
                  dataKey={m.key}
                  stroke={m.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  name={m.label}
                  connectNulls
                />
              ) : null
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}