import { operationUsers, operationOrders, operationProviders, financeRecords } from "@/mocks/operations";

export default function OperationsStats() {
  const activeUsers = operationUsers.filter((u) => u.status === "active").length;
  const activeProviders = operationProviders.filter((p) => p.status === "active").length;

  const monthlyIncome = financeRecords
    .filter((f) => f.type === "income")
    .reduce((sum, f) => sum + parseInt(f.amount.replace(/[¥,]/g, ""), 10), 0);

  const stats = [
    { label: "注册用户", value: operationUsers.length, unit: "人", icon: "ri-user-line", color: "primary", sub: `${activeUsers} 活跃` },
    { label: "累计订单", value: operationOrders.length, unit: "笔", icon: "ri-shopping-bag-3-line", color: "secondary", sub: "本月" },
    { label: "合作服务商", value: operationProviders.length, unit: "家", icon: "ri-team-line", color: "accent", sub: `${activeProviders} 活跃` },
    { label: "本月营收", value: `¥${(monthlyIncome / 10000).toFixed(1)}`, unit: "万", icon: "ri-money-cny-circle-line", color: "primary", sub: "含增值服务" },
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
            <span className="rounded-full bg-background-100 px-2 py-0.5 text-[11px] text-foreground-500">
              {stat.sub}
            </span>
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