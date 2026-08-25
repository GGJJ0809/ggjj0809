import type { Provider } from "@/mocks/security";

interface ComparePanelProps {
  compareProviders: Provider[];
  onToggleCompare: (id: number) => void;
}

export default function ComparePanel({ compareProviders, onToggleCompare }: ComparePanelProps) {
  if (compareProviders.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-background-200 bg-background-50 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background-100">
          <i className="ri-scales-3-line text-2xl text-foreground-400" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground-700">尚未选择服务商</p>
        <p className="mt-1 text-xs text-foreground-500">
          从左侧目录选择 1-3 家服务商，即可并排比较价格与资质
        </p>
      </div>
    );
  }

  const rows = [
    { label: "综合评分", render: (p: Provider) => `${p.rating} 分（${p.reviews} 条评价）` },
    { label: "响应时长", render: (p: Provider) => p.responseTime },
    { label: "从业年限", render: (p: Provider) => `${p.yearsExperience} 年` },
    { label: "覆盖地区", render: (p: Provider) => p.coverage.join(" / ") },
    { label: "资质认证", render: (p: Provider) => (p.verified ? "已认证" : "待认证") },
    { label: "贴身护卫价", render: (p: Provider) => p.services.find((s) => s.name === "贴身护卫")?.price ?? "—" },
  ];

  return (
    <div className="flex h-full flex-col rounded-lg border border-background-200 bg-background-50">
      <div className="flex items-center justify-between border-b border-background-200 px-5 py-4">
        <div>
          <h3 className="font-heading text-base font-bold">服务商比价</h3>
          <p className="text-xs text-foreground-500">最多可选 3 家并排比较</p>
        </div>
        <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700">
          {compareProviders.length} / 3
        </span>
      </div>

      <div className="flex-1 overflow-x-auto p-4">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-24 border-b border-background-200 pb-3 text-left text-xs font-medium text-foreground-500">
                对比项
              </th>
              {compareProviders.map((p) => (
                <th key={p.id} className="border-b border-background-200 px-3 pb-3 text-left">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary-100 text-xs font-semibold text-secondary-900">
                      {p.name.charAt(0)}
                    </span>
                    <span className="whitespace-nowrap text-xs font-semibold">{p.name}</span>
                    <button
                      type="button"
                      onClick={() => onToggleCompare(p.id)}
                      className="ml-1 text-foreground-400 hover:text-foreground-600"
                    >
                      <i className="ri-close-circle-line text-sm" />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="border-b border-background-100 py-2.5 text-xs text-foreground-500">{row.label}</td>
                {compareProviders.map((p) => (
                  <td key={p.id} className="border-b border-background-100 px-3 py-2.5 text-xs text-foreground-800">
                    {row.render(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}