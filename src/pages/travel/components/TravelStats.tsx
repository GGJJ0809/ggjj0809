import { travelers } from "@/mocks/travel";

export default function TravelStats() {
  const total = travelers.length;
  const atRisk = travelers.filter((t) => t.status === "warning" || t.status === "lost").length;
  const lost = travelers.filter((t) => t.status === "lost").length;
  const safe = travelers.filter((t) => t.status === "safe").length;

  const stats = [
    { label: "在途人员", value: total, unit: "人", icon: "ri-user-location-line", color: "primary" },
    { label: "重点关注", value: atRisk, unit: "人", icon: "ri-alarm-warning-line", color: "accent" },
    { label: "失联待查", value: lost, unit: "人", icon: "ri-signal-wifi-error-line", color: "accent" },
    { label: "安全在途", value: safe, unit: "人", icon: "ri-shield-check-line", color: "secondary" },
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
            <span className="flex items-center gap-1 rounded-full bg-background-100 px-2 py-0.5 text-[11px] font-semibold text-foreground-600">
              <i className="ri-pulse-line text-xs" />
              实时
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