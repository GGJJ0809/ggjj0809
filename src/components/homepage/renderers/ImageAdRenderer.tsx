import { Link } from "react-router-dom";

interface ImageAdConfig {
  image?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  buttonText?: string;
  buttonLink?: string;
  layout?: string;
}

export default function ImageAdRenderer({ config, isPreview = false }: { config: ImageAdConfig; isPreview?: boolean }) {
  const isLeft = config.layout !== "right-left";
  const imageEl = config.image ? (
    <div className={`flex-1 ${isPreview ? "min-h-[120px]" : "min-h-[200px] md:min-h-[300px]"} rounded-2xl overflow-hidden`}>
      <img src={config.image} alt="" className="w-full h-full object-cover" />
    </div>
  ) : null;
  const textEl = (
    <div className={`flex-1 flex flex-col justify-center ${isPreview ? "gap-2 py-2" : "gap-3 md:gap-4 py-4"}`}>
      {config.subtitle && <p className={`${isPreview ? "text-[10px]" : "text-xs md:text-sm"} font-semibold text-primary-600 uppercase tracking-wider`}>{config.subtitle}</p>}
      {config.title && <h2 className={`${isPreview ? "text-base" : "text-xl md:text-3xl"} font-heading font-bold text-foreground-950`}>{config.title}</h2>}
      {config.description && <p className={`${isPreview ? "text-xs leading-relaxed" : "text-sm md:text-base leading-relaxed"} text-foreground-500`}>{config.description}</p>}
      {config.buttonText && <Link to={config.buttonLink || "#"} className={`self-start ${isPreview ? "px-4 py-1.5 text-xs" : "px-6 py-2.5 text-sm"} rounded-full bg-primary-500 text-white font-semibold hover:bg-primary-600 transition-colors whitespace-nowrap`}>{config.buttonText}</Link>}
    </div>
  );

  return (
    <section className={isPreview ? "py-3 px-3" : "py-10 md:py-14 px-4 md:px-6 max-w-7xl mx-auto"}>
      <div className={`flex ${isPreview ? "flex-col gap-3" : "flex-col md:flex-row gap-6 md:gap-10"} items-center bg-background-50 rounded-3xl ${isPreview ? "p-4" : "p-6 md:p-10"} border border-background-200/70`}>
        {isLeft ? imageEl : textEl}
        {isLeft ? textEl : imageEl}
      </div>
    </section>
  );
}