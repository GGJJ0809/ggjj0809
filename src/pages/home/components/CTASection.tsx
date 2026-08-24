import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

export default function CTASection() {
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
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="py-16 md:py-24 bg-background-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="bg-accent-950 rounded-3xl p-8 md:p-14 relative overflow-hidden">
          {/* Decorative */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div data-animate>
              <h2 className="font-heading font-bold text-2xl md:text-3xl text-white mb-3">
                准备好开始你的影响力之旅了吗？
              </h2>
              <p className="text-sm text-foreground-300 leading-relaxed mb-6 max-w-md">
                加入引力场，与 10,000+ 影响力增长者一起，找到你的核心、建立你的网络、扩大你的影响力。现在注册即可免费体验 AI 教练和基础课程。
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/ai-agent"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary-500 text-white font-medium text-sm hover:bg-primary-600 transition-all whitespace-nowrap"
                >
                  <span>免费体验 AI 教练</span>
                  <i className="ri-arrow-right-line"></i>
                </Link>
                <Link
                  to="/courses"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-foreground-400/30 text-foreground-200 font-medium text-sm hover:bg-white/10 transition-all whitespace-nowrap"
                >
                  <span>浏览全部课程</span>
                </Link>
              </div>
            </div>

            <div
              data-animate
              className="flex items-center justify-center md:justify-end"
            >
              <div className="relative">
                <div className="w-40 h-40 md:w-52 md:h-52 rounded-3xl overflow-hidden border-2 border-primary-500/30">
                  <img
                    src="https://readdy.ai/api/search-image?query=Confident%20Asian%20businesswoman%20smiling%20warmly%2C%20soft%20warm%20studio%20lighting%2C%20clean%20neutral%20background%2C%20professional%20headshot%20style%2C%20approachable%20friendly%20expression&width=400&height=400&seq=cta-person&orientation=squarish"
                    alt="引力场学员"
                    className="w-full h-full object-cover object-top"
                  />
                </div>
                <div className="absolute -bottom-3 -left-3 bg-white rounded-xl shadow-lg p-3 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <i className="ri-user-add-line text-green-600 text-sm"></i>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground-800">今日新增</p>
                    <p className="text-[10px] text-foreground-400">+128 位新学员</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}