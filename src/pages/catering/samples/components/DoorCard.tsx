import type { DoorInfo } from '@/pages/catering/samples/hooks/useKeepDashboard';

interface DoorCardProps {
  door: DoorInfo;
  onClick: () => void;
}

function fmt(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function DoorCard({ door, onClick }: DoorCardProps) {
  const isEmpty = door.state === 0;
  const isExpired = door.isExpired;
  const dishCount = door.dishCount ?? (door.dishes?.length || 0);

  // 统计：留样数/今日菜单数
  const sampledCount = dishCount; // 该柜实际留样数
  const menuCount = door.amount ?? 0; // 今日该餐次菜单总数

  // 起始时间 = 该柜最早的留样时间
  const earliestSample = door.dishes && door.dishes.length > 0
    ? door.dishes.reduce((a, b) => {
        const ta = new Date(a.sampled_at).getTime();
        const tb = new Date(b.sampled_at).getTime();
        return ta < tb ? a : b;
      })
    : null;

  // 过期时间 = 该柜最晚的过期时间（以最新留样为准）
  const latestSample = door.dishes && door.dishes.length > 0
    ? door.dishes.reduce((a, b) => {
        const ta = new Date(a.sampled_at).getTime();
        const tb = new Date(b.sampled_at).getTime();
        return ta > tb ? a : b;
      })
    : null;

  let borderColor = 'border-background-200';
  let bgColor = 'bg-background-100';
  let numColor = 'text-foreground-400';

  if (!isEmpty && isExpired) {
    borderColor = 'border-red-300';
    bgColor = 'bg-red-50';
    numColor = 'text-red-500';
  } else if (!isEmpty) {
    borderColor = 'border-emerald-300';
    bgColor = 'bg-emerald-50';
    numColor = 'text-emerald-600';
  }

  const keepPercent = !isEmpty && door.hoursKept > 0
    ? Math.min(100, Math.round((door.hoursKept / 48) * 100))
    : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-1.5 p-3 rounded-xl border-2 transition-all cursor-pointer text-left w-full ${borderColor} ${bgColor} hover:shadow-sm`}
    >
      {/* Header: door number + meal */}
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${numColor}`}>{door.num}号</span>
        {!isEmpty && (
          <span className="text-[10px] text-foreground-500">{door.meal || ''}</span>
        )}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-2 gap-1">
          <span className="text-xs text-foreground-300">空闲</span>
          {menuCount > 0 && (
            <span className="text-[9px] text-foreground-300">0/{menuCount}</span>
          )}
        </div>
      ) : (
        <>
          {/* 留样数/菜单数 */}
          <div className="flex items-center gap-1">
            <span className={`text-base font-bold ${isExpired ? 'text-red-500' : 'text-emerald-600'}`}>{sampledCount}</span>
            {menuCount > 0 && (
              <span className="text-xs text-foreground-400">/{menuCount}</span>
            )}
            <span className="text-[9px] text-foreground-400 ml-0.5">道菜品</span>
          </div>

          {/* 起始时间（所有菜品共用最早时间） */}
          {earliestSample && (
            <div className="text-[9px] text-foreground-500 leading-tight">
              <span className="text-foreground-400">开始: </span>{fmt(earliestSample.sampled_at)}
            </div>
          )}

          {/* Duration bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-foreground-500">时长:</span>
              <span className={`text-[10px] font-medium ${isExpired ? 'text-red-500' : 'text-foreground-600'}`}>
                {door.hoursKept}/<span className="text-foreground-400">48H</span>
                {isExpired && <span className="ml-1 text-red-500">过期</span>}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-foreground-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isExpired ? 'bg-red-400' : keepPercent > 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                style={{ width: `${Math.min(keepPercent, 100)}%` }}
              />
            </div>
          </div>

          {/* 过期时间 */}
          {latestSample && latestSample.expire_at && (
            <div className={`text-[9px] leading-tight ${isExpired ? 'text-red-400' : 'text-foreground-400'}`}>
              <span>截止: </span>{fmt(latestSample.expire_at)}
            </div>
          )}

          {/* 容量进度条 - 留样数/菜单数 */}
          {menuCount > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-foreground-500">容量:</span>
                <span className="text-[10px] text-foreground-600">{sampledCount}/{menuCount}</span>
              </div>
              <div className="h-1.5 rounded-full bg-foreground-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all"
                  style={{ width: `${Math.min(100, Math.round((sampledCount / menuCount) * 100))}%` }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </button>
  );
}