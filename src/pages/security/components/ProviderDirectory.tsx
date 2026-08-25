import { useState } from "react";
import type { Provider } from "@/mocks/security";

interface ProviderDirectoryProps {
  providers: Provider[];
  compareIds: number[];
  onToggleCompare: (id: number) => void;
  onOrder: (provider: Provider) => void;
}

const regionOptions = ["全部地区", "非洲", "中东", "东南亚", "拉美", "欧洲", "全球"];

export default function ProviderDirectory({
  providers,
  compareIds,
  onToggleCompare,
  onOrder,
}: ProviderDirectoryProps) {
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("全部地区");

  const filtered = providers.filter((p) => {
    const keyword = search.trim().toLowerCase();
    const matchSearch =
      !keyword ||
      p.name.toLowerCase().includes(keyword) ||
      p.country.toLowerCase().includes(keyword) ||
      p.services.some((s) => s.name.toLowerCase().includes(keyword));
    const matchRegion =
      region === "全部地区" ||
      (region === "全球" ? p.coverage.includes("全球") : p.coverage.includes(region));
    return matchSearch && matchRegion;
  });

  return (
    <div className="flex h-full flex-col rounded-lg border border-background-200 bg-background-50">
      <div className="border-b border-background-200 px-5 py-4">
        <h3 className="font-heading text-base font-bold">服务商目录</h3>
        <p className="text-xs text-foreground-500">选择服务商加入比价或直接下单</p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索服务商 / 国家 / 服务..."
              className="h-9 w-full rounded-md border border-background-200 bg-background-50 pl-9 pr-3 text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="h-9 rounded-md border border-background-200 bg-background-50 px-3 text-sm outline-none focus:border-primary-300 cursor-pointer"
          >
            {regionOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-foreground-400">
            <i className="ri-inbox-line text-3xl" />
            <p className="mt-2 text-sm">未找到匹配服务商</p>
          </div>
        ) : (
          filtered.map((provider) => {
            const isComparing = compareIds.includes(provider.id);
            return (
              <div
                key={provider.id}
                className={`rounded-lg border p-4 transition-colors ${
                  isComparing ? "border-primary-300 bg-primary-50" : "border-background-200 bg-background-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary-100 text-base font-semibold text-secondary-900">
                    {provider.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{provider.name}</p>
                      {provider.verified && (
                        <span className="flex items-center gap-1 rounded-full bg-secondary-100 px-2 py-0.5 text-[10px] font-medium text-secondary-900">
                          <i className="ri-verified-badge-line text-xs" />
                          已认证
                        </span>
                      )}
                      {provider.badge && (
                        <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-medium text-accent-900">
                          {provider.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-foreground-500">
                      {provider.country} · {provider.headquarters} · 从业 {provider.yearsExperience} 年
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-sm font-semibold text-foreground-900">
                    <i className="ri-star-fill text-xs text-accent-500" />
                    {provider.rating}
                    <span className="text-xs font-normal text-foreground-400">({provider.reviews})</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {provider.coverage.map((c) => (
                    <span key={c} className="rounded-md bg-background-100 px-2 py-1 text-[11px] text-foreground-600">
                      {c}
                    </span>
                  ))}
                  <span className="flex items-center gap-1 rounded-md bg-background-100 px-2 py-1 text-[11px] text-foreground-600">
                    <i className="ri-timer-line" />
                    {provider.responseTime}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5">
                  {provider.services.map((s) => (
                    <div key={s.name} className="flex items-center justify-between rounded-md bg-background-100/60 px-3 py-1.5 text-xs">
                      <span className="text-foreground-700">{s.name}</span>
                      <span className="font-medium text-foreground-900">
                        {s.price}
                        <span className="ml-1 font-normal text-foreground-400">{s.unit}</span>
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleCompare(provider.id)}
                    disabled={!isComparing && compareIds.length >= 3}
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                      isComparing
                        ? "bg-primary-100 text-primary-700"
                        : "bg-background-100 text-foreground-600 hover:bg-background-200 disabled:cursor-not-allowed disabled:opacity-50"
                    }`}
                  >
                    <i className={`${isComparing ? "ri-checkbox-circle-fill" : "ri-add-circle-line"}`} />
                    {isComparing ? "已加入比价" : "加入比价"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOrder(provider)}
                    className="ml-auto flex items-center gap-1.5 whitespace-nowrap rounded-md bg-primary-500 px-3 py-2 text-xs font-medium text-background-50 hover:bg-primary-600"
                  >
                    <i className="ri-shopping-bag-3-line" />
                    立即下单
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}