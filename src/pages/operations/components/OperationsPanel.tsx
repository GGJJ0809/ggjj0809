import { useState } from "react";
import {
  operationUsers,
  operationOrders,
  operationProviders,
  financeRecords,
} from "@/mocks/operations";

const tabs = [
  { key: "users", label: "用户管理", icon: "ri-user-line" },
  { key: "orders", label: "订单管理", icon: "ri-shopping-bag-3-line" },
  { key: "providers", label: "服务商管理", icon: "ri-team-line" },
  { key: "finance", label: "财务管理", icon: "ri-money-cny-circle-line" },
];

const userStatusMeta: Record<string, { label: string; className: string }> = {
  active: { label: "正常", className: "bg-secondary-100 text-secondary-900" },
  expiring: { label: "即将到期", className: "bg-primary-100 text-primary-700" },
  expired: { label: "已过期", className: "bg-accent-100 text-accent-900" },
  suspended: { label: "已暂停", className: "bg-background-200 text-foreground-500" },
};

const orderStatusMeta: Record<string, { label: string; className: string }> = {
  pending: { label: "待支付", className: "bg-accent-100 text-accent-900" },
  paid: { label: "已支付", className: "bg-secondary-100 text-secondary-900" },
  deployed: { label: "已部署", className: "bg-primary-100 text-primary-700" },
  completed: { label: "已完成", className: "bg-background-200 text-foreground-500" },
  refunded: { label: "已退款", className: "bg-background-200 text-foreground-500" },
};

const providerStatusMeta: Record<string, { label: string; className: string }> = {
  active: { label: "合作中", className: "bg-secondary-100 text-secondary-900" },
  reviewing: { label: "审核中", className: "bg-primary-100 text-primary-700" },
  paused: { label: "已暂停", className: "bg-accent-100 text-accent-900" },
};

