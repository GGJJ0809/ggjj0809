import { useState } from "react";
import { emergencyEvents, resourceSummary } from "@/mocks/emergency";
import EventList from "./components/EventList";
import EventDetail from "./components/EventDetail";

export default function Emergency() {
  const [events, setEvents] = useState(emergencyEvents);
  const [selectedId, setSelectedId] = useState(emergencyEvents[0].id);
  const [filter, setFilter] = useState("全部");

  const filteredEvents =
    filter === "全部" ? events : events.filter((event) => event.level === filter);

  const selectedEvent = events.find((event) => event.id === selectedId);

  const handleDispatch = (resourceId: string) => {
    setEvents((prev) =>
      prev.map((event) => {
        if (event.id !== selectedId) return event;
        const resource = event.resources.find((r) => r.id === resourceId);
        if (!resource || resource.dispatched) return event;
        return {
          ...event,
          status: event.status === "pending" ? "handling" : event.status,
          resources: event.resources.map((r) =>
            r.id === resourceId ? { ...r, dispatched: true } : r
          ),
          timeline: [
            ...event.timeline,
            {
              time: "刚刚",
              title: `已派单至 ${resource.name}`,
              detail: `预计 ${resource.eta} 到达现场`,
              type: "dispatch",
            },
          ],
        };
      })
    );
  };

  const pendingCount = events.filter((e) => e.status === "pending").length;
  const handlingCount = events.filter((e) => e.status === "handling").length;
  const closedCount = events.filter((e) => e.status === "closed").length;
  const p0Count = events.filter((e) => e.level === "P0" && e.status !== "closed").length;

  const stats = [
    { label: "待处置事件", value: pendingCount, icon: "ri-alarm-line", color: "accent" },
    { label: "处置中事件", value: handlingCount, icon: "ri-loader-4-line", color: "primary" },
    { label: "P0 紧急事件", value: p0Count, icon: "ri-fire-line", color: "accent" },
    { label: "已关闭事件", value: closedCount, icon: "ri-check-double-line", color: "secondary" },
  ];

  const statColor: Record<string, string> = {
    accent: "bg-accent-100 text-accent-900",
    primary: "bg-primary-100 text-primary-700",
    secondary: "bg-secondary-100 text-secondary-900",
  };

  return (
    <div className="space-y-4">
      {/* 事件状态统计 */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-4 rounded-lg border border-background-200 bg-background-50 p-5">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${statColor[stat.color]}`}>
              <i className={`${stat.icon} text-xl`} />
            </div>
            <div>
              <p className="font-heading text-2xl font-bold tracking-tight">{stat.value}</p>
              <p className="text-sm text-foreground-600">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 事件列表 + 详情 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="h-[560px] xl:col-span-1">
          <EventList
            events={filteredEvents}
            selectedId={selectedId}
            onSelect={setSelectedId}
            filter={filter}
            onFilter={setFilter}
          />
        </div>
        <div className="xl:col-span-2">
          <EventDetail event={selectedEvent} onDispatch={handleDispatch} />
        </div>
      </div>

      {/* 资源概览 */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {resourceSummary.map((resource) => (
          <div key={resource.id} className="rounded-lg border border-background-200 bg-background-50 p-5">
            <div className="flex items-center gap-2 text-foreground-500">
              <span className="flex h-7 w-7 items-center justify-center">
                <i className={`${resource.icon} text-base`} />
              </span>
              <span className="text-sm">{resource.name}</span>
            </div>
            <p className="mt-3 font-heading text-2xl font-bold tracking-tight">
              {resource.value}
              <span className="ml-1 text-sm font-normal text-foreground-500">{resource.unit}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}