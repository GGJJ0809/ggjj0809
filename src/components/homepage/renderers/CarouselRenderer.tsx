import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

interface CarouselConfig {
  slides?: { image: string; link?: string; alt?: string }[];
  autoplay?: boolean;
  interval?: number;
  showDots?: boolean;
  height?: number;
}

export default function CarouselRenderer({ config, isPreview = false }: { config: CarouselConfig; isPreview?: boolean }) {
  const [current, setCurrent] = useState(0);
  const slides = config.slides || [];
  const autoplay = config.autoplay !== false;
  const interval = config.interval || 3000;
  const height = isPreview ? Math.min(config.height || 200, 200) : (config.height || 500);

  useEffect(() => {
    if (!autoplay || slides.length <= 1) return;
    const timer = setInterval(() => setCurrent((p) => (p + 1) % slides.length), interval);
    return () => clearInterval(timer);
  }, [autoplay, interval, slides.length]);

  if (slides.length === 0) return null;

  return (
    <section className={`relative w-full overflow-hidden ${isPreview ? "" : ""}`} style={{ height: `${height}px` }}>
      {slides.map((slide, i) => (
        <div key={i} className={`absolute inset-0 transition-opacity duration-700 ${i === current ? "opacity-100" : "opacity-0"}`}>
          {slide.link ? (
            <Link to={slide.link}><img src={slide.image} alt={slide.alt || ""} className="w-full h-full object-cover" /></Link>
          ) : (
            <img src={slide.image} alt={slide.alt || ""} className="w-full h-full object-cover" />
          )}
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/20 pointer-events-none"></div>
      {config.showDots !== false && slides.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          {slides.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)} className={`w-2.5 h-2.5 rounded-full transition-all ${i === current ? "bg-white w-6" : "bg-white/50 hover:bg-white/80"}`}></button>
          ))}
        </div>
      )}
      {slides.length > 1 && (
        <>
          <button onClick={() => setCurrent((p) => (p - 1 + slides.length) % slides.length)} className={`absolute left-2 md:left-6 top-1/2 -translate-y-1/2 ${isPreview ? "w-8 h-8 text-sm" : "w-10 h-10"} rounded-full bg-white/20 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/40 transition-all`}>
            <i className={`ri-arrow-left-s-line ${isPreview ? "text-base" : "text-xl"}`}></i>
          </button>
          <button onClick={() => setCurrent((p) => (p + 1) % slides.length)} className={`absolute right-2 md:right-6 top-1/2 -translate-y-1/2 ${isPreview ? "w-8 h-8 text-sm" : "w-10 h-10"} rounded-full bg-white/20 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/40 transition-all`}>
            <i className={`ri-arrow-right-s-line ${isPreview ? "text-base" : "text-xl"}`}></i>
          </button>
        </>
      )}
    </section>
  );
}