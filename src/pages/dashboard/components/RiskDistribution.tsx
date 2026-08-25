import { riskDistribution, recentActivities } from "@/mocks/admin";

const barColor: Record<string, string> = {
  accent: "bg-accent-500",
  primary: "bg-primary-500",
  secondary: "bg-secondary-500",
  foreground: "bg-foreground-300",
};

export default function RiskDistribution() {
  const total = riskDistribution.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* 风险等级分布 */}
      <div className="rounded-lg border border-background-200 bg-background-50 p-5">
        <h3 className="font-heading text-base font-bold">风险等级分布</h3>
        <p className="text-xs text-foreground-500">今日告警分级统计</p>
        <div className="mt-5 space-y-4">
          {riskDistribution.map((item) => (
            <div key={item.level}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-foreground-700">{item.level}</span>
                <span className="font-heading font-bold">{item.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-background-100">
                <div
                  className={`h-full rounded-full ${barColor[item.color]}`}
                  style={{ width: `${(item.count / total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 处置动态 */}
      <div className="rounded-lg border border-background-200 bg-background-50 p-5">
        <h3 className="font-heading text-base font-bold">处置动态</h3>
        <p className="text-xs text-foreground-500">最近的事件处理进度</p>
        <div className="mt-5 space-y-4">
          {recentActivities.map((activity) => (
            <div key={activity.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                  <i className="ri-flashlight-line text-sm" />
                </span>
                <span className="mt-1 w-px flex-1 bg-background-200" />
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{activity.title}</p>
                  <span className="whitespace-nowrap text-[11px] text-foreground-400">
                    {activity.time}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-foreground-500">{activity.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}