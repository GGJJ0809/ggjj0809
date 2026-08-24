import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { name: "首页", path: "/", icon: "ri-home-line" },
  { name: "课程", path: "/courses", icon: "ri-graduation-cap-line" },
  { name: "AI测评", path: "/agents", icon: "ri-robot-2-line" },
  { name: "商城", path: "/shop", icon: "ri-store-2-line" },
  { name: "会员", path: "/member", icon: "ri-vip-crown-line" },
];

function OrbitLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 48 48" className="w-full h-full">
        <circle
          cx="24" cy="24" r="18"
          fill="none"
          stroke="oklch(var(--primary-500))"
          strokeWidth="2.5"
        />
        <circle
          cx="24" cy="24" r="10"
          fill="none"
          stroke="oklch(var(--primary-400))"
          strokeWidth="2"
        />
        <circle
          cx="24" cy="24" r="4"
          fill="oklch(var(--primary-500))"
        />
        <circle
          cx="39" cy="9" r="3.5"
          fill="oklch(var(--primary-500))"
        />
        <circle
          cx="12" cy="42" r="2.5"
          fill="oklch(var(--primary-400))"
        />
        <circle
          cx="6" cy="18" r="2"
          fill="oklch(var(--primary-500) / 0.6)"
        />
      </svg>
    </div>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
    navigate("/");
  };

  return (
    <>
      {/* Desktop + Mobile Top Navbar */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-background-50/95 backdrop-blur-md shadow-sm shadow-foreground-500/5"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <OrbitLogo className="w-8 h-8 md:w-9 md:h-9" />
            <div className="flex flex-col leading-none">
              <span className="font-display font-black text-[15px] md:text-[17px] text-foreground-900 tracking-wide uppercase">
                Nuclechain
              </span>
              <span className="text-[11px] md:text-xs text-foreground-500 font-medium tracking-widest">
                引力场
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  isActive(item.path)
                    ? "bg-primary-500 text-white"
                    : "text-foreground-600 hover:text-foreground-950 hover:bg-background-100"
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-background-100 hover:bg-background-200/70 transition-colors"
                >
                  <span className="w-8 h-8 rounded-full bg-primary-500 text-white text-sm font-bold flex items-center justify-center">
                    {(user.user_metadata?.nickname || user.email || "用").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-sm font-medium text-foreground-800 max-w-[100px] truncate">
                    {user.user_metadata?.nickname || "用户"}
                  </span>
                  <i className={`ri-arrow-down-s-line text-foreground-400 transition-transform ${menuOpen ? "rotate-180" : ""}`}></i>
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)}></div>
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl border border-background-200/70 shadow-lg overflow-hidden z-50">
                      <button
                        onClick={() => navigate("/member")}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground-700 hover:bg-background-50 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-user-3-line text-base"></i>
                        个人中心
                      </button>
                      <button
                        onClick={() => navigate("/shop/orders")}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground-700 hover:bg-background-50 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-file-list-3-line text-base"></i>
                        我的订单
                      </button>
                      <div className="border-t border-background-200/70">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
                        >
                          <i className="ri-logout-box-r-line text-base"></i>
                          退出登录
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link
                to={`/auth?redirect=${encodeURIComponent(location.pathname)}`}
                className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap"
              >
                登录 / 注册
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background-50/95 backdrop-blur-md border-t border-background-200/70">
        <div className="flex items-center justify-around py-2 pb-[env(safe-area-inset-bottom,8px)]">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all min-w-[48px] ${
                isActive(item.path)
                  ? "text-primary-500"
                  : "text-foreground-400 hover:text-foreground-600"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isActive(item.path) ? "bg-primary-100" : ""
              }`}>
                <i className={`${item.icon} text-xl`}></i>
              </div>
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}