import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

interface EntityItem {
  id: number;
  title: string;
  image?: string;
  meta?: string;
  status?: string;
}

interface EntityPickerProps {
  table: string;
  titleField: string;
  imageField?: string;
  metaField?: string;
  metaFormatter?: (row: Record<string, any>) => string;
  value: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  emptyHint?: string;
}

export default function EntityPicker({
  table,
  titleField,
  imageField,
  metaField,
  metaFormatter,
  value,
  onChange,
  placeholder = "选择要展示的内容",
  emptyHint = "留空则自动取最新",
}: EntityPickerProps) {
  const [items, setItems] = useState<EntityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchItems = async () => {
      setLoading(true);
      setError("");
      try {
        const fields = ["id", titleField, ...(imageField ? [imageField] : []), ...(metaField ? [metaField] : [])];
        const { data, error: err } = await supabase
          .from(table)
          .select(fields.join(","))
          .order("created_at", { ascending: false })
          .limit(200);
        if (err) throw err;
        const mapped: EntityItem[] = (data || []).map((row: any) => ({
          id: row.id,
          title: row[titleField] ?? "",
          image: imageField ? row[imageField] : undefined,
          meta: metaFormatter ? metaFormatter(row) : metaField ? row[metaField] : undefined,
          status: row.status,
        }));
        setItems(mapped);
      } catch (e: any) {
        setError(e?.message || "加载失败");
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, titleField, imageField, metaField]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = items.filter((it) => value.includes(it.id));
  const filtered = items.filter((it) => it.title.toLowerCase().includes(search.toLowerCase()));

  const toggle = (id: number) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm text-foreground-800 hover:border-primary-300 transition-all whitespace-nowrap"
      >
        <span className="flex-1 text-left truncate">
          {value.length > 0 ? (
            <span className="text-foreground-800">已选 {value.length} 项</span>
          ) : (
            <span className="text-foreground-400">{emptyHint}</span>
          )}
        </span>
        <i className={`ri-arrow-down-s-line text-foreground-400 transition-transform ${open ? "rotate-180" : ""}`}></i>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[260px] rounded-xl border border-background-200/70 bg-background-50 shadow-md overflow-hidden">
          <div className="p-2 border-b border-background-200/70">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background-100">
              <i className="ri-search-line text-sm text-foreground-400"></i>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索..."
                className="flex-1 bg-transparent text-sm text-foreground-800 outline-none"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <i className="ri-loader-4-line animate-spin text-foreground-300"></i>
              </div>
            ) : error ? (
              <div className="py-6 px-3 text-center">
                <p className="text-xs text-foreground-500">{error}</p>
                <button type="button" onClick={() => { setLoading(true); setError(""); }} className="mt-2 text-xs text-primary-600 hover:text-primary-700">重试</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-xs text-foreground-400">没有匹配的内容</div>
            ) : (
              filtered.map((it) => {
                const checked = value.includes(it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => toggle(it.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-background-100 transition-colors text-left"
                  >
                    <span className={`w-4 h-4 flex items-center justify-center rounded border transition-colors shrink-0 ${checked ? "bg-primary-500 border-primary-500" : "border-background-300"}`}>
                      {checked && <i className="ri-check-line text-[11px] text-white"></i>}
                    </span>
                    {imageField && it.image ? (
                      <img src={it.image} alt={it.title} className="w-9 h-9 rounded-md object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <span className="w-9 h-9 rounded-md bg-background-100 flex items-center justify-center shrink-0">
                        <i className="ri-file-list-3-line text-foreground-300"></i>
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs text-foreground-800 truncate">{it.title}</span>
                        {it.status && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${it.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {it.status === 'active' ? '已发布' : it.status}
                          </span>
                        )}
                      </span>
                      {it.meta && <span className="block text-[10px] text-foreground-400 truncate">{it.meta}</span>}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between px-3 py-2 border-t border-background-200/70">
            <span className="text-xs text-foreground-500">已选 {value.length} 项</span>
            {value.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="text-xs text-foreground-400 hover:text-red-500 transition-colors">清空</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}