import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface OrderItem {
  id: number;
  product_id: string;
  product_name: string;
  quantity: number;
  final_price: number;
  subtotal: number;
  points: number | null;
}

interface Order {
  id: number;
  status: string;
  subtotal_items: number;
  currency: string;
  payment_provider: string;
  recipient: Record<string, string> | null;
  points_total: number | null;
  created_at: string;
  order_items: OrderItem[];
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending_payment: { label: "待支付", color: "text-amber-600", bg: "bg-amber-50" },
  paid: { label: "已支付", color: "text-emerald-600", bg: "bg-emerald-50" },
  processing: { label: "处理中", color: "text-primary-600", bg: "bg-primary-50" },
  shipped: { label: "已发货", color: "text-sky-600", bg: "bg-sky-50" },
  delivered: { label: "已送达", color: "text-indigo-600", bg: "bg-indigo-50" },
  completed: { label: "已完成", color: "text-emerald-600", bg: "bg-emerald-50" },
  cancelled: { label: "已取消", color: "text-foreground-400", bg: "bg-background-100" },
  refunded: { label: "已退款", color: "text-red-500", bg: "bg-red-50" },
};

function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return `¥${Number(n).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function OrdersPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const { data, error: qErr } = await supabase
        .from("order_headers")
        .select("*, order_items(*)")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });

      if (qErr) throw qErr;
      setOrders((data || []) as Order[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth?redirect=/shop/orders", { replace: true });
      return;
    }
    if (user) fetchOrders();
  }, [authLoading, user, navigate, fetchOrders]);

  if (authLoading) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center bg-background-50">
        <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
      </div>
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen pt-16 pb-20 md:pb-8 bg-background-50">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-4 md:py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-foreground-950">我的订单</h1>
          <button
            onClick={() => {
              setRefreshing(true);
              fetchOrders(true);
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-background-200/70 text-sm text-foreground-600 hover:bg-background-100 transition-colors disabled:opacity-50"
          >
            <i className={`ri-refresh-line ${refreshing ? "animate-spin" : ""}`}></i>
            刷新状态
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-foreground-400">
            <i className="ri-loader-4-line animate-spin text-2xl"></i>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24">
            <i className="ri-error-warning-line text-3xl text-foreground-400 mb-2"></i>
            <p className="text-sm text-foreground-600">{error}</p>
            <button onClick={() => fetchOrders()} className="mt-4 px-4 py-2 bg-primary-500 text-white text-sm rounded-lg">
              重试
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-background-100 flex items-center justify-center mx-auto mb-4">
              <i className="ri-file-list-3-line text-2xl text-foreground-300"></i>
            </div>
            <p className="text-sm text-foreground-500 mb-4">还没有订单</p>
            <Link to="/shop" className="inline-block px-5 py-2.5 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 transition-colors">
              去逛逛
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const isPoints = order.payment_provider === "points";
              const st = isPoints
                ? { label: "已兑换", color: "text-accent-700", bg: "bg-accent-100" }
                : STATUS_MAP[order.status] || { label: order.status, color: "text-foreground-600", bg: "bg-background-100" };
              const totalItems = order.order_items?.length || 0;
              const totalQty = order.order_items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0;
              return (
                <div key={order.id} className="bg-white rounded-xl border border-background-200/70 overflow-hidden">
                  <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-background-200/70">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-foreground-400">订单号 {order.id}</span>
                      <span className="text-xs text-foreground-400">{formatTime(order.created_at)}</span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${st.color} ${st.bg}`}>
                      {st.label}
                    </span>
                  </div>

                  <div className="px-4 md:px-5 py-4">
                    {order.order_items?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground-900 line-clamp-1">{item.product_name}</p>
                          <p className="text-xs text-foreground-400 mt-0.5">× {item.quantity}</p>
                        </div>
                        <span className="text-sm font-semibold text-foreground-950">
                          {isPoints ? `${(item.points || 0).toLocaleString("zh-CN")}积分` : formatMoney(item.subtotal)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between px-4 md:px-5 py-3 bg-background-50/60">
                    <span className="text-xs text-foreground-500">
                      共 {totalItems} 种 / {totalQty} 件
                      {order.recipient?.name ? ` · 收货人 ${order.recipient.name}` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-foreground-500">实付</span>
                      <span className="text-base font-bold text-foreground-950">
                        {isPoints ? `${(order.points_total || 0).toLocaleString("zh-CN")}积分` : formatMoney(order.subtotal_items)}
                      </span>
                    </div>
                  </div>

                  {order.status === "pending_payment" && (
                    <div className="px-4 md:px-5 py-3 border-t border-background-200/70 flex items-center justify-end">
                      <button
                        onClick={() => {
                          setRefreshing(true);
                          fetchOrders(true);
                        }}
                        className="px-4 py-2 rounded-lg bg-primary-500 text-white text-xs font-semibold hover:bg-primary-600 transition-colors whitespace-nowrap"
                      >
                        已支付？点击刷新
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}