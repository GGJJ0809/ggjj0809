const levelStyle: Record<string, string> = {
  P0: "bg-accent-100 text-accent-900",
  P1: "bg-primary-100 text-primary-700",
  P2: "bg-secondary-100 text-secondary-900",
  P3: "bg-background-200 text-foreground-600",
};

const statusMap: Record<string, { label: string; className: string }> = {
  pending: { label: "待处置", className: "bg-accent-100 text-accent-900" },
  handling: { label: "处置中", className: "bg-primary-100 text-primary-700" },
  closed: { label: "已关闭", className: "bg-background-200 text-foreground-500" },
};

interface EventItem {
  id: number;
  level: string;
  title: string;
  category: string;
  location: string;
  time: string;
  status: string;
}

interface EventListProps {
  events: EventItem[];
  selectedId: number;
  onSelect: (id: number) => void;
  filter: string;
  onFilter: (filter: string) => void;
}

const tabs = ["全部", "P0", "P1", "P2"];

export default function EventList({ events, selectedId, onSelect, filter, onFilter }: EventListProps) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-background-200 bg-background-50">
      <div className="flex items-center justify-between border-b border-background-200 px-5 py-4">
        <div>
          <h3 className="font-heading text-base font-bold">事件总览</h3>
          <p className="text-xs text-foreground-500">点击事件查看详情与调度</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-background-100 px-1 py-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => onFilter(tab)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === tab
                  ? "bg-background-50 text-foreground-900"
                  : "text-foreground-500 hover:text-foreground-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {events.map((event) => {
          const status = statusMap[event.status];
          const isActive = event.id === selectedId;
          return (
            <button
              key={event.id}
              onClick={() => onSelect(event.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                isActive
                  ? "border-primary-300 bg-primary-50"
                  : "border-background-200 bg-background-50 hover:bg-background-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${levelStyle[event.level]}`}>
                  {event.level}
                </span>
                <span className="text-[11px] text-foreground-400">{event.category}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                  {status.label}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-medium leading-snug">{event.title}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-foreground-500">
                <i className="ri-map-pin-2-line text-xs" />
                {event.location}
                <span className="ml-auto text-foreground-400">{event.time}</span>
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}