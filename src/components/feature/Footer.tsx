import { Link } from "react-router-dom";

const footerLinks = [
  {
    title: "产品",
    links: [
      { name: "课程中心", path: "/courses" },
      { name: "AI教练", path: "/ai-agent" },
      { name: "线下活动", path: "/activities" },
      { name: "会员体系", path: "/member" },
    ],
  },
  {
    title: "资源",
    links: [
      { name: "帮助中心", path: "#" },
      { name: "使用指南", path: "#" },
      { name: "API文档", path: "#" },
      { name: "更新日志", path: "#" },
    ],
  },
  {
    title: "关于",
    links: [
      { name: "关于我们", path: "#" },
      { name: "合作伙伴", path: "#" },
      { name: "加入我们", path: "#" },
      { name: "联系方式", path: "#" },
    ],
  },
];

function OrbitLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 48 48" className="w-full h-full">
        <circle cx="24" cy="24" r="18" fill="none" stroke="oklch(var(--primary-500))" strokeWidth="2.5" />
        <circle cx="24" cy="24" r="10" fill="none" stroke="oklch(var(--primary-400))" strokeWidth="2" />
        <circle cx="24" cy="24" r="4" fill="oklch(var(--primary-500))" />
        <circle cx="39" cy="9" r="3.5" fill="oklch(var(--primary-500))" />
        <circle cx="12" cy="42" r="2.5" fill="oklch(var(--primary-400))" />
        <circle cx="6" cy="18" r="2" fill="oklch(var(--primary-500) / 0.6)" />
      </svg>
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="brand-navy-section relative overflow-hidden">
      {/* Decorative ripple */}
      <div className="absolute inset-0 pointer-events-none opacity-30">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full"
          style={{
            background: `repeating-radial-gradient(
              circle at center,
              transparent 0,
              transparent 60px,
              oklch(var(--primary-500) / 0.06) 60px,
              oklch(var(--primary-500) / 0.06) 61px
            )`,
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <OrbitLogo className="w-8 h-8" />
              <div className="flex flex-col leading-none">
                <span className="font-display font-black text-base text-white tracking-wide uppercase">
                  Nuclechain
                </span>
                <span className="text-[11px] text-foreground-300 font-medium tracking-widest">
                  引力场
                </span>
              </div>
            </div>
            <p className="text-sm text-foreground-300 leading-relaxed mb-4">
              Find your core. Build your network. Grow your influence.
            </p>
            <div className="flex items-center gap-3">
              <a href="#" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-foreground-300 hover:text-white hover:bg-primary-500 transition-all">
                <i className="ri-wechat-fill text-lg"></i>
              </a>
              <a href="#" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-foreground-300 hover:text-white hover:bg-primary-500 transition-all">
                <i className="ri-weibo-fill text-lg"></i>
              </a>
              <a href="#" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-foreground-300 hover:text-white hover:bg-primary-500 transition-all">
                <i className="ri-linkedin-fill text-lg"></i>
              </a>
            </div>
          </div>

          {/* Links */}
          {footerLinks.map((group) => (
            <div key={group.title}>
              <h4 className="font-heading font-semibold text-sm text-white mb-4">
                {group.title}
              </h4>
              <ul className="flex flex-col gap-2.5">
                {group.links.map((link) => (
                  <li key={link.name}>
                    <Link
                      to={link.path}
                      className="text-sm text-foreground-300 hover:text-primary-400 transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 mt-10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-foreground-400">
            &copy; 2026 Nuclechain 引力场. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-foreground-400">
            <Link to="#" className="hover:text-foreground-200 transition-colors">隐私政策</Link>
            <Link to="#" className="hover:text-foreground-200 transition-colors">服务条款</Link>
            <Link to="#" className="hover:text-foreground-200 transition-colors">ICP备案</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}