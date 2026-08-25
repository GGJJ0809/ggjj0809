import { briefings } from "@/mocks/travel";

const categoryMeta: Record<string, string> = {
  安全: "bg-primary-100 text-primary-700",
  健康: "bg-secondary-100 text-secondary-900",
  文化: "bg-background-200 text-foreground-600",
  签证: "bg-accent-100 text-accent-900",
};

const riskMeta: Record<string, { label: string; className: string }> = {
  critical: { label: "极高", className: "bg-accent-100 text-accent-900" },
  high: { label: "高", className: "bg-primary-100 text-primary-700" },
  medium: { label: "中", className: "bg-secondary-100 text-secondary-900" },
  low: { label: "低", className: "bg-background-200 text-foreground-600" },
};

export default function BriefingPanel() {
  return (
    <div className="rounded-lg border border-background-200 bg-background-50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-heading text-base font-bold">行前简报</h3>
          <p className="text-xs text-foreground-500">差旅安全与健康风险提示</p>
        </div>
        <button className="flex items-center gap-1 whitespace-nowrap rounded-md border border-background-200 px-3 py-1.5 text-xs font-medium text-foreground-700 hover:bg-background-100">
          <i className="ri-add-line" />
          新建简报
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {briefings.map((briefing) => (
          <div
            key={briefing.id}
            className="flex flex-col rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:bg-background-100"
          >
            <div className="flex items-center gap-2">
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${categoryMeta[briefing.category]}`}>
                {briefing.category}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${riskMeta[briefing.risk].className}`}>
                {riskMeta[briefing.risk].label}风险
              </span>
              <span className="ml-auto text-[11px] text-foreground-400">{briefing.date}</span>
            </div>

            <p className="mt-3 text-sm font-semibold leading-snug">{briefing.title}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-foreground-500">
              <i className="ri-map-pin-2-line text-xs" />
              {briefing.destination}
            </p>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-foreground-600">
              {briefing.summary}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {briefing.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-background-100 px-2 py-0.5 text-[10px] text-foreground-500"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}