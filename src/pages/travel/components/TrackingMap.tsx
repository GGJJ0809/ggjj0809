import { travelers, type Traveler } from "@/mocks/travel";

interface TrackingMapProps {
  selectedId: number;
  onSelect: (id: number) => void;
}

const statusMeta: Record<string, { dot: string; label: string; ring: string }> = {
  safe: { dot: "bg-secondary-500", label: "安全", ring: "ring-secondary-500/30" },
  transit: { dot: "bg-primary-500", label: "在途", ring: "ring-primary-500/30" },
  warning: { dot: "bg-accent-500", label: "预警", ring: "ring-accent-500/30" },
  lost: { dot: "bg-accent-500", label: "失联", ring: "ring-accent-500/40" },
};

const riskMeta: Record<string, { label: string; className: string }> = {
  critical: { label: "极高风险", className: "bg-accent-100 text-accent-900" },
  high: { label: "高风险", className: "bg-primary-100 text-primary-700" },
  medium: { label: "中风险", className: "bg-secondary-100 text-secondary-900" },
  low: { label: "低风险", className: "bg-background-200 text-foreground-600" },
};

function geoToPercent(lat: number, lng: number) {
  const left = ((lng + 180) / 360) * 100;
  const top = ((75 - lat) / 135) * 100;
  return { left: `${left}%`, top: `${top}%` };
}

export default function TrackingMap({ selectedId, onSelect }: TrackingMapProps) {
  const selected = travelers.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col rounded-lg border border-background-200 bg-background-50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-heading text-base font-bold">在途人员定位地图</h3>
          <p className="text-xs text-foreground-500">实时定位 · 点击标记或右侧列表查看详情</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-foreground-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-secondary-500" /> 安全
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-primary-500" /> 在途
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-accent-500" /> 预警
          </span>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden rounded-lg border border-background-200 bg-background-100">
        <img
          src="https://readdy.ai/api/search-image?query=Minimalist%20flat%20design%20world%20map%20illustration%20with%20all%20continents%20in%20soft%20warm%20sage%20green%20and%20subtle%20lighter%20coastline%20stroke%20on%20a%20clean%20off-white%20ivory%20background%20no%20country%20borders%20or%20labels%20evenly%20distributed%20continents%20filling%20the%20frame%20gentle%20flat%20vector%20style%20soft%20even%20lighting%20high%20resolution%20clean%20modern%20cartography%20for%20a%20dashboard%20background&width=1600&height=800&seq=travel-track-map-v2&orientation=landscape"
          alt="在途人员定位世界地图"
          title="在途人员定位地图"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className="absolute right-3 top-3 rounded-full bg-background-50/80 px-2.5 py-1 text-[10px] font-medium text-foreground-500 backdrop-blur-sm">
          示意地图
        </span>

        {travelers.map((traveler) => {
          const pos = geoToPercent(traveler.lat, traveler.lng);
          const meta = statusMeta[traveler.status];
          const isSelected = traveler.id === selectedId;
          const isAlert = traveler.status === "lost" || traveler.status === "warning";
          return (
            <button
              key={traveler.id}
              onClick={() => onSelect(traveler.id)}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ top: pos.top, left: pos.left }}
              title={traveler.name}
            >
              {isAlert && (
                <span className={`absolute h-7 w-7 animate-ping rounded-full ${meta.dot} opacity-30`} />
              )}
              <span
                className={`relative flex items-center justify-center rounded-full ring-2 transition-transform ${
                  isSelected
                    ? "h-6 w-6 ring-background-50 scale-125"
                    : "h-3.5 w-3.5 ring-background-50/70"
                } ${meta.dot}`}
              >
                {isSelected && (
                  <i className="ri-user-3-line text-[11px] text-background-50" />
                )}
              </span>
            </button>
          );
        })}

        {/* 选中人员信息卡 */}
        {selected ? (
          <div className="absolute bottom-3 left-3 w-64 rounded-lg border border-background-200 bg-background-50/95 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${statusMeta[selected.status].dot}`} />
              <p className="text-sm font-semibold">{selected.name}</p>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${riskMeta[selected.risk].className}`}>
                {riskMeta[selected.risk].label}
              </span>
            </div>
            <p className="mt-1 text-xs text-foreground-600">{selected.destination}</p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-foreground-500">
              <i className="ri-time-line" />
              最近更新 {selected.lastUpdate}
            </p>
          </div>
        ) : (
          <div className="absolute bottom-3 left-3 rounded-md bg-foreground-950/80 px-3 py-1.5 text-[11px] text-background-50">
            数据更新于 1 分钟前 · 覆盖 {travelers.length} 名在途人员
          </div>
        )}
      </div>
    </div>
  );
}