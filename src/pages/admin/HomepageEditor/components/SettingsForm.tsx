import EntityPicker from "./EntityPicker";
import ImageUploader from "@/components/feature/ImageUploader";

interface SettingsFormProps {
  section: { section_type: string; title: string; config: Record<string, any> };
  onChange: (config: Record<string, any>) => void;
  onTitleChange: (title: string) => void;
}

export default function SettingsForm({ section, onChange, onTitleChange }: SettingsFormProps) {
  const { section_type, title, config } = section;

  const update = (key: string, value: any) => onChange({ ...config, [key]: value });
  const arrUpdate = (key: string, arr: any[]) => onChange({ ...config, [key]: arr });
  const arrItemUpdate = (key: string, i: number, field: string, value: any) => {
    const arr = [...(config[key] || [])];
    arr[i] = { ...arr[i], [field]: value };
    onChange({ ...config, [key]: arr });
  };
  const arrItemRemove = (key: string, i: number) => {
    const arr = [...(config[key] || [])];
    arr.splice(i, 1);
    onChange({ ...config, [key]: arr });
  };
  const arrItemAdd = (key: string, item: any) => onChange({ ...config, [key]: [...(config[key] || []), item] });

  return (
    <div className="space-y-4">
      {/* Common: Title */}
      <div>
        <label className="block text-xs font-medium text-foreground-500 mb-1">组件标题</label>
        <input type="text" value={title} onChange={(e) => onTitleChange(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm text-foreground-800 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-all" placeholder="组件标题" />
      </div>

      {/* Carousel */}
      {section_type === "carousel" && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-foreground-700">轮播图设置</p>
          <Field label="高度(px)"><input type="number" value={config.height || 500} onChange={(e) => update("height", Number(e.target.value))} className="w-full px-3 py-1.5 rounded-md border border-background-200/70 text-sm" /></Field>
          <Toggle label="自动播放" value={config.autoplay !== false} onChange={(v) => update("autoplay", v)} />
          <Field label="间隔(ms)"><input type="number" value={config.interval || 3000} onChange={(e) => update("interval", Number(e.target.value))} className="w-full px-3 py-1.5 rounded-md border border-background-200/70 text-sm" /></Field>
          <Toggle label="显示指示点" value={config.showDots !== false} onChange={(v) => update("showDots", v)} />
          <p className="text-xs font-medium text-foreground-500 pt-1">添加内容</p>
          {(config.slides || []).map((slide: any, i: number) => (
            <div key={i} className="p-3 rounded-lg bg-background-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground-400">幻灯片 {i + 1}</span>
                <button onClick={() => arrItemRemove("slides", i)} className="text-red-400 hover:text-red-600 text-xs"><i className="ri-close-line"></i></button>
              </div>
              <ImageUploadField value={slide.image || ""} onChange={(v) => arrItemUpdate("slides", i, "image", v)} placeholder="图片URL" />
              <div className="flex gap-2">
                <input type="text" value={slide.link || ""} onChange={(e) => arrItemUpdate("slides", i, "link", e.target.value)} className="flex-1 px-2 py-1.5 rounded border border-background-200/70 text-xs" placeholder="跳转链接" />
                <input type="text" value={slide.alt || ""} onChange={(e) => arrItemUpdate("slides", i, "alt", e.target.value)} className="flex-1 px-2 py-1.5 rounded border border-background-200/70 text-xs" placeholder="替代文字" />
              </div>
            </div>
          ))}
          <button onClick={() => arrItemAdd("slides", { image: "", link: "", alt: "" })} className="w-full py-2 rounded-lg border border-dashed border-background-300 text-xs text-foreground-400 hover:text-foreground-600 hover:border-foreground-400 transition-all">
            <i className="ri-add-line mr-1"></i>添加幻灯片
          </button>
        </div>
      )}

      {/* Image Nav */}
      {section_type === "image_nav" && (
        <div className="space-y-3">
          <Field label="每行列数">
            <select value={config.columns || 4} onChange={(e) => update("columns", Number(e.target.value))} className="w-full px-3 py-1.5 rounded-md border border-background-200/70 text-sm">
              <option value={3}>3列</option><option value={4}>4列</option><option value={5}>5列</option><option value={6}>6列</option>
            </select>
          </Field>
          <p className="text-xs font-medium text-foreground-500 pt-1">导航项列表</p>
          {(config.items || []).map((item: any, i: number) => (
            <div key={i} className="p-3 rounded-lg bg-background-100 space-y-2">
              <div className="flex items-center justify-between"><span className="text-xs text-foreground-400">第 {i + 1} 项</span><button onClick={() => arrItemRemove("items", i)} className="text-red-400 hover:text-red-600 text-xs"><i className="ri-close-line"></i></button></div>
              <div className="flex gap-2">
                <input type="text" value={item.icon || ""} onChange={(e) => arrItemUpdate("items", i, "icon", e.target.value)} className="w-1/3 px-2 py-1.5 rounded border border-background-200/70 text-xs" placeholder="图标类名" />
                <input type="text" value={item.text || ""} onChange={(e) => arrItemUpdate("items", i, "text", e.target.value)} className="flex-1 px-2 py-1.5 rounded border border-background-200/70 text-xs" placeholder="文字" />
                <input type="text" value={item.link || ""} onChange={(e) => arrItemUpdate("items", i, "link", e.target.value)} className="flex-1 px-2 py-1.5 rounded border border-background-200/70 text-xs" placeholder="链接" />
              </div>
            </div>
          ))}
          <button onClick={() => arrItemAdd("items", { icon: "ri-home-line", text: "新导航", link: "/" })} className="w-full py-2 rounded-lg border border-dashed border-background-300 text-xs text-foreground-400 hover:text-foreground-600 transition-all"><i className="ri-add-line mr-1"></i>添加导航项</button>
        </div>
      )}

      {/* Search */}
      {section_type === "search" && (
        <div className="space-y-3">
          <Field label="搜索占位文字"><input type="text" value={config.placeholder || ""} onChange={(e) => update("placeholder", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm" /></Field>
          <Field label="搜索范围">
            <select value={config.scope || "all"} onChange={(e) => update("scope", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm">
              <option value="all">全部</option><option value="courses">课程</option><option value="activities">活动</option><option value="ai">AI工具</option>
            </select>
          </Field>
        </div>
      )}

      {/* Image Ad */}
      {section_type === "image_ad" && (
        <div className="space-y-3">
          <ImageUploadField value={config.image || ""} onChange={(v) => update("image", v)} placeholder="图片URL" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="主标题"><input type="text" value={config.title || ""} onChange={(e) => update("title", e.target.value)} className="w-full px-2 py-1.5 rounded border border-background-200/70 text-sm" /></Field>
            <Field label="副标题"><input type="text" value={config.subtitle || ""} onChange={(e) => update("subtitle", e.target.value)} className="w-full px-2 py-1.5 rounded border border-background-200/70 text-sm" /></Field>
          </div>
          <Field label="描述"><textarea value={config.description || ""} onChange={(e) => update("description", e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm resize-none" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="按钮文字"><input type="text" value={config.buttonText || ""} onChange={(e) => update("buttonText", e.target.value)} className="w-full px-2 py-1.5 rounded border border-background-200/70 text-sm" /></Field>
            <Field label="按钮链接"><input type="text" value={config.buttonLink || ""} onChange={(e) => update("buttonLink", e.target.value)} className="w-full px-2 py-1.5 rounded border border-background-200/70 text-sm" /></Field>
          </div>
          <Field label="布局方向">
            <div className="flex gap-2">
              <Btn active={config.layout !== "right-left"} onClick={() => update("layout", "left-right")}>图左文右</Btn>
              <Btn active={config.layout === "right-left"} onClick={() => update("layout", "right-left")}>图右文左</Btn>
            </div>
          </Field>
        </div>
      )}

      {/* Rich Text */}
      {section_type === "rich_text" && (
        <div className="space-y-3">
          <Field label="HTML内容"><textarea value={config.content || ""} onChange={(e) => update("content", e.target.value)} rows={6} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm font-mono resize-none" placeholder="<p>支持HTML标签...</p>" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="背景色"><input type="color" value={config.backgroundColor || "#ffffff"} onChange={(e) => update("backgroundColor", e.target.value)} className="w-full h-9 rounded border border-background-200/70 cursor-pointer" /></Field>
            <Field label="内边距">
              <select value={config.padding || "medium"} onChange={(e) => update("padding", e.target.value)} className="w-full px-2 py-1.5 rounded border border-background-200/70 text-sm">
                <option value="small">小</option><option value="medium">中</option><option value="large">大</option>
              </select>
            </Field>
          </div>
        </div>
      )}

      {/* Announcement */}
      {section_type === "announcement" && (
        <div className="space-y-3">
          <Field label="公告文字"><textarea value={config.text || ""} onChange={(e) => update("text", e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm resize-none" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="背景色"><input type="color" value={config.backgroundColor || "#fff8e1"} onChange={(e) => update("backgroundColor", e.target.value)} className="w-full h-9 rounded border border-background-200/70 cursor-pointer" /></Field>
            <Field label="图标"><input type="text" value={config.icon || "ri-megaphone-line"} onChange={(e) => update("icon", e.target.value)} className="w-full px-2 py-1.5 rounded border border-background-200/70 text-sm" /></Field>
          </div>
          <Toggle label="可关闭" value={config.closable !== false} onChange={(v) => update("closable", v)} />
        </div>
      )}

      {/* Audio */}
      {section_type === "audio" && (
        <div className="space-y-3">
          <Field label="音频标题"><input type="text" value={config.title || ""} onChange={(e) => update("title", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm" /></Field>
          <Field label="音频URL"><input type="text" value={config.audioUrl || ""} onChange={(e) => update("audioUrl", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm" placeholder="https://..." /></Field>
          <ImageUploadField value={config.coverImage || ""} onChange={(v) => update("coverImage", v)} placeholder="封面图URL" />
        </div>
      )}

      {/* Video */}
      {section_type === "video" && (
        <div className="space-y-3">
          <Field label="视频标题"><input type="text" value={config.title || ""} onChange={(e) => update("title", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm" /></Field>
          <Field label="视频URL"><input type="text" value={config.videoUrl || ""} onChange={(e) => update("videoUrl", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm" placeholder="支持mp4/m3u8" /></Field>
          <ImageUploadField value={config.coverImage || ""} onChange={(v) => update("coverImage", v)} placeholder="封面图URL" />
          <Toggle label="自动播放" value={config.autoplay || false} onChange={(v) => update("autoplay", v)} />
        </div>
      )}

      {/* Knowledge Product */}
      {section_type === "knowledge_product" && (
        <div className="space-y-3">
          <Field label="显示数量"><input type="number" value={config.displayCount || 4} onChange={(e) => update("displayCount", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm" min={1} max={12} /></Field>
          <Field label="布局">
            <div className="flex gap-2">
              <Btn active={config.layout === "grid"} onClick={() => update("layout", "grid")}>网格</Btn>
              <Btn active={config.layout === "list"} onClick={() => update("layout", "list")}>列表</Btn>
            </div>
          </Field>
          <Field label="选择课程（留空则自动取最新）">
            <EntityPicker
              table="courses"
              titleField="title"
              imageField="cover_image"
              metaFormatter={(row) => (row.price ? `¥${row.price}` : "免费")}
              value={config.productIds || []}
              onChange={(ids) => update("productIds", ids)}
              emptyHint="留空则自动取最新"
            />
          </Field>
        </div>
      )}

      {/* Distribution Product */}
      {section_type === "distribution_product" && (
        <div className="space-y-3">
          <Field label="显示数量"><input type="number" value={config.displayCount || 4} onChange={(e) => update("displayCount", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm" min={1} max={12} /></Field>
          <Field label="选择商品">
            <EntityPicker
              table="product_items"
              titleField="name"
              metaFormatter={(row) => (row.price ? `¥${row.price}` : "")}
              value={config.productIds || []}
              onChange={(ids) => update("productIds", ids)}
              emptyHint="选择要展示的商品"
            />
          </Field>
        </div>
      )}

      {/* Live */}
      {section_type === "live" && (
        <div className="space-y-3">
          <Field label="直播标题"><input type="text" value={config.title || ""} onChange={(e) => update("title", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm" /></Field>
          <ImageUploadField value={config.coverImage || ""} onChange={(v) => update("coverImage", v)} placeholder="封面图URL" />
          <Field label="预定时间"><input type="datetime-local" value={config.scheduledTime || ""} onChange={(e) => update("scheduledTime", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm" /></Field>
          <Field label="状态">
            <select value={config.status || "upcoming"} onChange={(e) => update("status", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm">
              <option value="upcoming">即将开始</option><option value="live">直播中</option><option value="ended">已结束</option>
            </select>
          </Field>
        </div>
      )}

      {/* Coupon */}
      {section_type === "coupon" && (
        <div className="space-y-3">
          <Field label="样式">
            <div className="flex gap-2">
              <Btn active={config.style !== "inline"} onClick={() => update("style", "card")}>卡片式</Btn>
              <Btn active={config.style === "inline"} onClick={() => update("style", "inline")}>内联式</Btn>
            </div>
          </Field>
          <p className="text-xs font-medium text-foreground-500 pt-1">优惠券列表</p>
          {(config.coupons || []).map((coupon: any, i: number) => (
            <div key={i} className="p-3 rounded-lg bg-background-100 space-y-2">
              <div className="flex items-center justify-between"><span className="text-xs text-foreground-400">第 {i + 1} 张</span><button onClick={() => arrItemRemove("coupons", i)} className="text-red-400 hover:text-red-600 text-xs"><i className="ri-close-line"></i></button></div>
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={coupon.title || ""} onChange={(e) => arrItemUpdate("coupons", i, "title", e.target.value)} className="px-2 py-1.5 rounded border border-background-200/70 text-xs" placeholder="标题" />
                <input type="text" value={coupon.amount || ""} onChange={(e) => arrItemUpdate("coupons", i, "amount", e.target.value)} className="px-2 py-1.5 rounded border border-background-200/70 text-xs" placeholder="金额" />
                <input type="text" value={coupon.condition || ""} onChange={(e) => arrItemUpdate("coupons", i, "condition", e.target.value)} className="px-2 py-1.5 rounded border border-background-200/70 text-xs" placeholder="使用条件" />
                <input type="date" value={coupon.expireDate || ""} onChange={(e) => arrItemUpdate("coupons", i, "expireDate", e.target.value)} className="px-2 py-1.5 rounded border border-background-200/70 text-xs" />
              </div>
            </div>
          ))}
          <button onClick={() => arrItemAdd("coupons", { title: "新优惠券", amount: "10", condition: "满100可用", expireDate: "" })} className="w-full py-2 rounded-lg border border-dashed border-background-300 text-xs text-foreground-400 hover:text-foreground-600 transition-all"><i className="ri-add-line mr-1"></i>添加优惠券</button>
        </div>
      )}

      {/* Promotion */}
      {section_type === "promotion" && (
        <div className="space-y-3">
          <Field label="促销标题"><input type="text" value={config.title || ""} onChange={(e) => update("title", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm" /></Field>
          <Field label="结束时间"><input type="datetime-local" value={config.endTime || ""} onChange={(e) => update("endTime", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 text-sm" /></Field>
          <Field label="选择商品">
            <EntityPicker
              table="product_items"
              titleField="name"
              metaFormatter={(row) => (row.price ? `¥${row.price}` : "")}
              value={config.products || []}
              onChange={(ids) => update("products", ids)}
              emptyHint="选择促销商品"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="背景色"><input type="color" value={config.backgroundColor || "#ff6b35"} onChange={(e) => update("backgroundColor", e.target.value)} className="w-full h-9 rounded border border-background-200/70 cursor-pointer" /></Field>
            <div className="flex items-end"><label className="flex items-center gap-2 text-xs text-foreground-500"><input type="checkbox" checked={config.showCountdown !== false} onChange={(e) => update("showCountdown", e.target.checked)} className="rounded" />显示倒计时</label></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-foreground-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-foreground-500">{label}</label>
      <button onClick={() => onChange(!value)} className={`w-9 h-5 rounded-full transition-colors ${value ? "bg-primary-500" : "bg-background-300"}`}>
        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`}></div>
      </button>
    </div>
  );
}

function Btn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex-1 py-1.5 rounded-md text-xs border transition-all ${active ? "border-primary-500 bg-primary-50 text-primary-700" : "border-background-200/70 text-foreground-500"}`}>
      {children}
    </button>
  );
}

function ImageUploadField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <ImageUploader value={value} onChange={onChange} label="" placeholder={placeholder || "图片URL"} />;
}