import { alertFeed } from "@/mocks/admin";

const levelStyle: Record<string, string> = {
  P0: "bg-accent-100 text-accent-900",
  P1: "bg-primary-100 text-primary-700",
  P2: "bg-secondary-100 text-secondary-900",
  P3: "bg-background-200 text-foreground-600",
};

export default function AlertFeed() {
  return (
    <div className="flex h-full flex-col rounded-lg border border-background-200 bg-background-50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-heading text-base font-bold">实时告警</h3>
          <p className="text-xs text-foreground-500">P0-P3 分级 · 实时滚动推送</p>
        </div>
        <button className="flex h-8 w-8 items-center justify-center rounded-md text-foreground-500 hover:bg-background-100">
          <i className="ri-more-2-fill text-lg" />
        </button>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
        {alertFeed.map((alert) => (
          <div
            key={alert.id}
            className="rounded-lg border border-background-200 p-3 transition-colors hover:bg-background-100"
          >
            <div className="flex items-center gap-2">
              <span
                className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${levelStyle[alert.level]}`}
              >
                {alert.level}
              </span>
              <span className="text-[11px] text-foreground-400">{alert.type}</span>
              <span className="ml-auto text-[11px] whitespace-nowrap text-foreground-400">
                {alert.time}
              </span>
            </div>
            <p className="mt-1.5 text-sm font-medium leading-snug">{alert.title}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-foreground-500">
              <i className="ri-map-pin-2-line text-xs" />
              {alert.location}
            </p>
          </div>
        ))}
      </div>

      <button className="mt-3 w-full whitespace-nowrap rounded-md border border-background-200 py-2 text-sm font-medium text-foreground-700 hover:bg-background-100">
        查看全部告警
      </button>
    </div>
  );
}