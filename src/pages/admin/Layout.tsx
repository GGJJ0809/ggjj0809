import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

const menuItems = [
  { name: "仪表盘", path: "/admin", icon: "ri-dashboard-line" },
  { name: "网站设计", path: "/admin/design", icon: "ri-layout-masonry-line" },
  { name: "Agent管理", path: "/admin/agents", icon: "ri-robot-2-line" },
  { name: "C库（能力库）", path: "/admin/libraries/c", icon: "ri-file-settings-line", group: "共享库" },
  { name: "K库（知识库）", path: "/admin/libraries/k", icon: "ri-book-2-line", group: "共享库" },
  { name: "Q库（问答库）", path: "/admin/libraries/q", icon: "ri-questionnaire-line", group: "共享库" },
  { name: "D库（档案库）", path: "/admin/libraries/d", icon: "ri-folder-user-line", group: "共享库" },
  { name: "分类管理", path: "/admin/categories", icon: "ri-folder-line" },
  { name: "章节管理", path: "/admin/chapters", icon: "ri-book-open-line" },
  { name: "内容素材库", path: "/admin/assets", icon: "ri-folder-music-line" },
  { name: "课程管理", path: "/admin/courses", icon: "ri-graduation-cap-line" },
  { name: "专栏管理", path: "/admin/columns", icon: "ri-stack-line" },
  { name: "AI 模型", path: "/admin/ai-models", icon: "ri-cpu-line" },
  { name: "活动管理", path: "/admin/activities", icon: "ri-calendar-event-line" },
  { name: "测评管理", path: "/admin/assessments", icon: "ri-file-chart-line" },
  { name: "会员管理", path: "/admin/members", icon: "ri-vip-crown-line" },
  { name: "积分管理", path: "/admin/points", icon: "ri-coin-line" },
  { name: "直播管理", path: "/admin/live", icon: "ri-live-line" },
  { name: "商品管理", path: "/admin/products", icon: "ri-store-2-line" },
  { name: "交易管理", path: "/admin/orders", icon: "ri-exchange-dollar-line" },
  { name: "分销管理", path: "/admin/affiliates", icon: "ri-share-forward-line" },
  { name: "系统配置", path: "/admin/settings", icon: "ri-settings-3-line" },
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

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isActive = (path: string) => {
    if (path === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_username");
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="flex h-screen bg-background-50 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarCollapsed ? "w-[72px]" : "w-[240px]"
        } shrink-0 bg-accent-950 flex flex-col transition-all duration-300`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-white/10 shrink-0">
          <OrbitLogo className="w-8 h-8 shrink-0" />
          {!sidebarCollapsed && (
            <div className="flex flex-col leading-none">
              <span className="font-display font-black text-sm text-white tracking-wide uppercase">
                Nuclechain
              </span>
              <span className="text-[10px] text-foreground-400 font-medium tracking-widest">
                引力场
              </span>
            </div>
          )}
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {(() => {
            let lastGroup = "";
            return menuItems.map((item) => {
              const showGroup = item.group && item.group !== lastGroup;
              if (item.group) lastGroup = item.group;
              return (
                <div key={item.path}>
                  {showGroup && item.group && !sidebarCollapsed && (
                    <div className="px-3 py-2 mt-2 text-[10px] font-bold text-foreground-500 uppercase tracking-widest">
                      {item.group}
                    </div>
                  )}
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-all whitespace-nowrap ${
                      isActive(item.path)
                        ? "bg-primary-500 text-white"
                        : "text-foreground-300 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <div className="w-5 flex items-center justify-center shrink-0">
                      <i className={`${item.icon} text-base`}></i>
                    </div>
                    {!sidebarCollapsed && <span>{item.name}</span>}
                  </Link>
                </div>
              );
            });
          })()}
        </nav>

        {/* Collapse Toggle + Logout */}
        <div className="p-3 border-t border-white/10 space-y-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-foreground-400 hover:text-white hover:bg-white/10 transition-all text-sm"
          >
            <i className="ri-logout-box-r-line text-lg"></i>
            {!sidebarCollapsed && <span className="whitespace-nowrap">退出登录</span>}
          </button>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-foreground-400 hover:text-white hover:bg-white/10 transition-all text-sm"
          >
            <i className={`ri-${sidebarCollapsed ? "sidebar-unfold" : "sidebar-fold"}-line text-lg`}></i>
            {!sidebarCollapsed && <span className="whitespace-nowrap">收起菜单</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}