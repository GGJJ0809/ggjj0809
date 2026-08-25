import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { navGroups } from "@/mocks/admin";

function getPageTitle(pathname: string) {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.path === pathname) return item.label;
    }
  }
  return "风险控制台";
}

export default function AdminLayout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background-100 text-foreground-950">
      {/* 移动端遮罩 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground-950/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-background-50 border-r border-background-200 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-5 border-b border-background-200">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500 text-background-50">
            <i className="ri-shield-star-line text-lg" />
          </div>
          <div className="leading-tight">
            <p className="font-heading text-base font-bold tracking-tight">全球智盾</p>
            <p className="text-[11px] text-foreground-500">Global Shield · 管理后台</p>
          </div>
        </div>

        {/* 导航 */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.group} className="mb-5">
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-400">
                {group.group}
              </p>
              <div className="flex flex-col gap-1">
                {group.items.map((item) =>
                  item.available ? (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-primary-100 text-primary-700"
                            : "text-foreground-600 hover:bg-background-100 hover:text-foreground-900"
                        }`
                      }
                    >
                      <span className="flex h-5 w-5 items-center justify-center">
                        <i className={`${item.icon} text-base`} />
                      </span>
                      {item.label}
                    </NavLink>
                  ) : (
                    <div
                      key={item.path}
                      className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground-300"
                    >
                      <span className="flex h-5 w-5 items-center justify-center">
                        <i className={`${item.icon} text-base`} />
                      </span>
                      {item.label}
                      <span className="ml-auto rounded-full bg-background-200 px-2 py-0.5 text-[10px] text-foreground-400">
                        即将上线
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </nav>

        {/* 底部用户 */}
        <div className="border-t border-background-200 p-4">
          <div className="flex items-center gap-3 rounded-lg bg-background-100 px-3 py-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-500 text-background-50 text-sm font-semibold">
              王
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium">王总</p>
              <p className="truncate text-[11px] text-foreground-500">超级管理员</p>
            </div>
            <i className="ri-logout-box-r-line ml-auto text-foreground-400" />
          </div>
        </div>
      </aside>

      {/* 主区域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶部栏 */}
        <header className="flex h-16 items-center gap-4 border-b border-background-200 bg-background-50 px-4 md:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-foreground-700 hover:bg-background-100 lg:hidden"
          >
            <i className="ri-menu-line text-xl" />
          </button>

          <div className="min-w-0">
            <h1 className="font-heading text-lg font-bold leading-tight">{pageTitle}</h1>
            <p className="hidden text-[11px] text-foreground-500 sm:block">
              全球安全态势实时监控与运营管理
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* 搜索 */}
            <div className="relative hidden md:block">
              <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400" />
              <input
                type="text"
                placeholder="搜索会员 / 订单 / 事件…"
                className="h-9 w-64 rounded-md border border-background-200 bg-background-50 pl-9 pr-3 text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
              />
            </div>

            {/* 通知 */}
            <div className="relative">
              <button
                onClick={() => {
                  setNotifyOpen(!notifyOpen);
                  setUserOpen(false);
                }}
                className="relative flex h-9 w-9 items-center justify-center rounded-md text-foreground-700 hover:bg-background-100"
              >
                <i className="ri-notification-3-line text-lg" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-500 ring-2 ring-background-50" />
              </button>
              {notifyOpen && (
                <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-lg border border-background-200 bg-background-50 shadow-lg">
                  <div className="flex items-center justify-between border-b border-background-100 px-4 py-3">
                    <p className="text-sm font-semibold">通知中心</p>
                    <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-medium text-accent-900">
                      3 条未读
                    </span>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {[
                      { t: "P0 告警：刚果（金）东部冲突升级", d: "2 分钟前" },
                      { t: "P1 人员失联告警已派单", d: "15 分钟前" },
                      { t: "系统维护通知（今晚 23:00）", d: "1 小时前" },
                    ].map((n, i) => (
                      <div key={i} className="border-b border-background-100 px-4 py-3 hover:bg-background-100">
                        <p className="text-sm font-medium">{n.t}</p>
                        <p className="mt-0.5 text-[11px] text-foreground-500">{n.d}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 用户 */}
            <div className="relative">
              <button
                onClick={() => {
                  setUserOpen(!userOpen);
                  setNotifyOpen(false);
                }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-background-100"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary-500 text-background-50 text-sm font-semibold">
                  王
                </div>
                <div className="hidden text-left leading-tight sm:block">
                  <p className="text-sm font-medium">王总</p>
                  <p className="text-[11px] text-foreground-500">管理员</p>
                </div>
                <i className="ri-arrow-down-s-line text-foreground-400" />
              </button>
              {userOpen && (
                <div className="absolute right-0 top-12 z-50 w-48 overflow-hidden rounded-lg border border-background-200 bg-background-50 shadow-lg">
                  {["个人设置", "账号安全", "退出登录"].map((item) => (
                    <button
                      key={item}
                      className="flex w-full items-center px-4 py-2.5 text-left text-sm text-foreground-700 hover:bg-background-100"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* 内容 */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}