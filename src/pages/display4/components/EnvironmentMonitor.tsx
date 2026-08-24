import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useEnvironment } from '@/pages/environment/air-quality/hooks/useEnvironment';

interface ZoneData {
  name: string;
  pm25: number;
  pm10: number;
  temp: number;
  humidity: number;
  co2: number;
  status: 'good' | 'warning' | 'danger';
}

const ZONE_ORDER = [
  '面点加工间', '冷菜加工间', '操作间', '蔬菜加工间', '肉类加工间',
  '主食库房', '管理办公室', '后厨区', '就餐大厅', '备餐间', '冷库区', '验收区',
];

function calcStatus(zone: ZoneData): ZoneData['status'] {
  if (zone.pm25 > 75 || zone.co2 > 1000 || zone.temp > 35) return 'danger';
  if (zone.pm25 > 35 || zone.co2 > 800 || zone.temp > 30) return 'warning';
  return 'good';
}

function getStatusConfig(status: ZoneData['status']) {
  switch (status) {
    case 'good':
      return { dot: 'bg-emerald-400', text: 'text-emerald-400', label: '优良', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
    case 'warning':
      return { dot: 'bg-amber-400', text: 'text-amber-400', label: '预警', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
    case 'danger':
      return { dot: 'bg-red-400', text: 'text-red-400', label: '超标', bg: 'bg-red-500/10', border: 'border-red-500/20' };
  }
}

export default function EnvironmentMonitor() {
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { getZoneDisplayName } = useEnvironment();

  const fetchData = async () => {
    setLoading(true);
    try {
      // ═══ 与空气质量监测页面使用完全相同的数据来源：environment_readings ═══
      const { data } = await supabase
        .from('environment_readings')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(500);

      if (data && data.length > 0) {
        // 按 zone 分组
        const zoneMap = new Map<string, any[]>();
        (data as any[]).forEach((r) => {
          if (!zoneMap.has(r.zone)) zoneMap.set(r.zone, []);
          zoneMap.get(r.zone)!.push(r);
        });

        const summaries: ZoneData[] = Array.from(zoneMap.entries()).map(([zoneName, readings]) => {
          const zone: ZoneData = {
            name: zoneName,
            pm25: 0, pm10: 0, temp: 0, humidity: 0, co2: 0,
            status: 'good',
          };

          // 取最新非空值 — 与空气质量监测逻辑一致
          for (const field of ['pm25', 'pm10', 'temp', 'humidity', 'co2'] as const) {
            for (const r of readings) {
              const val = r[field];
              if (val !== null && val !== undefined) {
                zone[field] = val;
                break;
              }
            }
          }

          zone.status = calcStatus(zone);
          return zone;
        });

        // 按照空气质量监测页面的区域顺序排序
        summaries.sort((a, b) => {
          const ai = ZONE_ORDER.indexOf(getZoneDisplayName(a.name));
          const bi = ZONE_ORDER.indexOf(getZoneDisplayName(b.name));
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });

        setZones(summaries);
      } else {
        setZones([]);
      }
    } catch (e) {
      console.error('[EnvironmentMonitor] fetch error:', e);
      setZones([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto scroll playback
  useEffect(() => {
    if (loading || zones.length <= 2) return;
    const el = scrollRef.current;
    if (!el) return;

    const children = el.children;
    let idx = 0;

    const timer = setInterval(() => {
      idx += 1;
      if (idx >= children.length) {
        idx = 0;
        el.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        children[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 3500);

    return () => clearInterval(timer);
  }, [loading, zones.length]);

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-sky-500/10">
          <i className="ri-temp-hot-line text-sky-400 text-3xl" />
        </div>
        <span className="text-4xl font-semibold text-slate-200">环境监控</span>
        <span className="text-3xl text-slate-500 ml-auto">{zones.length} 个区域</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar space-y-2.5">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-slate-500">
            <i className="ri-loader-4-line animate-spin text-5xl mr-2" />
            <span className="text-4xl">加载中...</span>
          </div>
        ) : zones.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500 gap-2">
            <i className="ri-database-2-line text-5xl" />
            <span className="text-4xl">暂无环境监测数据</span>
            <span className="text-4xl">请确保传感器已配置并推送数据</span>
          </div>
        ) : (
          zones.map((z) => {
            const cfg = getStatusConfig(z.status);
            return (
              <div key={z.name} className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3`}>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                    <span className="text-4xl font-medium text-slate-200">{getZoneDisplayName(z.name)}</span>
                  </div>
                  <span className={`text-3xl font-medium ${cfg.text}`}>{cfg.label}</span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="text-center">
                    <p className="text-3xl text-slate-500">温度</p>
                    <p className="text-4xl font-mono font-semibold text-slate-200">{z.temp}℃</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl text-slate-500">湿度</p>
                    <p className="text-4xl font-mono font-semibold text-slate-200">{z.humidity}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl text-slate-500">CO₂</p>
                    <p className="text-4xl font-mono font-semibold text-slate-200">{z.co2}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl text-slate-500">PM2.5</p>
                    <p className="text-4xl font-mono font-semibold text-slate-200">{z.pm25}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl text-slate-500">PM10</p>
                    <p className="text-4xl font-mono font-semibold text-slate-200">{z.pm10}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl text-slate-500">综合</p>
                    <p className={`text-3xl font-medium ${cfg.text}`}>{cfg.label}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}