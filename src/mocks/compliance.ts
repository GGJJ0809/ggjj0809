export interface Regulation {
  id: number;
  name: string;
  country: string;
  category: string;
  effectiveDate: string;
  relevance: "high" | "medium" | "low";
  summary: string;
}

export interface ComplianceQuestion {
  id: number;
  category: string;
  question: string;
  weight: number;
}

export const regulations: Regulation[] = [
  {
    id: 1,
    name: "刚果（金）矿业安全与劳工保护条例",
    country: "刚果（金）",
    category: "劳工安全",
    effectiveDate: "2025-11-01",
    relevance: "high",
    summary: "要求矿区企业为外派员工配置属地安保、建立应急撤离预案并定期演练。",
  },
  {
    id: 2,
    name: "尼日利亚石油天然气行业健康安全环境条例",
    country: "尼日利亚",
    category: "行业安全",
    effectiveDate: "2025-09-15",
    relevance: "high",
    summary: "规定高风险区域作业需配备持证安保力量，并提交月度安全合规报告。",
  },
  {
    id: 3,
    name: "阿联酋境外企业数据合规与隐私保护法",
    country: "阿联酋",
    category: "数据合规",
    effectiveDate: "2025-12-01",
    relevance: "medium",
    summary: "规范境外企业在本地收集、存储员工数据的流程，要求设置数据保护官。",
  },
  {
    id: 4,
    name: "海地外商投资与安保服务准入指引",
    country: "海地",
    category: "投资准入",
    effectiveDate: "2026-01-10",
    relevance: "medium",
    summary: "外商投资项目需报备属地安保方案，并取得当地主管部门许可。",
  },
  {
    id: 5,
    name: "印尼外籍员工居留与劳务合规管理办法",
    country: "印尼",
    category: "劳务合规",
    effectiveDate: "2025-10-20",
    relevance: "low",
    summary: "规范外籍员工工作许可与居留手续，要求企业建立人员档案。",
  },
  {
    id: 6,
    name: "缅甸应急管理与人道救援协作条例",
    country: "缅甸",
    category: "应急管理",
    effectiveDate: "2026-02-01",
    relevance: "high",
    summary: "要求外资企业在缅项目建立应急联络机制，并纳入国家救援协作网络。",
  },
];

export const complianceQuestions: ComplianceQuestion[] = [
  { id: 1, category: "人员安全", question: "是否为全部外派员工购买了海外人身意外及医疗救援保险？", weight: 20 },
  { id: 2, category: "人员安全", question: "是否为高风险区域项目配置了属地持证安保力量？", weight: 20 },
  { id: 3, category: "应急管理", question: "是否建立了完整的应急撤离预案并定期组织演练？", weight: 15 },
  { id: 4, category: "应急管理", question: "是否建立 24 小时应急联络中心并确保可达性？", weight: 15 },
  { id: 5, category: "数据合规", question: "是否针对海外业务建立了数据合规与隐私保护流程？", weight: 15 },
  { id: 6, category: "劳务合规", question: "是否确保外派员工的工作许可与居留手续齐全且在有效期内？", weight: 15 },
];