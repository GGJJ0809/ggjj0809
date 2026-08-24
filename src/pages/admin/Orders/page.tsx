import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface OrderHeader {
  id: number;
  customer_id: string;
  status: string;
  currency: string;
  subtotal_items: number;
  shipping_total: number;
  tax_total: number;
  discount_price: number;
  payment_provider: string;
  checkout_session_id: string;
  recipient: any;
  created_at: string;
}

interface OrderItem {
  id: number;
  order_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  final_price: number;
}

const statusLabels: Record<string, string> = {
  pending_payment: "待付款",
  paid: "已付款",
  processing: "处理中",
  shipped: "已发货",
  delivered: "已完成",
  cancelled: "已取消",
  refunded: "已退款",
};

const statusColors: Record<string, string> = {
  pending_payment: "bg-yellow-100 text-yellow-700",
  paid: "bg-blue-100 text-blue-700",
  processing: "bg-purple-100 text-purple-700",
  shipped: "bg-cyan-100 text-cyan-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
  refunded: "bg-red-100 text-red-700",
};

export default function OrdersAdmin() {
  const [orders, setOrders] = useState<OrderHeader[]>([]);
  const [orderItems, setOrderItems] = useState<Record<number, OrderItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError("");
      let query = supabase
        .from("order_headers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error: dbErr } = await query;
      if (dbErr) throw dbErr;

      const ordersData = data || [];
      setOrders(ordersData);

      // Load items for all orders
      if (ordersData.length > 0) {
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("*")
          .in(
            "order_id",
            ordersData.map((o) => o.id)
          );
        const map: Record<number, OrderItem[]> = {};
        (itemsData || []).forEach((item: OrderItem) => {
          if (!map[item.order_id]) map[item.order_id] = [];
          map[item.order_id].push(item);
        });
        setOrderItems(map);
      }
    } catch (err: any) {
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    await supabase
      .from("order_headers")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", orderId);
    await loadOrders();
    showToast("订单状态已更新");
  };

  const totalAmount = (order: OrderHeader) =>
    (order.subtotal_items || 0) + (order.shipping_total || 0) + (order.tax_total || 0) - (order.discount_price || 0);

  const statusOptions = ["pending_payment", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"];

  if (loading) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center h-full">
        <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex flex-col items-center py-12">
          <p className="text-sm text-foreground-500 mb-4">{error}</p>
          <button onClick={loadOrders} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium whitespace-nowrap">重试</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {toast && (
        <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground-950">交易管理</h1>
          <p className="mt-1 text-sm text-foreground-500">共 {orders.length} 笔订单</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "总订单", value: orders.length, color: "text-foreground-950" },
          { label: "待付款", value: orders.filter((o) => o.status === "pending_payment").length, color: "text-yellow-600" },
          { label: "已完成", value: orders.filter((o) => o.status === "delivered").length, color: "text-green-600" },
          {
            label: "总收入",
            value: `¥${orders
              .filter((o) => o.status === "paid" || o.status === "shipped" || o.status === "delivered")
              .reduce((sum, o) => sum + totalAmount(o), 0)
              .toLocaleString()}`,
            color: "text-primary-500",
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-background-50 rounded-xl p-4 border border-background-200/70">
            <p className="text-xs text-foreground-500">{stat.label}</p>
            <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
            statusFilter === "all" ? "bg-primary-500 text-white" : "text-foreground-600 hover:bg-background-100"
          }`}
        >
          全部
        </button>
        {statusOptions.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
              statusFilter === s ? "bg-primary-500 text-white" : "text-foreground-600 hover:bg-background-100"
            }`}
          >
            {statusLabels[s]}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      <div className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">订单号</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">客户</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">商品</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">金额</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">时间</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">状态</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const items = orderItems[order.id] || [];
                const isExpanded = expandedOrder === order.id;
                return (
                  <>
                    <tr
                      key={order.id}
                      className="border-b border-background-200/70 hover:bg-background-50 transition-colors cursor-pointer"
                      onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                    >
                      <td className="px-4 py-3 text-foreground-800 font-mono text-xs">#{String(order.id).padStart(6, "0")}</td>
                      <td className="px-4 py-3 text-foreground-700 text-xs">
                        {order.recipient?.name || order.customer_id || "匿名"}
                      </td>
                      <td className="px-4 py-3 text-foreground-700 text-xs max-w-[180px] truncate">
                        {items.map((i) => i.product_name).join("、") || "-"}
                      </td>
                      <td className="px-4 py-3 text-foreground-800 font-medium text-sm">
                        ¥{totalAmount(order).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-foreground-500 text-xs whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={order.status || "pending_payment"}
                          onChange={(e) => handleStatusChange(order.id, e.target.value)}
                          className={`px-2 py-1 rounded-full text-xs font-medium border-0 outline-none cursor-pointer ${statusColors[order.status || "pending_payment"]}`}
                        >
                          {statusOptions.map((s) => (
                            <option key={s} value={s}>{statusLabels[s]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <i className={`ri-${isExpanded ? "arrow-up-s" : "arrow-down-s"}-line text-foreground-400`}></i>
                      </td>
                    </tr>
                    {isExpanded && items.length > 0 && (
                      <tr key={`expanded-${order.id}`}>
                        <td colSpan={7} className="px-4 py-3 bg-background-50/50">
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-foreground-500">订单明细</p>
                            {items.map((item) => (
                              <div key={item.id} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-4">
                                  <span className="text-foreground-800">{item.product_name}</span>
                                  <span className="text-foreground-400">x{item.quantity}</span>
                                </div>
                                <span className="text-foreground-700">¥{(item.final_price * item.quantity).toFixed(2)}</span>
                              </div>
                            ))}
                            {order.recipient && Object.keys(order.recipient).length > 0 && (
                              <div className="mt-2 pt-2 border-t border-background-200/70 text-xs text-foreground-400">
                                收货人: {order.recipient.name} | {order.recipient.phone} | {[order.recipient.state, order.recipient.city, order.recipient.address].filter(Boolean).join(" ")}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}