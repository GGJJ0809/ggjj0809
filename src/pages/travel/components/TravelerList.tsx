import { useState } from "react";
import { travelers } from "@/mocks/travel";

const statusMeta: Record<string, { label: string; className: string }> = {
  safe: { label: "安全", className: "bg-secondary-100 text-secondary-900" },
  transit: { label: "在途", className: "bg-primary-100 text-primary-700" },
  warning: { label: "预警", className: "bg-accent-100 text-accent-900" },
  lost: { label: "失联", className: "bg-accent-500 text-background-50" },
};

const tabs = [
  { value: "all", label: "全部" },
  { value: "warning", label: "预警" },
  { value: "lost", label: "失联" },
  { value: "transit", label: "在途" },
  { value: "safe", label: "安全" },
];

interface TravelerListProps {
  selectedId: number;
  onSelect: (id: number) => void;
}

export default function TravelerList({ selectedId, onSelect }: TravelerListProps) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = travelers.filter((t) => {
    const matchFilter = filter === "all" || t.status === filter;
    const keyword = search.trim().toLowerCase();
    const matchSearch =
      !keyword ||
      t.name.toLowerCase().includes(keyword) ||
      t.company.toLowerCase().includes(keyword) ||
      t.destination.toLowerCase().includes(keyword);
    return matchFilter && matchSearch;
  });

  return (
    <div className="flex h-full flex-col rounded-lg border border-background-200 bg-background-50">
      <div className="border-b border-background-200 px-5 py-4">
        <h3 className="font-heading text-base font-bold">在途人员</h3>
        <p className="text-xs text-foreground-500">点击人员在地图中定位</p>

        <div className="relative mt-3">
          <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名 / 公司 / 目的地..."
            className="h-9 w-full rounded-md border border-background-200 bg-background-50 pl-9 pr-3 text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1 rounded-full bg-background-100 px-1 py-1">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === tab.value
                  ? "bg-background-50 text-foreground-900"
                  : "text-foreground-500 hover:text-foreground-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-foreground-400">
            <i className="ri-inbox-line text-3xl" />
            <p className="mt-2 text-sm">未找到匹配人员</p>
          </div>
        ) : (
          filtered.map((traveler) => {
            const status = statusMeta[traveler.status];
            const isActive = traveler.id === selectedId;
            return (
              <button
                key={traveler.id}
                onClick={() => onSelect(traveler.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  isActive
                    ? "border-primary-300 bg-primary-50"
                    : "border-background-200 bg-background-50 hover:bg-background-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-100 text-sm font-semibold text-secondary-900">
                    {traveler.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{traveler.name}</p>
                    <p className="truncate text-[11px] text-foreground-500">{traveler.company}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                <p className="mt-2 flex items-center gap-1 truncate text-xs text-foreground-600">
                  <i className="ri-map-pin-2-line text-xs text-foreground-400" />
                  {traveler.destination}
                </p>
                <p className="mt-1 flex items-center justify-between text-[11px] text-foreground-400">
                  <span className="flex items-center gap-1">
                    <i className="ri-time-line" />
                    {traveler.lastUpdate}
                  </span>
                  <span>{traveler.tripPurpose}</span>
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}