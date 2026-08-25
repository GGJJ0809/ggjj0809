export interface ValueService {
  id: number;
  category: "教育" | "医疗" | "财富" | "商旅";
  name: string;
  description: string;
  price: string;
  duration: string;
  provider: string;
  tags: string[];
}

export interface BookingRecord {
  id: string;
  service: string;
  category: string;
  applicant: string;
  date: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
}

export const valueServices: ValueService[] = [
  {
    id: 1,
    category: "医疗",
    name: "全球紧急医疗救援",
    description: "覆盖全球的紧急医疗转运、远程会诊与当地就医陪诊服务，24 小时响应。",
    price: "¥2,000",
    duration: "年",
    provider: "国际 SOS",
    tags: ["医疗转运", "远程会诊", "24 小时"],
  },
  {
    id: 2,
    category: "教育",
    name: "外派子女国际学校咨询",
    description: "为外派员工子女提供海外国际学校择校、入学申请与转学衔接一站式服务。",
    price: "¥1,500",
    duration: "次",
    provider: "环球教育",
    tags: ["择校咨询", "入学申请", "转学衔接"],
  },
  {
    id: 3,
    category: "财富",
    name: "跨境财富规划咨询",
    description: "为高净值外派人士提供跨境资产配置、税务筹划与保险保障咨询服务。",
    price: "¥8,000",
    duration: "次",
    provider: "鼎诚财富",
    tags: ["资产配置", "税务筹划", "保险保障"],
  },
  {
    id: 4,
    category: "商旅",
    name: "高管差旅管家服务",
    description: "提供机票酒店预订、专车接送、签证办理与行程管家一体化差旅服务。",
    price: "¥3,500",
    duration: "次",
    provider: "环球商旅",
    tags: ["机酒预订", "专车接送", "签证办理"],
  },
  {
    id: 5,
    category: "医疗",
    name: "海外疫苗接种与体检",
    description: "提供目的地国要求的疫苗接种、行前健康体检与健康档案建立服务。",
    price: "¥800",
    duration: "次",
    provider: "环球医疗",
    tags: ["疫苗接种", "健康体检", "健康档案"],
  },
  {
    id: 6,
    category: "教育",
    name: "海外安全技能培训",
    description: "面向外派员工及家属的安全意识、应急处置与自救互救技能培训课程。",
    price: "¥1,200",
    duration: "人/期",
    provider: "智盾学院",
    tags: ["安全意识", "应急处置", "自救互救"],
  },
  {
    id: 7,
    category: "财富",
    name: "海外资产法律顾问",
    description: "提供海外置业、投资并购等场景的法律咨询与合规审查顾问服务。",
    price: "¥5,000",
    duration: "次",
    provider: "正和法律",
    tags: ["法律咨询", "合规审查", "投资并购"],
  },
  {
    id: 8,
    category: "商旅",
    name: "海外临时办公空间",
    description: "提供全球主要城市的临时办公空间、会议室与行政支持服务。",
    price: "¥600",
    duration: "天",
    provider: "灵活办公",
    tags: ["办公空间", "会议室", "行政支持"],
  },
];

export const bookingRecords: BookingRecord[] = [
  { id: "BK-20260318-001", service: "全球紧急医疗救援", category: "医疗", applicant: "华信矿业集团 · 李明", date: "03-18", status: "confirmed" },
  { id: "BK-20260317-002", service: "高管差旅管家服务", category: "商旅", applicant: "中阿能源投资 · 刘洋", date: "03-17", status: "completed" },
  { id: "BK-20260316-003", service: "外派子女国际学校咨询", category: "教育", applicant: "国开基建 · 王芳", date: "03-16", status: "pending" },
  { id: "BK-20260315-004", service: "跨境财富规划咨询", category: "财富", applicant: "启航跨境贸易 · 陈晨", date: "03-15", status: "completed" },
  { id: "BK-20260314-005", service: "海外安全技能培训", category: "教育", applicant: "南洋制造 · 赵磊", date: "03-14", status: "cancelled" },
];