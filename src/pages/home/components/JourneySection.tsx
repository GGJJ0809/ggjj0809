import { useEffect, useRef } from "react";

const journeySteps = [
  {
    step: "01",
    en: "Discover Core",
    cn: "自我认识",
    icon: "ri-user-search-line",
  },
  {
    step: "02",
    en: "Clarify Direction",
    cn: "商业验证",
    icon: "ri-compass-discover-line",
  },
  {
    step: "03",
    en: "Build Value Core",
    cn: "价值内核确认",
    icon: "ri-shield-star-line",
  },
  {
    step: "04",
    en: "Share Your Value",
    cn: "内容传播",
    icon: "ri-share-forward-line",
  },
  {
    step: "05",
    en: "Grow Your Network",
    cn: "链接网络",
    icon: "ri-group-line",
  },
  {
    step: "06",
    en: "Accumulate Assets",
    cn: "资产沉淀",
    icon: "ri-database-2-line",
  },
];

export default function JourneySection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-fade-in-up");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    const elements = sectionRef.current?.querySelectorAll("[data-animate]");
    elements?.forEach((el, i) => {
      (el as HTMLElement).style.animationDelay = `${0.1 + i * 0.08}s`;
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="py-16 md:py-24 bg-background-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-12 md:mb-16" data-animate>
          <p className="text-xs font-medium tracking-widest text-primary-600 uppercase mb-2">
            Our Journey
          </p>
          <h2 className="font-heading font-bold text-2xl md:text-3xl text-foreground-950">
            引力场成长路径
          </h2>
          <p className="mt-2 text-sm text-foreground-400">
            六步系统，从自我认知到影响力资产沉淀
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 md:p-10 shadow-sm border border-background-100">
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-2">
            {journeySteps.map((item, index) => (
              <div key={item.step} className="flex items-center gap-2 md:gap-2">
                <div
                  data-animate
                  className="opacity-0 flex flex-col items-center text-center group cursor-pointer"
                >
                  <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-background-50 border border-background-200 flex items-center justify-center mb-2 group-hover:border-primary-300 group-hover:bg-primary-50 transition-all">
                    <i className={`${item.icon} text-xl md:text-2xl text-primary-500`}></i>
                  </div>
                  <span className="text-[10px] font-semibold text-foreground-400">
                    {item.step}
                  </span>
                  <p className="text-xs md:text-sm font-semibold text-foreground-800 mt-0.5 whitespace-nowrap">
                    {item.en}
                  </p>
                  <p className="text-[10px] text-foreground-400 whitespace-nowrap">
                    {item.cn}
                  </p>
                </div>

                {index < journeySteps.length - 1 && (
                  <div className="hidden md:flex items-center text-foreground-300 mx-1">
                    <i className="ri-arrow-right-s-line text-lg"></i>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}