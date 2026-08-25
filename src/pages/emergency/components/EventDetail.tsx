const levelStyle: Record<string, string> = {
  P0: "bg-accent-100 text-accent-900",
  P1: "bg-primary-100 text-primary-700",
  P2: "bg-secondary-100 text-secondary-900",
  P3: "bg-background-200 text-foreground-600",
};

const timelineTypeIcon: Record<string, string> = {
  create: "ri-add-circle-line",
  update: "ri-refresh-line",
  dispatch: "ri-send-plane-line",
  handle: "ri-checkbox-circle-line",
};

interface Resource {
  id: string;
  name: string;
  type: string;
  distance: string;
  eta: string;
  dispatched: boolean;
}

interface TimelineItem {
  time: string;
  title: string;
  detail: string;
  type: string;
}

interface EventItem {
  id: number;
  level: string;
  title: string;
  category: string;
  location: string;
  time: string;
  status: string;
  description: string;
  timeline: TimelineItem[];
  resources: Resource[];
}

interface EventDetailProps {
  event: EventItem | undefined;
  onDispatch: (resourceId: string) => void;
}

export default function EventDetail({ event, onDispatch }: EventDetailProps) {
  if (!event) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-background-200 bg-background-50 text-sm text-foreground-400">
        请选择一个事件查看详情
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {/* 事件信息 + 时间线 */}
      <div className="flex flex-col rounded-lg border border-background-200 bg-background-50 p-5">
        <div className="flex items-start gap-3">
          <span className={`rounded-md px-2 py-1 text-xs font-bold ${levelStyle[event.level]}`}>
            {event.level}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-lg font-bold leading-snug">{event.title}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-foreground-500">
              <span className="flex items-center gap-1">
                <i className="ri-folder-3-line" />
                {event.category}
              </span>
              <span className="flex items-center gap-1">
                <i className="ri-map-pin-2-line" />
                {event.location}
              </span>
              <span className="flex items-center gap-1">
                <i className="ri-time-line" />
                {event.time}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-background-100 p-4 text-sm leading-relaxed text-foreground-700">
          {event.description}
        </div>

        <div className="mt-5">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <i className="ri-history-line" />
            处置时间线
          </h4>
          <div className="space-y-0">
            {event.timeline.map((item, i) => (
              <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {i !== event.timeline.length - 1 && (
                  <span className="absolute left-[13px] top-7 h-full w-px bg-background-200" />
                )}
                <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                  <i className={`${timelineTypeIcon[item.type] ?? "ri-time-line"} text-sm`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{item.title}</p>
                    <span className="whitespace-nowrap text-[11px] text-foreground-400">{item.time}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-foreground-500">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 资源调度 */}
      <div className="flex flex-col rounded-lg border border-background-200 bg-background-50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-heading text-base font-bold">资源调度面板</h3>
            <p className="text-xs text-foreground-500">就近资源匹配 · 预计到达时间</p>
          </div>
          <span className="rounded-full bg-secondary-100 px-2.5 py-1 text-[11px] font-medium text-secondary-900">
            就近匹配
          </span>
        </div>

        {event.resources.length === 0 ? (
          <div className="mt-6 flex flex-1 flex-col items-center justify-center text-center text-foreground-400">
            <i className="ri-inbox-line text-3xl" />
            <p className="mt-2 text-sm">该事件无需调度资源</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {event.resources.map((resource) => (
              <div
                key={resource.id}
                className="flex items-center gap-3 rounded-lg border border-background-200 p-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary-100 text-secondary-900">
                  <i className="ri-shield-user-line text-lg" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{resource.name}</p>
                  <p className="text-[11px] text-foreground-500">
                    {resource.type} · {resource.distance}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-foreground-500">预计</p>
                  <p className="text-sm font-semibold text-primary-700">{resource.eta}</p>
                </div>
                <button
                  onClick={() => onDispatch(resource.id)}
                  disabled={resource.dispatched}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ${
                    resource.dispatched
                      ? "cursor-not-allowed bg-background-100 text-foreground-400"
                      : "bg-primary-500 text-background-50 hover:bg-primary-600"
                  }`}
                >
                  {resource.dispatched ? "已派单" : "派单"}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto pt-4">
          <button className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-background-200 py-2.5 text-sm font-medium text-foreground-700 hover:bg-background-100">
            <i className="ri-phone-line" />
            一键呼叫调度中心
          </button>
        </div>
      </div>
    </div>
  );
}