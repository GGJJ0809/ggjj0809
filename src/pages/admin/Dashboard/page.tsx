import { Link } from "react-router-dom";

const stats = [
  { label: "今日访问", value: "1,284", icon: "ri-eye-line", color: "bg-primary-500", textColor: "text-primary-500" },
  { label: "课程总数", value: "24", icon: "ri-graduation-cap-line", color: "bg-accent-500", textColor: "text-accent-500" },
  { label: "AI 调用", value: "3,852", icon: "ri-robot-2-line", color: "bg-accent-500", textColor: "text-foreground-900" },
  { label: "会员数", value: "486", icon: "ri-vip-crown-line", color: "bg-primary-500", textColor: "text-primary-500" },
  { label: "订单数", value: "128", icon: "ri-exchange-dollar-line", color: "bg-accent-500", textColor: "text-accent-500" },
  { label: "活动数", value: "8", icon: "ri-calendar-event-line", color: "bg-accent-500", textColor: "text-foreground-900" },
];

const quickLinks = [
  { name: "编辑首页", path: "/admin/design", icon: "ri-layout-masonry-line", desc: "拖拽组件，实时预览首页效果" },
  { name: "管理课程", path: "/admin/courses", icon: "ri-graduation-cap-line", desc: "发布课程、管理章节和课时" },
  { name: "配置 AI", path: "/admin/ai-tools", icon: "ri-robot-2-line", desc: "设置 AI 工具提示词和权限" },
  { name: "发布活动", path: "/admin/activities", icon: "ri-calendar-event-line", desc: "创建活动、管理报名" },
];

export default function Dashboard() {
  return (
    <div className="p-6 md:p-8 bg-background-50 min-h-full">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground-900">仪表盘</h1>
        <p className="mt-1 text-sm text-foreground-500">欢迎回来，这是你的平台数据概览</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl p-4 border border-background-200/70 hover:border-primary-200 transition-all hover:shadow-md"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-lg ${stat.color} flex items-center justify-center`}>
                <i className={`${stat.icon} text-white text-sm`}></i>
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground-900">{stat.value}</p>
            <p className="text-xs text-foreground-400 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <h2 className="text-base font-semibold text-foreground-900 mb-4">快捷入口</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickLinks.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className="group bg-white rounded-xl p-5 border border-background-200/70 hover:border-primary-300 transition-all hover:shadow-md"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-background-100 flex items-center justify-center group-hover:bg-primary-100 transition-colors">
                <i className={`${link.icon} text-lg text-foreground-600 group-hover:text-primary-500 transition-colors`}></i>
              </div>
              <span className="font-semibold text-foreground-900 text-sm">{link.name}</span>
            </div>
            <p className="text-xs text-foreground-500">{link.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}