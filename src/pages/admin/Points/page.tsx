import { useState } from "react";
import RulesPanel from "./components/RulesPanel";
import TransactionsPanel from "./components/TransactionsPanel";
import PointsStats from "./components/PointsStats";

const tabs = [
  { key: "rules", name: "积分规则", icon: "ri-settings-3-line" },
  { key: "transactions", name: "交易明细", icon: "ri-exchange-line" },
  { key: "stats", name: "数据统计", icon: "ri-bar-chart-2-line" },
];

export default function PointsAdmin() {
  const [activeTab, setActiveTab] = useState("transactions");

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground-950">积分管理</h1>
          <p className="mt-1 text-sm text-foreground-500">管理积分规则、交易明细与数据统计</p>
        </div>
      </div>

      <div className="inline-flex items-center gap-1 px-1 py-1 rounded-full bg-background-100 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab.key
                ? "bg-primary-500 text-white"
                : "text-foreground-600 hover:text-foreground-900"
            }`}
          >
            <i className={`${tab.icon} text-base`}></i>
            {tab.name}
          </button>
        ))}
      </div>

      {activeTab === "rules" && <RulesPanel />}
      {activeTab === "transactions" && <TransactionsPanel />}
      {activeTab === "stats" && <PointsStats />}
    </div>
  );
}