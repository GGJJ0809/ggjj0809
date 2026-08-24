import { useState } from "react";

export interface ComponentTypeInfo {
  type: string;
  label: string;
  icon: string;
}

export interface ComponentCategory {
  name: string;
  items: ComponentTypeInfo[];
}

interface LeftPaletteProps {
  categories: ComponentCategory[];
  onAdd: (type: string) => void;
}

export default function LeftPalette({ categories, onAdd }: LeftPaletteProps) {
  const [activeCategory, setActiveCategory] = useState(categories[0]?.name || "");

  return (
    <aside className="w-52 shrink-0 bg-background-50 border-r border-background-200/70 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-3 border-b border-background-200/70">
        <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-wider">组件库</h2>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-col gap-0.5 p-2">
        {categories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => setActiveCategory(cat.name)}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-left whitespace-nowrap ${
              activeCategory === cat.name
                ? "bg-primary-50 text-primary-700"
                : "text-foreground-500 hover:bg-background-100 hover:text-foreground-700"
            }`}
          >
            <i className={`${getCategoryIcon(cat.name)} text-sm`}></i>
            {cat.name}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {categories
          .filter((c) => c.name === activeCategory)
          .map((cat) => (
            <div key={cat.name} className="grid grid-cols-2 gap-2">
              {cat.items.map((item) => (
                <button
                  key={item.type}
                  onClick={() => onAdd(item.type)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-background-100 hover:bg-background-200/70 hover:border-primary-300 border border-transparent transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-background-50 flex items-center justify-center group-hover:bg-primary-100 transition-colors">
                    <i className={`${item.icon} text-lg text-foreground-500 group-hover:text-primary-600 transition-colors`}></i>
                  </div>
                  <span className="text-[10px] font-medium text-foreground-600 group-hover:text-foreground-800 text-center leading-tight">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
      </div>
    </aside>
  );
}

function getCategoryIcon(name: string): string {
  if (name.includes("基础")) return "ri-apps-line";
  if (name.includes("教学") || name.includes("商品")) return "ri-book-open-line";
  if (name.includes("营销")) return "ri-coupon-line";
  return "ri-more-line";
}