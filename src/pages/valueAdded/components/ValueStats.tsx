import { valueServices, bookingRecords } from "@/mocks/valueAdded";

export default function ValueStats() {
  const categories = new Set(valueServices.map((s) => s.category));
  const completed = bookingRecords.filter((r) => r.status === "completed").length;
  const pending = bookingRecords.filter((r) => r.status === "pending" || r.status === "confirmed").length;

  const stats = [
    { label: "服务品类", value: categories.size, unit: "类", icon: "ri-grid-line", color: "primary" },
    { label: "在售服务", value: valueServices.length, unit: "项", icon: "ri-briefcase-line", color: "secondary" },
    { label: "进行中预约", value: pending, unit: "单", icon: "ri-calendar-check-line", color: "accent" },
    { label: "已完成服务", value: completed, unit: "单", icon: "ri-check-double-line", color: "primary" },
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