interface AudioConfig {
  title?: string;
  audioUrl?: string;
  coverImage?: string;
}

export function AudioRenderer({ config, isPreview = false }: { config: AudioConfig; isPreview?: boolean }) {
  return (
    <section className={isPreview ? "py-3 px-3" : "py-10 px-4 md:px-6 max-w-2xl mx-auto"}>
      <div className={`bg-background-50 rounded-2xl border border-background-200/70 ${isPreview ? "p-3" : "p-5 md:p-6"}`}>
        {config.coverImage && (
          <div className={`w-full ${isPreview ? "h-28" : "h-40 md:h-48"} rounded-xl overflow-hidden mb-3`}>
            <img src={config.coverImage} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        {config.title && <h3 className={`${isPreview ? "text-sm" : "text-base md:text-lg"} font-semibold text-foreground-900 mb-2`}>{config.title}</h3>}
        {config.audioUrl ? (
          <audio controls className="w-full" src={config.audioUrl}>您的浏览器不支持音频播放</audio>
        ) : (
          <div className={`w-full ${isPreview ? "h-10" : "h-12"} bg-background-100 rounded-lg flex items-center justify-center text-xs text-foreground-400`}>
            <i className="ri-music-line mr-2"></i>音频URL待配置
          </div>
        )}
      </div>
    </section>
  );
}

interface VideoConfig {
  title?: string;
  videoUrl?: string;
  coverImage?: string;
  autoplay?: boolean;
}

export function VideoRenderer({ config, isPreview = false }: { config: VideoConfig; isPreview?: boolean }) {
  return (
    <section className={isPreview ? "py-3 px-3" : "py-10 px-4 md:px-6 max-w-4xl mx-auto"}>
      <div className="bg-background-50 rounded-2xl border border-background-200/70 overflow-hidden">
        {config.videoUrl ? (
          <video controls autoPlay={config.autoplay || false} poster={config.coverImage || ""} className="w-full aspect-video object-cover" src={config.videoUrl}>您的浏览器不支持视频播放</video>
        ) : (
          <div className="relative w-full aspect-video bg-background-100 flex items-center justify-center">
            {config.coverImage && <img src={config.coverImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />}
            <div className="relative z-10 flex flex-col items-center gap-3">
              <div className={`${isPreview ? "w-12 h-12" : "w-16 h-16"} rounded-full bg-primary-500 flex items-center justify-center shadow-lg`}><i className={`ri-play-fill ${isPreview ? "text-lg" : "text-2xl"} text-white ml-0.5`}></i></div>
              {config.title && <p className={`${isPreview ? "text-xs" : "text-sm"} font-medium text-foreground-700`}>{config.title}</p>}
            </div>
          </div>
        )}
        {config.title && config.videoUrl && <div className={`${isPreview ? "px-3 py-2" : "px-5 py-3"}`}><h3 className={`${isPreview ? "text-xs" : "text-sm"} font-semibold text-foreground-900`}>{config.title}</h3></div>}
      </div>
    </section>
  );
}