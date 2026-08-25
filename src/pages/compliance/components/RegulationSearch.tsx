import { useState } from "react";
import { regulations } from "@/mocks/compliance";

const relevanceMeta: Record<string, { label: string; className: string }> = {
  high: { label: "高相关", className: "bg-accent-100 text-accent-900" },
  medium: { label: "中相关", className: "bg-primary-100 text-primary-700" },
  low: { label: "低相关", className: "bg-secondary-100 text-secondary-900" },
};

const categoryOptions = ["全部类别", "劳工安全", "行业安全", "数据合规", "投资准入", "劳务合规", "应急管理"];

export default function RegulationSearch() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部类别");

  const filtered = regulations.filter((r) => {
    const keyword = search.trim().toLowerCase();
    const matchSearch =
      !keyword ||
      r.name.toLowerCase().includes(keyword) ||
      r.country.toLowerCase().includes(keyword) ||
      r.summary.toLowerCase().includes(keyword);
    const matchCategory = category === "全部类别" || r.category === category;
    return matchSearch && matchCategory;
  });

  return (
    <div className="rounded-lg border border-background-200 bg-background-50">
      <div className="flex flex-col gap-3 border-b border-background-200 px-5 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-bold">法规检索</h3>
          <p className="text-xs text-foreground-500">检索海外安全与合规相关法规</p>
        </div>
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
          <div className="relative sm:w-72">
            <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索法规名称 / 国家 / 关键词..."
              className="h-9 w-full rounded-md border border-background-200 bg-background-50 pl-9 pr-3 text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 rounded-md border border-background-200 bg-background-50 px-3 text-sm outline-none focus:border-primary-300 cursor-pointer"
          >
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="divide-y divide-background-100">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-foreground-400">
            <i className="ri-inbox-line text-3xl" />
            <p className="mt-2 text-sm">未找到匹配法规</p>
          </div>
        ) : (
          filtered.map((r) => {
            const rel = relevanceMeta[r.relevance];
            return (
              <div key={r.id} className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-background-100/50 sm:flex-row sm:items-start">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground-900">{r.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${rel.className}`}>{rel.label}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-foreground-600">{r.summary}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-foreground-500 sm:flex-col sm:items-end">
                  <span className="flex items-center gap-1">
                    <i className="ri-map-pin-2-line" />
                    {r.country}
                  </span>
                  <span className="flex items-center gap-1">
                    <i className="ri-calendar-line" />
                    {r.effectiveDate}
                  </span>
                  <span className="rounded-md bg-background-100 px-2 py-0.5 text-[11px]">{r.category}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}