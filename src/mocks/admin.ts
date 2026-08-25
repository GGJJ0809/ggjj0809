export const kpiCards = [
  { id: "alerts", label: "今日告警", value: "23", unit: "起", delta: "+8%", trend: "up", icon: "ri-alarm-warning-line" },
  { id: "personnel", label: "在途人员", value: "1247", unit: "人", delta: "+3%", trend: "up", icon: "ri-user-location-line" },
  { id: "highrisk", label: "高危区域", value: "6", unit: "处", delta: "-1", trend: "down", icon: "ri-map-pin-2-line" },
  { id: "response", label: "平均响应时长", value: "4.2", unit: "分钟", delta: "-12%", trend: "down", icon: "ri-timer-flash-line" },
];

export const alertFeed = [
  { id: 1, level: "P0", title: "刚果（金）东部地区武装冲突升级", location: "戈马 · 北基伍省", time: "2 分钟前", type: "安全事件" },
  { id: 2, level: "P1", title: "某企业外派员工失联超过 6 小时", location: "拉各斯 · 尼日利亚", time: "15 分钟前", type: "人员告警" },
  { id: 3, level: "P1", title: "海地太子港大规模示威游行", location: "太子港 · 海地", time: "32 分钟前", type: "公共事件" },
  { id: 4, level: "P2", title: "东南亚多国登革热疫情扩散", location: "曼谷 · 泰国", time: "1 小时前", type: "健康风险" },
  { id: 5, level: "P2", title: "某项目现场摄像头离线", location: "迪拜 · 阿联酋", time: "1 小时前", type: "设备异常" },
  { id: 6, level: "P3", title: "雨季道路积水预警", location: "雅加达 · 印尼", time: "2 小时前", type: "环境提示" },
  { id: 7, level: "P3", title: "会员续费提醒（3 人即将到期）", location: "全球", time: "3 小时前", type: "运营提醒" },
];

export const riskRegions = [
  { id: 1, name: "中东 · 也门", level: "极高", levelKey: "critical", events: 42, color: "accent" },
  { id: 2, name: "非洲 · 萨赫勒地带", level: "极高", levelKey: "critical", events: 38, color: "accent" },
  { id: 3, name: "拉美 · 海地", level: "高", levelKey: "high", events: 27, color: "primary" },
  { id: 4, name: "东南亚 · 缅甸", level: "高", levelKey: "high", events: 24, color: "primary" },
  { id: 5, name: "东欧 · 乌克兰东部", level: "高", levelKey: "high", events: 21, color: "primary" },
  { id: 6, name: "中东 · 黎巴嫩", level: "中", levelKey: "medium", events: 15, color: "secondary" },
];

export const riskDistribution = [
  { level: "P0 · 紧急", count: 2, color: "accent" },
  { level: "P1 · 严重", count: 7, color: "primary" },
  { level: "P2 · 中等", count: 11, color: "secondary" },
  { level: "P3 · 提示", count: 3, color: "foreground" },
];

export const recentActivities = [
  { id: 1, time: "10:42", title: "已派单至属地安保公司", detail: "拉各斯失联员工事件 · 已联系当地安保商", status: "处置中" },
  { id: 2, time: "10:18", title: "SOS 告警确认", detail: "在途人员张伟触发一键 SOS", status: "已完成" },
  { id: 3, time: "09:55", title: "发布风险预警", detail: "向海地项目 12 名员工推送示威预警", status: "已完成" },
  { id: 4, time: "09:30", title: "合规自检报告生成", detail: "某企业印尼项目合规差距报告", status: "已完成" },
];

export const navGroups = [
  {
    group: "监控中心",
    items: [
      { path: "/dashboard", label: "风险控制台", icon: "ri-radar-line", available: true },
      { path: "/emergency", label: "应急指挥", icon: "ri-fire-line", available: true },
    ],
  },
  {
    group: "业务管理",
    items: [
      { path: "/members", label: "会员中心", icon: "ri-user-star-line", available: true },
      { path: "/security-services", label: "安保服务采购", icon: "ri-shield-user-line", available: true },
      { path: "/travel-tracking", label: "差旅安全追踪", icon: "ri-map-pin-line", available: true },
    ],
  },
  {
    group: "平台管理",
    items: [
      { path: "/compliance", label: "合规自检", icon: "ri-file-list-3-line", available: true },
      { path: "/operations", label: "运营管理", icon: "ri-settings-3-line", available: true },
      { path: "/value-added", label: "增值服务预约", icon: "ri-calendar-check-line", available: true },
    ],
  },
];