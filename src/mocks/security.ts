export interface ProviderService {
  name: string;
  price: string;
  unit: string;
}

export interface Provider {
  id: number;
  name: string;
  country: string;
  headquarters: string;
  coverage: string[];
  rating: number;
  reviews: number;
  responseTime: string;
  yearsExperience: number;
  verified: boolean;
  badge?: string;
  services: ProviderService[];
}

export interface ProcurementOrder {
  id: string;
  provider: string;
  service: string;
  region: string;
  amount: string;
  status: "pending" | "confirmed" | "deployed" | "completed";
  createdAt: string;
}

export const providers: Provider[] = [
  {
    id: 1,
    name: "中安保防务集团",
    country: "中国",
    headquarters: "北京",
    coverage: ["非洲", "中东", "东南亚"],
    rating: 4.9,
    reviews: 312,
    responseTime: "15 分钟",
    yearsExperience: 12,
    verified: true,
    badge: "央企背景",
    services: [
      { name: "贴身护卫", price: "¥8,800", unit: "人/天" },
      { name: "驻地安保", price: "¥3,200", unit: "人/天" },
      { name: "应急撤离", price: "面议", unit: "次" },
    ],
  },
  {
    id: 2,
    name: "G4S 全球安防",
    country: "英国",
    headquarters: "伦敦",
    coverage: ["全球", "拉美", "欧洲"],
    rating: 4.8,
    reviews: 528,
    responseTime: "20 分钟",
    yearsExperience: 25,
    verified: true,
    badge: "国际标杆",
    services: [
      { name: "贴身护卫", price: "¥12,000", unit: "人/天" },
      { name: "武装押运", price: "¥6,500", unit: "车/天" },
      { name: "风险评估", price: "¥25,000", unit: "次" },
    ],
  },
  {
    id: 3,
    name: "非洲先锋安保",
    country: "尼日利亚",
    headquarters: "拉各斯",
    coverage: ["西非", "中非"],
    rating: 4.6,
    reviews: 187,
    responseTime: "25 分钟",
    yearsExperience: 9,
    verified: true,
    services: [
      { name: "驻地安保", price: "¥2,400", unit: "人/天" },
      { name: "护送出行", price: "¥3,800", unit: "次" },
      { name: "医疗救援", price: "¥5,000", unit: "次" },
    ],
  },
  {
    id: 4,
    name: "中东盾牌安保",
    country: "阿联酋",
    headquarters: "迪拜",
    coverage: ["中东", "北非"],
    rating: 4.7,
    reviews: 146,
    responseTime: "18 分钟",
    yearsExperience: 15,
    verified: true,
    badge: "本地资源",
    services: [
      { name: "贴身护卫", price: "¥9,500", unit: "人/天" },
      { name: "驻地安保", price: "¥3,000", unit: "人/天" },
      { name: "风险评估", price: "¥18,000", unit: "次" },
    ],
  },
  {
    id: 5,
    name: "安第斯安防服务",
    country: "哥伦比亚",
    headquarters: "波哥大",
    coverage: ["拉美"],
    rating: 4.5,
    reviews: 92,
    responseTime: "30 分钟",
    yearsExperience: 7,
    verified: false,
    services: [
      { name: "护送出行", price: "¥3,200", unit: "次" },
      { name: "驻地安保", price: "¥2,800", unit: "人/天" },
    ],
  },
  {
    id: 6,
    name: "湄公河安保联盟",
    country: "泰国",
    headquarters: "曼谷",
    coverage: ["东南亚"],
    rating: 4.6,
    reviews: 118,
    responseTime: "22 分钟",
    yearsExperience: 8,
    verified: true,
    services: [
      { name: "贴身护卫", price: "¥7,500", unit: "人/天" },
      { name: "驻地安保", price: "¥2,600", unit: "人/天" },
      { name: "应急撤离", price: "面议", unit: "次" },
    ],
  },
];

export const procurementOrders: ProcurementOrder[] = [
  { id: "PO-20260318-001", provider: "中安保防务集团", service: "驻地安保", region: "刚果（金）戈马", amount: "¥96,000", status: "deployed", createdAt: "03-18" },
  { id: "PO-20260317-002", provider: "G4S 全球安防", service: "风险评估", region: "尼日利亚拉各斯", amount: "¥25,000", status: "confirmed", createdAt: "03-17" },
  { id: "PO-20260315-003", provider: "中东盾牌安保", service: "贴身护卫", region: "阿联酋迪拜", amount: "¥47,500", status: "completed", createdAt: "03-15" },
  { id: "PO-20260314-004", provider: "湄公河安保联盟", service: "驻地安保", region: "泰国曼谷", amount: "¥31,200", status: "pending", createdAt: "03-14" },
];