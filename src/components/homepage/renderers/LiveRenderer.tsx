import { Link } from "react-router-dom";

interface LiveConfig {
  title?: string;
  coverImage?: string;
  scheduledTime?: string;
  status?: string;
}

export default function LiveRenderer({ config, isPreview = false }: { config: LiveConfig; isPreview?: boolean }) {
  const statusMap: Record<string, { label: string; color: string }> = {
    upcoming: { label: "即将开始", color: "bg-primary-100 text-primary-700" },
    live: { label: "直播中", color: "bg-red-100 text-red-600" },
    ended: { label: "已结束", color: "bg-foreground-100 text-foreground-500" },
  };
  const status = statusMap[config.status || "upcoming"];

  return (
    <section className={isPreview ? "py-3 px-3" : "py-10 px-4 md:px-6 max-w-4xl mx-auto"}>
      <div className="bg-background-50 rounded-2xl border border-background-200/70 overflow-hidden">
        <div className="relative aspect-video bg-background-100">
          {config.coverImage && <img src={config.coverImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
          <div className={`absolute ${isPreview ? "top-2 right-2" : "top-3 right-3"}`}><span className={`${isPreview ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"} rounded-full font-semibold ${status.color}`}>{status.label}</span></div>
          <div className={`absolute ${isPreview ? "bottom-2 left-3 right-3" : "bottom-4 left-4 right-4"}`}>
            <h3 className={`${isPreview ? "text-sm" : "text-lg md:text-xl"} font-bold text-white`}>{config.title || "直播标题"}</h3>
            {config.scheduledTime && <p className={`${isPreview ? "text-[10px]" : "text-sm"} text-white/70 mt-1`}><i className="ri-time-line mr-1"></i>{new Date(config.scheduledTime).toLocaleString("zh-CN")}</p>}
          </div>
        </div>
        <div className={isPreview ? "p-3" : "p-4"}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`${isPreview ? "w-7 h-7" : "w-8 h-8"} rounded-full bg-primary-100 flex items-center justify-center`}><i className={`ri-user-line ${isPreview ? "text-xs" : "text-sm"} text-primary-600`}></i></div>
              <span className={`${isPreview ? "text-xs" : "text-sm"} text-foreground-600`}>引力场官方</span>
            </div>
            {config.status === "upcoming" && <button className={`${isPreview ? "px-3 py-1.5 text-xs" : "px-5 py-2 text-sm"} rounded-full bg-primary-500 text-white font-semibold hover:bg-primary-600 transition-colors whitespace-nowrap`}>预约直播</button>}
            {config.status === "live" && <button className={`${isPreview ? "px-3 py-1.5 text-xs" : "px-5 py-2 text-sm"} rounded-full bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors whitespace-nowrap`}>进入直播间</button>}
          </div>
        </div>
      </div>
    </section>
  );
}