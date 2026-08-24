import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { buildInfo } from '@/buildInfo';

interface NavItem {
  label: string;
  icon: string;
  path?: string;
  children?: { label: string; path: string; icon: string }[];
}

const navItems: NavItem[] = [
  {
    label: '仪表盘',
    icon: 'ri-dashboard-3-line',
    path: '/',
  },
  {
    label: '环境监测',
    icon: 'ri-temp-hot-line',
    children: [
      { label: '空气质量监测', path: '/environment/air-quality', icon: 'ri-lungs-line' },
      { label: '传感器管理', path: '/environment/sensors', icon: 'ri-sensor-line' },
      { label: '报警管理', path: '/environment/alarms', icon: 'ri-alarm-warning-line' },
    ],
  },
  {
    label: '视频监控',
    icon: 'ri-eye-2-line',
    children: [
      { label: '视频监控', path: '/behavior/video', icon: 'ri-camera-line' },
    ],
  },
  {
    label: '餐饮管理',
    icon: 'ri-restaurant-line',
    children: [
      { label: '菜品信息管理', path: '/catering/dishes', icon: 'ri-bowl-line' },
      { label: '智能取餐管理', path: '/catering/tray-tracking', icon: 'ri-inbox-archive-line' },
      { label: '餐段时间配置', path: '/catering/meal-period-config', icon: 'ri-time-line' },
      { label: '周菜单配置', path: '/catering/weekly-menu', icon: 'ri-calendar-check-line' },
      { label: '智能留样管理', path: '/catering/samples', icon: 'ri-archive-line' },
      { label: '留样柜实时状态', path: '/catering/keep-status', icon: 'ri-temp-cold-line' },
      { label: '食材验收管理', path: '/catering/acceptance', icon: 'ri-scales-line' },
      { label: '电子秤操作员', path: '/catering/scale-operators', icon: 'ri-user-line' },
      { label: '炊事人员管理', path: '/catering/staff', icon: 'ri-team-line' },
      { label: '入库记录', path: '/catering/inbound-records', icon: 'ri-archive-drawer-line' },
      { label: '入库产品管理', path: '/catering/inbound-materials', icon: 'ri-inbox-2-line' },
      { label: '供应商管理', path: '/catering/suppliers', icon: 'ri-store-2-line' },
      { label: '仓库管理', path: '/catering/warehouses', icon: 'ri-home-6-line' },
      { label: '点餐记录', path: '/catering/order-records', icon: 'ri-file-list-3-line' },
      { label: '用户建议', path: '/catering/suggestions', icon: 'ri-lightbulb-line' },
      { label: '电子屏界面测试', path: '/catering/screen-test', icon: 'ri-smartphone-line' },
    ],
  },
  {
    label: '信息公示',
    icon: 'ri-tv-2-line',
    children: [
      { label: '内容管理', path: '/information/content', icon: 'ri-file-text-line' },
      { label: '屏幕管理', path: '/information/screens', icon: 'ri-computer-line' },
    ],
  },
  {
    label: '大屏展示',
    icon: 'ri-tv-2-line',
    children: [
      { label: '智慧食堂监控大屏', path: '/display', icon: 'ri-tv-2-line' },
      { label: '传感器数据大屏', path: '/display2', icon: 'ri-sensor-line' },
      { label: '竖屏点餐大屏', path: '/display3', icon: 'ri-restaurant-2-line' },
      { label: '综合运营大屏', path: '/display4', icon: 'ri-dashboard-2-line' },
      { label: '菜品评价大屏', path: '/display5', icon: 'ri-emotion-happy-line' },
      { label: '时令节气配置', path: '/display/season-config', icon: 'ri-calendar-todo-line' },
      { label: '财务概览配置', path: '/display/finance-config', icon: 'ri-bar-chart-box-line' },
      { label: '滚动通知配置', path: '/display/ticker-config', icon: 'ri-notification-3-line' },
      { label: '本餐特色设置', path: '/display/featured-dishes', icon: 'ri-star-fill' },
    ],
  },
  {
    label: '系统管理',
    icon: 'ri-settings-3-line',
    children: [
      { label: '用户与权限', path: '/system/users', icon: 'ri-user-settings-line' },
      { label: '数据库管理', path: '/system/database', icon: 'ri-database-2-line' },
      { label: '系统设置', path: '/system/settings', icon: 'ri-tools-line' },
    ],
  },
];

export default function Sidebar() {
  const location = useLocation();
  const [openMenus, setOpenMenus] = useState<string[]>(['环境监测', '视频监控', '餐饮管理']);

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const isChildActive = (children: NavItem['children']) =>
    children?.some((c) => location.pathname === c.path);

  return (
    <aside className="w-60 min-h-screen bg-slate-900 flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
        <div className="w-9 h-9 flex items-center justify-center bg-emerald-500 rounded-lg">
          <i className="ri-restaurant-fill text-white text-lg" />
        </div>
        <div>
          <p className="text-white text-sm font-semibold leading-tight">智慧食堂</p>
          <p className="text-slate-400 text-xs">管理系统</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item) => (
          <div key={item.label}>
            {item.path ? (
              <NavLink
                to={item.path}
                end
                className={({ isActive }) =>
                  `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600/20 text-emerald-400 border-r-2 border-emerald-400'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`
                }
              >
                <i className={`${item.icon} text-base w-4 h-4 flex items-center justify-center`} />
                <span>{item.label}</span>
              </NavLink>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => toggleMenu(item.label)}
                  className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors cursor-pointer ${
                    isChildActive(item.children)
                      ? 'text-emerald-400'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <i className={`${item.icon} text-base w-4 h-4 flex items-center justify-center`} />
                  <span className="flex-1 text-left">{item.label}</span>
                  <i
                    className={`ri-arrow-right-s-line transition-transform text-slate-500 ${
                      openMenus.includes(item.label) ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                {openMenus.includes(item.label) && item.children && (
                  <div className="bg-slate-950/40">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        className={({ isActive }) =>
                          `flex items-center gap-3 pl-12 pr-5 py-2 text-xs transition-colors cursor-pointer ${
                            isActive
                              ? 'text-emerald-400 bg-emerald-600/10'
                              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                          }`
                        }
                      >
                        <i className={`${child.icon} w-3 h-3 flex items-center justify-center`} />
                        <span>{child.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </nav>

      {/* Bottom status */}
      <div className="px-5 py-4 border-t border-slate-800">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          <span className="text-xs text-slate-400">系统运行正常</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-700">
              <i className="ri-user-line text-slate-300 text-xs" />
            </div>
            <div>
              <p className="text-xs text-slate-300 font-medium">管理员</p>
              <p className="text-xs text-slate-500">admin@canteen.com</p>
            </div>
          </div>
          <div className="text-right group relative cursor-default">
            <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
              v{buildInfo.version}
            </span>
            <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50">
              <div className="bg-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                <p className="font-mono">v{buildInfo.version}</p>
                <p className="text-slate-400 mt-0.5">构建时间</p>
                <p className="font-mono">{buildInfo.buildTime}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}