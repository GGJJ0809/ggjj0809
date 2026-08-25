import { useNavigate } from "react-router-dom";

export default function SettingsAdmin() {
  const navigate = useNavigate();

  const cards = [
    {
      icon: "ri-bank-card-line",
      title: "支付配置",
      desc: "微信支付、汇付天下等支付渠道的参数配置",
      path: "/admin/settings/payment",
      available: true,
    },
    {
      icon: "ri-user-settings-line",
      title: "账号与登录配置",
      desc: "登录方式、邮箱服务与短信验证码配置",
      path: "/admin/settings/auth-config",
      available: true,
    },
    {
      icon: "ri-image-line",
      title: "Banner 配置",
      desc: "管理首页轮播图和广告位",
      path: "",
      available: false,
    },
    {
      icon: "ri-menu-line",
      title: "导航配置",
      desc: "设置前台导航菜单和链接",
      path: "",
      available: false,
    },
    {
      icon: "ri-global-line",
      title: "站点设置",
      desc: "站点名称、Logo、SEO 等全局配置",
      path: "",
      available: false,
    },
    {
      icon: "ri-shield-check-line",
      title: "权限管理",
      desc: "管理员账号和角色权限",
      path: "",
      available: false,
    },
  ];

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-2xl font-heading font-bold text-foreground-950 mb-8">系统配置</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((item) => (
          <div
            key={item.title}
            onClick={() => item.available && item.path && navigate(item.path)}
            className={`bg-background-50 rounded-xl border border-background-200/70 p-5 transition-all ${
              item.available
                ? "cursor-pointer hover:border-primary-300 hover:bg-background-100"
                : "opacity-60 cursor-not-allowed"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                item.available ? "bg-primary-100" : "bg-background-200"
              }`}>
                <i className={`${item.icon} ${item.available ? "text-primary-600" : "text-foreground-400"}`}></i>
              </div>
              <span className="font-semibold text-foreground-950 text-sm">{item.title}</span>
              {!item.available && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background-200 text-foreground-400 font-medium whitespace-nowrap">
                  即将上线
                </span>
              )}
            </div>
            <p className="text-xs text-foreground-500 ml-12">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}