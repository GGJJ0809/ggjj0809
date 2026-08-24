import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/lib/supabase';

interface ChartReading {
  time: string;
  pm25: number;
  pm10: number;
  temp: number;
  humidity: number;
  co2: number;
}

interface Props {
  zone: string;
}

export default function MetricChart({ zone }: Props) {
  const [data, setData] = useState<ChartReading[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const { data: rawData } = await supabase
        .from('environment_readings')
        .select('*')
        .eq('zone', zone)
        .gte('recorded_at', startOfDay)
        .order('recorded_at', { ascending: true })
        .limit(100);

      const chartData = (rawData ?? []).map((r: any) => ({
        time: new Date(r.recorded_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        pm25: r.pm25 ?? 0,
        pm10: r.pm10 ?? 0,
        temp: r.temp ?? 0,
        humidity: r.humidity ?? 0,
        co2: r.co2 ?? 0,
      }));
      setData(chartData);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!zone) return;
    setLoading(true);
    fetchData();
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, [zone]);

  const metrics = [
    { key: 'temp', label: '温度', color: '#10b981', unit: '℃' },
    { key: 'humidity', label: '湿度', color: '#06b6d4', unit: '%' },
    { key: 'pm25', label: 'PM2.5', color: '#ef4444', unit: 'μg/m³' },
    { key: 'pm10', label: 'PM10', color: '#f59e0b', unit: 'μg/m³' },
    { key: 'co2', label: 'CO₂', color: '#8b5cf6', unit: 'ppm' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <i className="ri-loader-4-line animate-spin text-lg mr-2" />
        <span className="text-xs">加载趋势数据...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-600">
        <i className="ri-bar-chart-line text-2xl mb-2" />
        <span className="text-xs">暂无今日趋势数据</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 h-full">
      {metrics.map((m) => (
        <div key={m.key} className="bg-slate-900/50 rounded-lg border border-slate-800 p-2 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-1 flex-shrink-0">
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
              {m.label}
            </span>
            <span className="text-[10px] text-slate-500">{m.unit}</span>
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fontSize: 8, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 8, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    fontSize: 10,
                    color: '#e2e8f0',
                    padding: '4px 8px',
                  }}
                  labelStyle={{ color: '#94a3b8', fontSize: 10 }}
                />
                <Line
                  type="monotone"
                  dataKey={m.key}
                  stroke={m.color}
                  strokeWidth={1.2}
                  dot={false}
                  activeDot={{ r: 2, fill: m.color }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}