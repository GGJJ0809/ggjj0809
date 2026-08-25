import { useState } from "react";
import { providers, procurementOrders } from "@/mocks/security";
import type { Provider } from "@/mocks/security";
import ProcurementStats from "./components/ProcurementStats";
import ProviderDirectory from "./components/ProviderDirectory";
import ComparePanel from "./components/ComparePanel";
import OrderModal from "./components/OrderModal";

const statusMeta: Record<string, { label: string; className: string }> = {
  pending: { label: "待确认", className: "bg-secondary-100 text-secondary-900" },
  confirmed: { label: "已确认", className: "bg-primary-100 text-primary-700" },
  deployed: { label: "已部署", className: "bg-accent-100 text-accent-900" },
  completed: { label: "已完成", className: "bg-background-200 text-foreground-500" },
};

export default function Security() {
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [orderTarget, setOrderTarget] = useState<Provider | null>(null);
  const [orders, setOrders] = useState(procurementOrders);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleToggleCompare = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const handleOrderConfirm = (service: string, region: string) => {
    if (!orderTarget) return;
    setLoading(true);
    window.setTimeout(() => {
      setOrders((prev) => [
        {
          id: `PO-${Date.now().toString().slice(-8)}`,
          provider: orderTarget.name,
          service,
          region,
          amount: orderTarget.services.find((s) => s.name === service)?.price ?? "面议",
          status: "pending",
          createdAt: "刚刚",
        },
        ...prev,
      ]);
      setLoading(false);
      setOrderTarget(null);
      showToast(`已提交「${service}」采购订单，等待服务商确认`);
    }, 600);
  };

  const compareProviders = providers.filter((p) => compareIds.includes(p.id));

  return (
    <div className="space-y-4">
      <ProcurementStats />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="h-[640px] xl:col-span-2">
          <ProviderDirectory
            providers={providers}
            compareIds={compareIds}
            onToggleCompare={handleToggleCompare}
            onOrder={setOrderTarget}
          />
        </div>
        <div className="h-[640px] xl:col-span-1">
          <ComparePanel compareProviders={compareProviders} onToggleCompare={handleToggleCompare} />
        </div>
      </div>

      {/* 近期采购订单 */}
      <div className="rounded-lg border border-background-200 bg-background-50">
        <div className="flex items-center justify-between border-b border-background-200 px-5 py-4">
          <div>
            <h3 className="font-heading text-base font-bold">近期采购订单</h3>
            <p className="text-xs text-foreground-500">服务采购订单流转记录</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-background-100 text-left text-xs text-foreground-500">
                <th className="px-5 py-3 font-medium">订单号</th>
                <th className="px-5 py-3 font-medium">服务商</th>
                <th className="px-5 py-3 font-medium">服务 / 区域</th>
                <th className="px-5 py-3 font-medium">金额</th>
                <th className="px-5 py-3 font-medium">状态</th>
                <th className="px-5 py-3 font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const status = statusMeta[order.status];
                return (
                  <tr key={order.id} className="border-b border-background-100 last:border-0 hover:bg-background-100/50">
                    <td className="px-5 py-3 font-mono text-xs text-foreground-700">{order.id}</td>
                    <td className="px-5 py-3 text-foreground-800">{order.provider}</td>
                    <td className="px-5 py-3 text-foreground-700">
                      {order.service} · <span className="text-foreground-500">{order.region}</span>
                    </td>
                    <td className="px-5 py-3 font-medium text-foreground-900">{order.amount}</td>
                    <td className="px-5 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-foreground-500">{order.createdAt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <OrderModal
        provider={orderTarget}
        loading={loading}
        onConfirm={handleOrderConfirm}
        onClose={() => setOrderTarget(null)}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-foreground-950 px-4 py-3 text-sm text-background-50 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}