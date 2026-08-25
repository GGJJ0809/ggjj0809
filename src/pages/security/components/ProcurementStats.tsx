import { providers, procurementOrders } from "@/mocks/security";

export default function ProcurementStats() {
  const coverageSet = new Set<string>();
  providers.forEach((p) => p.coverage.forEach((c) => coverageSet.add(c)));

  const activeOrders = procurementOrders.filter(
    (o) => o.status === "deployed" || o.status === "confirmed"
  ).length;

  const avgResponse = Math.round(
    providers.reduce((sum, p) => sum + parseInt(p.responseTime, 10), 0) / providers.length
  );

  const stats = [
    { label: "合作服务商", value: providers.length, unit: "家", icon: "ri-team-line", color: "primary" },
    { label: "覆盖地区", value: coverageSet.size, unit: "个", icon: "ri-earth-line", color: "secondary" },
    { label: "平均响应时长", value: avgResponse, unit: "分钟", icon: "ri-timer-flash-line", color: "accent" },
    { label: "进行中订单", value: activeOrders, unit: "笔", icon: "ri-shopping-bag-3-line", color: "primary" },
  ];

  const colorMap: Record<string, string> = {
    primary: "bg-primary-100 text-primary-700",
    accent: "bg-accent-100 text-accent-900",
    secondary: "bg-secondary-100 text-secondary-900",
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg border border-background-200 bg-background-50 p-5">
          <div className="flex items-start justify-between">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorMap[stat.color]}`}>
              <i className={`${stat.icon} text-lg`} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="font-heading text-3xl font-bold tracking-tight">{stat.value}</span>
            <span className="text-sm text-foreground-500">{stat.unit}</span>
          </div>
          <p className="mt-1 text-sm text-foreground-600">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}