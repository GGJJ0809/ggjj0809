import { useState } from "react";
import type { ValueService } from "@/mocks/valueAdded";

interface ServiceCatalogProps {
  services: ValueService[];
  onBook: (service: ValueService) => void;
}

const categoryMeta: Record<string, { icon: string; className: string }> = {
  教育: { icon: "ri-graduation-cap-line", className: "bg-secondary-100 text-secondary-900" },
  医疗: { icon: "ri-heart-pulse-line", className: "bg-accent-100 text-accent-900" },
  财富: { icon: "ri-briefcase-4-line", className: "bg-primary-100 text-primary-700" },
  商旅: { icon: "ri-plane-line", className: "bg-secondary-100 text-secondary-900" },
};

const categories = ["全部", "教育", "医疗", "财富", "商旅"];

export default function ServiceCatalog({ services, onBook }: ServiceCatalogProps) {
  const [category, setCategory] = useState("全部");

  const filtered = category === "全部" ? services : services.filter((s) => s.category === category);

  return (
    <div className="rounded-lg border border-background-200 bg-background-50">
      <div className="flex flex-col gap-3 border-b border-background-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-heading text-base font-bold">增值服务</h3>
          <p className="text-xs text-foreground-500">教育 · 医疗 · 财富 · 商旅</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-full bg-background-100 px-1 py-1">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                category === c
                  ? "bg-background-50 text-foreground-900"
                  : "text-foreground-500 hover:text-foreground-700"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
        {filtered.map((service) => {
          const meta = categoryMeta[service.category];
          return (
            <div key={service.id} className="flex flex-col rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300">
              <div className="flex items-center gap-2">
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta.className}`}>
                  <i className={`${meta.icon} text-base`} />
                </span>
                <span className="rounded-full bg-background-100 px-2 py-0.5 text-[10px] font-medium text-foreground-600">
                  {service.category}
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold leading-snug text-foreground-900">{service.name}</p>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-foreground-600">{service.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {service.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-background-100 px-2 py-0.5 text-[10px] text-foreground-500">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-background-100 pt-3">
                <div>
                  <p className="text-sm font-semibold text-foreground-900">
                    {service.price}
                    <span className="text-xs font-normal text-foreground-400">/{service.duration}</span>
                  </p>
                  <p className="text-[10px] text-foreground-400">{service.provider}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onBook(service)}
                  className="whitespace-nowrap rounded-md bg-primary-500 px-3 py-2 text-xs font-medium text-background-50 hover:bg-primary-600"
                >
                  立即预约
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}