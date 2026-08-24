import type { TempPoint } from '@/pages/catering/samples/hooks/useKeepDashboard';

interface TempChartProps {
  history: TempPoint[];
  latest: { temperature: number | null; humidity: number | null; recordedAt: string } | null;
}

export default function TempChart({ history, latest }: TempChartProps) {
  const temps = history.map((h) => h.temperature ?? 0);
  const maxTemp = Math.max(12, ...temps);
  const minTemp = Math.min(0, ...temps);
  const range = maxTemp - minTemp || 1;

  // Grid lines
  const gridLines = [0, 4, 8, 12];

  return (
    <div className="bg-background-50 rounded-xl border border-background-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
          <span className="text-sm font-medium text-foreground-800">温度监测</span>
        </div>
        <span className="text-xs text-foreground-500">单位:摄氏度</span>
      </div>

      {/* Chart */}
      <div className="relative h-24">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-foreground-400 w-5">
          {gridLines.slice().reverse().map((g) => (
            <span key={g}>{g}</span>
          ))}
        </div>
        {/* Chart area */}
        <div className="ml-7 relative h-full">
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between">
            {gridLines.map((g) => (
              <div key={g} className="border-t border-background-200 border-dashed w-full" />
            ))}
          </div>
          {/* Bars */}
          {history.length > 0 ? (
            <div className="absolute inset-0 flex items-end gap-px">
              {history.map((point, idx) => {
                const val = point.temperature ?? 0;
                const heightPct = Math.max(2, ((val - minTemp) / range) * 100);
                const isAlarm = val > 8;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div
                      className={`w-full rounded-sm transition-all ${isAlarm ? 'bg-red-400' : 'bg-emerald-400'}`}
                      style={{ height: `${heightPct}%` }}
                    />
                    <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
                      <div className="bg-foreground-800 text-background-50 text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap">
                        {val.toFixed(1)}°C
                        <br />
                        <span className="text-foreground-400">{point.recordedAt.slice(11, 16)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs text-foreground-400">暂无温度数据</span>
            </div>
          )}
          {/* Time labels below */}
          {history.length > 0 && (
            <div className="absolute -bottom-5 inset-x-0 flex justify-between text-[10px] text-foreground-400">
              {[0, Math.floor(history.length / 3), Math.floor((history.length * 2) / 3), history.length - 1].map((idx) => (
                history[idx] ? (
                  <span key={idx}>{history[idx].recordedAt.slice(11, 16)}</span>
                ) : null
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}