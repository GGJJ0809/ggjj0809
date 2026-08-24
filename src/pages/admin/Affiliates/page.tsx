import { useState } from "react";
import DistributorList from "./components/DistributorList";
import EarningsList from "./components/EarningsList";
import DistributionSettings from "./components/DistributionSettings";

const tabs = [
  { key: "distributors", name: "分销员", icon: "ri-user-star-line" },
  { key: "earnings", name: "收益明细", icon: "ri-money-cny-circle-line" },
  { key: "settings", name: "分销设置", icon: "ri-settings-3-line" },
];

export default function AffiliatesAdmin() {
  const [activeTab, setActiveTab] = useState("distributors");

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground-950">分销管理</h1>
          <p className="mt-1 text-sm text-foreground-500">管理分销员、分销收益与分销规则，返积分自动到账</p>
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

      {activeTab === "distributors" && <DistributorList />}
      {activeTab === "earnings" && <EarningsList />}
      {activeTab === "settings" && <DistributionSettings />}
    </div>
  );
}