export default function OperationsPanel() {
  const [active, setActive] = useState("users");

  const renderUsers = () => (
    <table className="w-full min-w-[760px] text-sm">
      <thead>
        <tr className="border-b border-background-100 text-left text-xs text-foreground-500">
          <th className="px-5 py-3 font-medium">用户编号</th>
          <th className="px-5 py-3 font-medium">姓名 / 企业</th>
          <th className="px-5 py-3 font-medium">会员等级</th>
          <th className="px-5 py-3 font-medium">状态</th>
          <th className="px-5 py-3 font-medium">所在地区</th>
          <th className="px-5 py-3 font-medium">加入时间</th>
        </tr>
      </thead>
      <tbody>
        {operationUsers.map((u) => {
          const status = userStatusMeta[u.status];
          return (
            <tr key={u.id} className="border-b border-background-100 last:border-0 hover:bg-background-100/50">
              <td className="px-5 py-3 font-mono text-xs text-foreground-600">{u.id}</td>
              <td className="px-5 py-3">
                <p className="text-sm font-medium text-foreground-900">{u.name}</p>
                <p className="text-xs text-foreground-500">{u.company}</p>
              </td>
              <td className="px-5 py-3 text-foreground-700">{u.level}</td>
              <td className="px-5 py-3">
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                  {status.label}
                </span>
              </td>
              <td className="px-5 py-3 text-foreground-700">{u.location}</td>
              <td className="px-5 py-3 text-xs text-foreground-500">{u.joinedAt}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderOrders = () => (
    <table className="w-full min-w-[760px] text-sm">
      <thead>
        <tr className="border-b border-background-100 text-left text-xs text-foreground-500">
          <th className="px-5 py-3 font-medium">订单号</th>
          <th className="px-5 py-3 font-medium">类型</th>
          <th className="px-5 py-3 font-medium">客户</th>
          <th className="px-5 py-3 font-medium">金额</th>
          <th className="px-5 py-3 font-medium">状态</th>
          <th className="px-5 py-3 font-medium">创建时间</th>
        </tr>
      </thead>
      <tbody>
        {operationOrders.map((o) => {
          const status = orderStatusMeta[o.status];
          return (
            <tr key={o.id} className="border-b border-background-100 last:border-0 hover:bg-background-100/50">
              <td className="px-5 py-3 font-mono text-xs text-foreground-600">{o.id}</td>
              <td className="px-5 py-3 text-foreground-700">{o.type}</td>
              <td className="px-5 py-3 text-foreground-800">{o.customer}</td>
              <td className="px-5 py-3 font-medium text-foreground-900">{o.amount}</td>
              <td className="px-5 py-3">
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                  {status.label}
                </span>
              </td>
              <td className="px-5 py-3 text-xs text-foreground-500">{o.createdAt}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderProviders = () => (
    <table className="w-full min-w-[760px] text-sm">
      <thead>
        <tr className="border-b border-background-100 text-left text-xs text-foreground-500">
          <th className="px-5 py-3 font-medium">服务商</th>
          <th className="px-5 py-3 font-medium">国家</th>
          <th className="px-5 py-3 font-medium">覆盖范围</th>
          <th className="px-5 py-3 font-medium">评分</th>
          <th className="px-5 py-3 font-medium">订单数</th>
          <th className="px-5 py-3 font-medium">状态</th>
        </tr>
      </thead>
      <tbody>
        {operationProviders.map((p) => {
          const status = providerStatusMeta[p.status];
          return (
            <tr key={p.id} className="border-b border-background-100 last:border-0 hover:bg-background-100/50">
              <td className="px-5 py-3 font-medium text-foreground-900">{p.name}</td>
              <td className="px-5 py-3 text-foreground-700">{p.country}</td>
              <td className="px-5 py-3 text-xs text-foreground-600">{p.coverage}</td>
              <td className="px-5 py-3">
                <span className="flex items-center gap-1 text-foreground-900">
                  <i className="ri-star-fill text-xs text-accent-500" />
                  {p.rating}
                </span>
              </td>
              <td className="px-5 py-3 text-foreground-700">{p.orderCount}</td>
              <td className="px-5 py-3">
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                  {status.label}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderFinance = () => (
    <table className="w-full min-w-[760px] text-sm">
      <thead>
        <tr className="border-b border-background-100 text-left text-xs text-foreground-500">
          <th className="px-5 py-3 font-medium">流水号</th>
          <th className="px-5 py-3 font-medium">类别</th>
          <th className="px-5 py-3 font-medium">说明</th>
          <th className="px-5 py-3 font-medium">类型</th>
          <th className="px-5 py-3 font-medium">金额</th>
          <th className="px-5 py-3 font-medium">日期</th>
        </tr>
      </thead>
      <tbody>
        {financeRecords.map((f) => (
          <tr key={f.id} className="border-b border-background-100 last:border-0 hover:bg-background-100/50">
            <td className="px-5 py-3 font-mono text-xs text-foreground-600">{f.id}</td>
            <td className="px-5 py-3 text-foreground-700">{f.category}</td>
            <td className="px-5 py-3 text-foreground-800">{f.description}</td>
            <td className="px-5 py-3">
              <span
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  f.type === "income" ? "bg-secondary-100 text-secondary-900" : "bg-accent-100 text-accent-900"
                }`}
              >
                {f.type === "income" ? "收入" : "支出"}
              </span>
            </td>
            <td className={`px-5 py-3 font-medium ${f.type === "income" ? "text-secondary-700" : "text-accent-700"}`}>
              {f.type === "income" ? "+" : "-"}
              {f.amount}
            </td>
            <td className="px-5 py-3 text-xs text-foreground-500">{f.date}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderContent = () => {
    switch (active) {
      case "orders":
        return renderOrders();
      case "providers":
        return renderProviders();
      case "finance":
        return renderFinance();
      default:
        return renderUsers();
    }
  };

  return (
    <div className="rounded-lg border border-background-200 bg-background-50">
      <div className="flex flex-wrap items-center gap-1 border-b border-background-200 px-3 py-3">
        <div className="flex flex-wrap items-center gap-1 rounded-full bg-background-100 px-1 py-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active === tab.key
                  ? "bg-background-50 text-foreground-900"
                  : "text-foreground-500 hover:text-foreground-700"
              }`}
            >
              <i className={tab.icon} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">{renderContent()}</div>
    </div>
  );
}