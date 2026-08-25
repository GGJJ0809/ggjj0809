export interface OperationUser {
  id: string;
  name: string;
  company: string;
  level: string;
  status: "active" | "expiring" | "expired" | "suspended";
  location: string;
  joinedAt: string;
}

export interface OperationOrder {
  id: string;
  type: string;
  customer: string;
  amount: string;
  status: "pending" | "paid" | "deployed" | "completed" | "refunded";
  createdAt: string;
}

export interface OperationProvider {
  id: number;
  name: string;
  country: string;
  coverage: string;
  rating: number;
  orderCount: number;
  status: "active" | "reviewing" | "paused";
}

export interface FinanceRecord {
  id: string;
  category: string;
  description: string;
  type: "income" | "expense";
  amount: string;
  date: string;
}

export const operationUsers: OperationUser[] = [
  { id: "U-1001", name: "张伟", company: "中远海外工程", level: "钻石会员", status: "active", location: "尼日利亚", joinedAt: "2025-06-12" },
  { id: "U-1002", name: "李明", company: "华信矿业集团", level: "黄金会员", status: "expiring", location: "刚果（金）", joinedAt: "2025-08-03" },
  { id: "U-1003", name: "王芳", company: "国开基建", level: "白金会员", status: "active", location: "海地", joinedAt: "2025-04-20" },
  { id: "U-1004", name: "陈晨", company: "启航跨境贸易", level: "白银会员", status: "expired", location: "泰国", joinedAt: "2024-12-15" },
  { id: "U-1005", name: "刘洋", company: "中阿能源投资", level: "钻石会员", status: "active", location: "阿联酋", joinedAt: "2025-09-01" },
  { id: "U-1006", name: "赵磊", company: "南洋制造", level: "黄金会员", status: "suspended", location: "印尼", joinedAt: "2025-03-18" },
  { id: "U-1007", name: "孙悦", company: "澜沧投资控股", level: "白金会员", status: "active", location: "缅甸", joinedAt: "2025-07-22" },
  { id: "U-1008", name: "周敏", company: "环球商旅服务", level: "白银会员", status: "active", location: "巴西", joinedAt: "2025-10-05" },
];

export const operationOrders: OperationOrder[] = [
  { id: "OD-20260318-001", type: "安保服务", customer: "中远海外工程", amount: "¥96,000", status: "paid", createdAt: "03-18 10:32" },
  { id: "OD-20260318-002", type: "增值服务", customer: "华信矿业集团", amount: "¥12,800", status: "pending", createdAt: "03-18 09:15" },
  { id: "OD-20260317-003", type: "风险评估", customer: "国开基建", amount: "¥25,000", status: "deployed", createdAt: "03-17 16:40" },
  { id: "OD-20260317-004", type: "安保服务", customer: "中阿能源投资", amount: "¥47,500", status: "completed", createdAt: "03-17 14:22" },
  { id: "OD-20260316-005", type: "增值服务", customer: "启航跨境贸易", amount: "¥8,600", status: "paid", createdAt: "03-16 11:05" },
  { id: "OD-20260316-006", type: "安保服务", customer: "南洋制造", amount: "¥31,200", status: "refunded", createdAt: "03-16 09:48" },
];

export const operationProviders: OperationProvider[] = [
  { id: 1, name: "中安保防务集团", country: "中国", coverage: "非洲 / 中东 / 东南亚", rating: 4.9, orderCount: 86, status: "active" },
  { id: 2, name: "G4S 全球安防", country: "英国", coverage: "全球", rating: 4.8, orderCount: 64, status: "active" },
  { id: 3, name: "非洲先锋安保", country: "尼日利亚", coverage: "西非 / 中非", rating: 4.6, orderCount: 41, status: "active" },
  { id: 4, name: "中东盾牌安保", country: "阿联酋", coverage: "中东 / 北非", rating: 4.7, orderCount: 38, status: "reviewing" },
  { id: 5, name: "安第斯安防服务", country: "哥伦比亚", coverage: "拉美", rating: 4.5, orderCount: 17, status: "paused" },
  { id: 6, name: "湄公河安保联盟", country: "泰国", coverage: "东南亚", rating: 4.6, orderCount: 29, status: "active" },
];

export const financeRecords: FinanceRecord[] = [
  { id: "F-001", category: "安保服务收入", description: "中远海外工程驻地安保费用", type: "income", amount: "¥96,000", date: "03-18" },
  { id: "F-002", category: "增值服务收入", description: "华信矿业集团医疗预约", type: "income", amount: "¥12,800", date: "03-18" },
  { id: "F-003", category: "服务商结算", description: "非洲先锋安保月度结算", type: "expense", amount: "¥45,200", date: "03-17" },
  { id: "F-004", category: "风险评估收入", description: "国开基建项目风险评估", type: "income", amount: "¥25,000", date: "03-17" },
  { id: "F-005", category: "平台运营", description: "云服务与地图资源费用", type: "expense", amount: "¥6,800", date: "03-16" },
  { id: "F-006", category: "安保服务收入", description: "中阿能源投资贴身护卫", type: "income", amount: "¥47,500", date: "03-16" },
];