import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

export default function HeroSection() {
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
      { threshold: 0.1 }
    );

    const elements = sectionRef.current?.querySelectorAll("[data-animate]");
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[600px] md:min-h-[720px] flex items-center overflow-hidden bg-background-50"
    >
      {/* Background decorative elements */}
      <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-primary-100/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[300px] h-[300px] bg-accent-100/30 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 md:px-6 w-full py-20 md:py-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* Left: Text Content */}
          <div className="order-2 md:order-1">
            <div
              data-animate
              className="opacity-0"
              style={{ animationDelay: "0.1s" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-primary-500" />
                <span className="text-xs font-medium tracking-widest text-primary-600 uppercase">
                  NUCLECHAIN
                </span>
              </div>

              <h1 className="font-heading font-bold text-4xl md:text-5xl lg:text-6xl text-foreground-950 leading-tight tracking-tight">
                Find your core.
                <br />
                Build your network.
                <br />
                <span className="text-primary-500">Grow your influence.</span>
              </h1>

              <p className="mt-5 text-base md:text-lg text-foreground-500 max-w-lg leading-relaxed">
                找到你的核心，建立你的网络，扩大你的影响力。引力场通过 AI 智能体辅导、系统化课程与成长社区，助你打造不可替代的个人 IP。
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  to="/ai-agent"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary-500 text-white font-medium text-sm hover:bg-primary-600 transition-all whitespace-nowrap"
                >
                  <span>Start Your Journey</span>
                  <i className="ri-arrow-right-line"></i>
                </Link>
                <button className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-background-300 text-foreground-700 font-medium text-sm hover:bg-background-100 transition-all whitespace-nowrap">
                  <i className="ri-play-circle-line text-lg"></i>
                  <span>Watch Video</span>
                </button>
              </div>

              {/* Stats */}
              <div className="mt-10 flex items-center gap-6 md:gap-10">
                <div>
                  <p className="font-heading font-bold text-2xl md:text-3xl text-foreground-950">
                    10,000+
                  </p>
                  <p className="text-xs text-foreground-400 mt-0.5">学员加入</p>
                </div>
                <div className="w-px h-10 bg-background-200" />
                <div>
                  <p className="font-heading font-bold text-2xl md:text-3xl text-foreground-950">
                    50+
                  </p>
                  <p className="text-xs text-foreground-400 mt-0.5">精品课程</p>
                </div>
                <div className="w-px h-10 bg-background-200" />
                <div>
                  <p className="font-heading font-bold text-2xl md:text-3xl text-foreground-950">
                    8
                  </p>
                  <p className="text-xs text-foreground-400 mt-0.5">AI 测评工具</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Hero Image */}
          <div
            data-animate
            className="order-1 md:order-2 opacity-0 relative"
            style={{ animationDelay: "0.3s" }}
          >
            <div className="relative aspect-[4/5] md:aspect-[3/4] max-w-md mx-auto md:max-w-none rounded-3xl overflow-hidden">
              <img
                src="https://readdy.ai/api/search-image?query=Confident%20Asian%20businesswoman%20in%20elegant%20beige%20blazer%20holding%20coffee%20cup%2C%20looking%20upward%20with%20inspirational%20expression%2C%20soft%20warm%20golden%20lighting%2C%20clean%20minimal%20background%2C%20editorial%20fashion%20photography%20style%2C%20warm%20neutral%20tones&width=800&height=1000&seq=hero-person-2026-nc&orientation=portrait"
                alt="引力场品牌代言"
                className="w-full h-full object-cover object-top rounded-3xl"
              />
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-background-50/40 via-transparent to-transparent" />
            </div>

            {/* Floating badge */}
            <div className="absolute -bottom-4 -left-4 md:bottom-8 md:-left-8 bg-white rounded-2xl shadow-lg p-4 flex items-center gap-3 animate-float">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                <i className="ri-robot-2-line text-primary-600 text-lg"></i>
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground-800">AI Coach</p>
                <p className="text-[10px] text-foreground-400">凯特教练在线</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}