import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface SensorStatusItem {
  zone: string;
  pm25: number | null;
  temp: number | null;
  humidity: number | null;
  co2: number | null;
  status: 'normal' | 'warning' | 'offline';
  lastUpdate: string;
}

const thresholds = { pm25: 50, pm10: 75, temp: 30, humidity: 85, co2: 1000 };

function calcStatus(item: Partial<SensorStatusItem>): SensorStatusItem['status'] {
  if (
    (item.pm25 ?? 0) > thresholds.pm25 * 1.5 ||
    (item.co2 ?? 0) > thresholds.co2 * 1.3
  ) {
    return 'warning';
  }
  if (
    (item.pm25 ?? 0) > thresholds.pm25 ||
    (item.temp ?? 0) > thresholds.temp ||
    (item.humidity ?? 0) > thresholds.humidity ||
    (item.co2 ?? 0) > thresholds.co2
  ) {
    return 'warning';
  }
  return 'normal';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

export default function SensorStatus() {
  const [sensors, setSensors] = useState<SensorStatusItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isFirstLoad = true;
    const fetchLatest = async () => {
      const { data } = await supabase
        .from('environment_readings')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(200);

      if (!data) {
        if (isFirstLoad) {
          setLoading(false);
          isFirstLoad = false;
        }
        return;
      }

      const zoneMap = new Map<string, SensorStatusItem>();
      (data as any[]).forEach((r) => {
        if (!zoneMap.has(r.zone)) {
          const item: SensorStatusItem = {
            zone: r.zone,
            pm25: r.pm25 ?? null,
            temp: r.temp ?? null,
            humidity: r.humidity ?? null,
            co2: r.co2 ?? null,
            status: 'normal',
            lastUpdate: r.recorded_at,
          };
          item.status = calcStatus(item);
          // If data is older than 5 minutes, mark as offline
          const diffMin = (Date.now() - new Date(r.recorded_at).getTime()) / 60000;
          if (diffMin > 5) item.status = 'offline';
          zoneMap.set(r.zone, item);
        }
      });

      setSensors(Array.from(zoneMap.values()));
      if (isFirstLoad) {
        setLoading(false);
        isFirstLoad = false;
      }
    };

    fetchLatest();
    const timer = setInterval(fetchLatest, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">传感器实时状态</h3>
          <p className="text-xs text-slate-400 mt-0.5">关键区域环境数据</p>
        </div>
        <a
          href="/environment/sensors"
          className="text-xs text-emerald-600 hover:text-emerald-700 cursor-pointer whitespace-nowrap"
        >
          全部设备 <i className="ri-arrow-right-line" />
        </a>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400">
          <i className="ri-loader-4-line animate-spin mr-2" />
          <span className="text-xs">加载中...</span>
        </div>
      ) : sensors.length === 0 ? (
        <div className="text-center py-6 text-slate-400">
          <i className="ri-sensor-line text-2xl mb-2 block" />
          <p className="text-xs">暂无传感器数据</p>
          <p className="text-xs mt-1">请先配置传感器并开始采集</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sensors.map((sensor) => {
            const cfg =
              sensor.status === 'normal'
                ? { label: '正常', dot: 'bg-emerald-400', text: 'text-emerald-600' }
                : sensor.status === 'warning'
                  ? { label: '预警', dot: 'bg-amber-400', text: 'text-amber-600' }
                  : { label: '离线', dot: 'bg-slate-300', text: 'text-slate-400' };
            return (
              <div
                key={sensor.zone}
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{sensor.zone}</p>
                  <p className="text-xs text-slate-400">{timeAgo(sensor.lastUpdate)}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {sensor.pm25 !== null && (
                    <span>
                      <span className="text-slate-400">PM2.5</span>{' '}
                      <span
                        className={`font-semibold ${sensor.pm25 > 50 ? 'text-red-500' : 'text-slate-700'}`}
                      >
                        {sensor.pm25}
                      </span>
                    </span>
                  )}
                  {sensor.temp !== null && (
                    <span>
                      <span className="text-slate-400">温度</span>{' '}
                      <span className="font-semibold text-slate-700">{sensor.temp}℃</span>
                    </span>
                  )}
                  {sensor.humidity !== null && (
                    <span>
                      <span className="text-slate-400">湿度</span>{' '}
                      <span className="font-semibold text-slate-700">{sensor.humidity}%</span>
                    </span>
                  )}
                </div>
                <span className={`text-xs font-medium ${cfg.text} flex-shrink-0`}>{cfg.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}