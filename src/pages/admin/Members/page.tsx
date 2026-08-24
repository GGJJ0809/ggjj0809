import { useState } from "react";
import LevelManager from "./components/LevelManager";
import MemberList from "./components/MemberList";
import StatsPanel from "./components/StatsPanel";

const tabs = [
  { key: "levels", name: "等级管理", icon: "ri-vip-crown-line" },
  { key: "members", name: "会员列表", icon: "ri-user-star-line" },
  { key: "stats", name: "数据统计", icon: "ri-bar-chart-2-line" },
];

export default function MembersAdmin() {
  const [activeTab, setActiveTab] = useState("members");

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground-950">会员管理</h1>
          <p className="mt-1 text-sm text-foreground-500">管理会员等级、会员名单与数据统计</p>
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

      {activeTab === "levels" && <LevelManager />}
      {activeTab === "members" && <MemberList />}
      {activeTab === "stats" && <StatsPanel />}
    </div>
  );
}