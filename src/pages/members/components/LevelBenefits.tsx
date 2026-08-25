interface Level {
  id: number;
  level_key: string;
  name: string;
  annual_fee: number;
  benefits: string[];
  sort_order: number;
}

interface LevelBenefitsProps {
  levels: Level[];
}

const levelBadge: Record<string, string> = {
  standard: "bg-foreground-100 text-foreground-700",
  gold: "bg-secondary-100 text-secondary-900",
  platinum: "bg-accent-100 text-accent-900",
  black: "bg-foreground-950 text-background-50",
};

export default function LevelBenefits({ levels }: LevelBenefitsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {levels.map((level) => {
        const fee = Number(level.annual_fee);
        return (
          <div
            key={level.id}
            className="bg-background-50 border border-background-200 rounded-lg p-6 flex flex-col transition-transform duration-200 hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-foreground-950">
                {level.name}
              </h3>
              {level.level_key === "black" && (
                <span className="text-xs whitespace-nowrap bg-accent-500 text-background-50 px-2.5 py-1 rounded-full">
                  尊享
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-primary-600 mb-4">
              {fee > 0 ? `¥${fee.toLocaleString()}` : "免费"}
              <span className="text-sm text-foreground-600 font-normal ml-1">
                /年
              </span>
            </p>
            <span className={`inline-flex self-start text-xs px-2.5 py-1 rounded-full mb-4 ${levelBadge[level.level_key] ?? "bg-foreground-100 text-foreground-700"}`}>
              {level.level_key}
            </span>
            <ul className="space-y-2.5 flex-1">
              {(level.benefits ?? []).map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-2 text-sm text-foreground-700"
                >
                  <i className="ri-check-line text-primary-600 mt-0.5"></i>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}