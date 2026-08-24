import { Link } from "react-router-dom";

interface ImageNavConfig {
  items?: { icon?: string; text?: string; link?: string }[];
  columns?: number;
}

export default function ImageNavRenderer({ config, isPreview = false }: { config: ImageNavConfig; isPreview?: boolean }) {
  const items = config.items || [];
  const cols = config.columns || 4;
  if (items.length === 0) return null;

  return (
    <section className={isPreview ? "py-4 px-3" : "py-10 md:py-14 px-4 md:px-6 max-w-7xl mx-auto"}>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${isPreview ? Math.min(cols, 4) : cols}, minmax(0, 1fr))` }}>
        {items.map((item, i) => (
          <Link key={i} to={item.link || "#"} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl bg-background-50 border border-background-200/70 hover:border-primary-300 hover:shadow-sm transition-all group ${isPreview ? "" : "p-4 md:p-5"}`}>
            <div className={`${isPreview ? "w-10 h-10" : "w-12 h-12 md:w-14 md:h-14"} rounded-xl bg-primary-100 flex items-center justify-center group-hover:bg-primary-500 transition-colors`}>
              <i className={`${item.icon || "ri-apps-line"} ${isPreview ? "text-base" : "text-xl md:text-2xl"} text-primary-600 group-hover:text-white transition-colors`}></i>
            </div>
            <span className={`${isPreview ? "text-[10px]" : "text-xs md:text-sm"} font-medium text-foreground-700 group-hover:text-foreground-900 transition-colors whitespace-nowrap`}>{item.text || ""}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}