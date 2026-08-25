import { regulations, complianceQuestions } from "@/mocks/compliance";

export default function ComplianceStats() {
  const countries = new Set(regulations.map((r) => r.country));
  const highRisk = regulations.filter((r) => r.relevance === "high").length;

  const stats = [
    { label: "法规库收录", value: regulations.length, unit: "部", icon: "ri-book-2-line", color: "primary" },
    { label: "高风险法规", value: highRisk, unit: "部", icon: "ri-alarm-warning-line", color: "accent" },
    { label: "覆盖国家", value: countries.size, unit: "个", icon: "ri-earth-line", color: "secondary" },
    { label: "待自检项", value: complianceQuestions.length, unit: "项", icon: "ri-task-line", color: "primary" },
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