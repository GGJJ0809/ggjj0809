import { riskRegions } from "@/mocks/admin";

const hotSpots = [
  { top: "40%", left: "58%", level: "P0" },
  { top: "46%", left: "52%", level: "P0" },
  { top: "34%", left: "26%", level: "P1" },
  { top: "56%", left: "72%", level: "P1" },
  { top: "30%", left: "62%", level: "P1" },
  { top: "42%", left: "48%", level: "P2" },
];

export default function RiskMap() {
  return (
    <div className="flex h-full flex-col rounded-lg border border-background-200 bg-background-50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-heading text-base font-bold">全球风险热力图</h3>
          <p className="text-xs text-foreground-500">实时事件标注 · 地区风险等级</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-foreground-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-accent-500" /> 极高
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-primary-500" /> 高
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-secondary-500" /> 中
          </span>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden rounded-lg border border-background-200 bg-background-100">
        <img
          src="https://readdy.ai/api/search-image?query=Minimalist%20flat%20world%20map%20illustration%20with%20muted%20warm%20gray%20and%20sage%20green%20continents%20clean%20light%20neutral%20beige%20background%20soft%20subtle%20continent%20shapes%20evenly%20spread%20across%20the%20frame%20no%20text%20labels%20no%20borders%20modern%20flat%20vector%20cartography%20style%20soft%20uniform%20lighting%20high%20detail%20suitable%20as%20a%20data%20dashboard%20heatmap%20background&width=1600&height=800&seq=risk-heatmap-v2&orientation=landscape"
          alt="全球风险热力世界地图"
          title="全球风险地图"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className="absolute right-3 top-3 rounded-full bg-background-50/80 px-2.5 py-1 text-[10px] font-medium text-foreground-500 backdrop-blur-sm">
          示意地图
        </span>
        {hotSpots.map((spot, i) => (
          <div
            key={i}
            className="pointer-events-none absolute flex items-center justify-center"
            style={{ top: spot.top, left: spot.left }}
          >
            <span className="absolute h-6 w-6 animate-ping rounded-full bg-accent-500/40" />
            <span
              className={`relative flex h-3 w-3 items-center justify-center rounded-full ring-2 ring-background-50 ${
                spot.level === "P0"
                  ? "bg-accent-500"
                  : spot.level === "P1"
                    ? "bg-primary-500"
                    : "bg-secondary-500"
              }`}
            />
          </div>
        ))}
        <div className="absolute bottom-3 left-3 rounded-md bg-foreground-950/80 px-3 py-1.5 text-[11px] text-background-50">
          数据更新于 2 分钟前 · 覆盖 80+ 国家
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {riskRegions.slice(0, 4).map((region) => (
          <div key={region.id} className="flex items-center gap-3">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                region.color === "accent"
                  ? "bg-accent-500"
                  : region.color === "primary"
                    ? "bg-primary-500"
                    : "bg-secondary-500"
              }`}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground-700">{region.name}</span>
            <span className="text-xs font-semibold text-foreground-500">{region.events} 起</span>
          </div>
        ))}
      </div>
    </div>
  );
}