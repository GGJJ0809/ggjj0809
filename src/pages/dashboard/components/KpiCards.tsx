import { kpiCards } from "@/mocks/admin";

export default function KpiCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpiCards.map((card) => {
        const isUp = card.trend === "up";
        return (
          <div
            key={card.id}
            className="rounded-lg border border-background-200 bg-background-50 p-5"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background-100 text-foreground-700">
                <i className={`${card.icon} text-lg`} />
              </div>
              <span
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  isUp ? "bg-accent-100 text-accent-900" : "bg-secondary-100 text-secondary-900"
                }`}
              >
                <i className={`${isUp ? "ri-arrow-up-line" : "ri-arrow-down-line"} text-xs`} />
                {card.delta}
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="font-heading text-3xl font-bold tracking-tight">{card.value}</span>
              <span className="text-sm text-foreground-500">{card.unit}</span>
            </div>
            <p className="mt-1 text-sm text-foreground-600">{card.label}</p>
          </div>
        );
      })}
    </div>
  );
}