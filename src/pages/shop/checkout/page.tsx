import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface Product {
  id: number;
  name: string;
  cover_image: string;
  price: number;
  is_virtual: boolean;
  stock: number;
}

const PROVINCES = [
  "北京市", "上海市", "广东省", "浙江省", "江苏省", "四川省", "湖北省", "湖南省",
  "福建省", "山东省", "河南省", "河北省", "陕西省", "重庆市", "天津市", "其他",
];

function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return `¥${Number(n).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const productId = searchParams.get("product_id");
  const qty = Math.max(1, parseInt(searchParams.get("qty") || "1", 10) || 1);

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 收货地址表单
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // 登录守卫
  useEffect(() => {
    if (!authLoading && !user) {
      navigate(
        `/auth?redirect=${encodeURIComponent(`/shop/checkout?product_id=${productId}&qty=${qty}`)}`,
        { replace: true },
      );
    }
  }, [authLoading, user, navigate, productId, qty]);

  const fetchProduct = useCallback(async () => {
    if (!productId) {
      setError("缺少商品信息");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error: qErr } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .maybeSingle();
      if (qErr) throw qErr;
      if (!data) throw new Error("商品不存在");
      setProduct(data as Product);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  const handleSubmit = async () => {
    setSubmitError("");
    if (!product) return;
    if (!name.trim() || !phone.trim() || !province || !city || !address.trim()) {
      setSubmitError("请完整填写收货地址");
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) {
      setSubmitError("请输入正确的手机号");
      return;
    }

    setSubmitting(true);
    try {
      const recipient = {
        name: name.trim(),
        phone: phone.trim(),
        state: province,
        city: city.trim(),
        address: address.trim(),
      };

      const { data, error: fnErr } = await supabase.functions.invoke("wechat-h5-prepay", {
        body: { product_id: product.id, quantity: qty, recipient },
      });

      if (fnErr) {
        setSubmitError(fnErr.message || "支付发起失败");
        return;
      }

      if (!data || data.error) {
        setSubmitError(data?.error || "支付尚未配置，请稍后再试");
        return;
      }

      // 拉起微信 H5 支付（外部跳转）
      if (data.h5_url) {
        window.location.assign(data.h5_url);
      } else {
        setSubmitError("未获取到支付链接");
      }
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "支付发起失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center bg-background-50">
        <div className="flex items-center gap-2 text-foreground-400">
          <i className="ri-loader-4-line animate-spin text-xl"></i>
          <span className="text-sm">加载中…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen pt-16 pb-20 md:pb-8 bg-background-50">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-8">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-900 transition-colors mb-4"
        >
          <i className="ri-arrow-left-line"></i>
          返回
        </button>

        <h1 className="text-xl md:text-2xl font-bold text-foreground-950 mb-6">确认订单</h1>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-foreground-400">
            <i className="ri-loader-4-line animate-spin text-2xl"></i>
          </div>
        ) : error || !product ? (
          <div className="flex flex-col items-center justify-center py-20">
            <i className="ri-error-warning-line text-3xl text-foreground-400 mb-2"></i>
            <p className="text-sm text-foreground-600">{error || "商品不存在"}</p>
            <button
              onClick={() => navigate("/shop")}
              className="mt-4 px-4 py-2 bg-primary-500 text-white text-sm rounded-lg"
            >
              返回商城
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 收货地址 */}
            <section className="bg-white rounded-xl border border-background-200/70 p-5">
              <div className="flex items-center gap-2 mb-4">
                <i className="ri-map-pin-line text-primary-500 text-lg"></i>
                <h2 className="text-base font-bold text-foreground-950">收货地址</h2>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground-800">收货人</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="姓名"
                      className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground-800">手机号</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="11 位手机号"
                      className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground-800">省份</label>
                    <select
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    >
                      <option value="">请选择</option>
                      {PROVINCES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground-800">城市</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="城市 / 区县"
                      className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground-800">详细地址</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="街道、门牌号、小区等"
                    className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
              </div>
            </section>

            {/* 商品摘要 */}
            <section className="bg-white rounded-xl border border-background-200/70 p-5">
              <h2 className="text-base font-bold text-foreground-950 mb-4">商品信息</h2>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-background-100 shrink-0">
                  <img src={product.cover_image} alt={product.name} className="w-full h-full object-cover object-top" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground-950 line-clamp-1">{product.name}</p>
                  <p className="text-xs text-foreground-400 mt-1">数量 × {qty}</p>
                </div>
                <span className="text-base font-bold text-foreground-950 whitespace-nowrap">
                  {formatMoney(product.price * qty)}
                </span>
              </div>
              <div className="mt-4 pt-4 border-t border-background-200/70 flex items-center justify-between">
                <span className="text-sm text-foreground-500">应付金额</span>
                <span className="text-xl font-bold text-foreground-950">{formatMoney(product.price * qty)}</span>
              </div>
            </section>

            {submitError && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <i className="ri-error-warning-line mt-0.5"></i>
                <span>{submitError}</span>
              </div>
            )}

            {/* 提交 */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3.5 rounded-xl bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  正在发起支付…
                </>
              ) : (
                <>
                  <i className="ri-wechat-pay-line text-lg"></i>
                  提交订单并支付 {formatMoney(product.price * qty)}
                </>
              )}
            </button>
            <p className="text-center text-xs text-foreground-400">
              点击支付即表示同意《用户协议》，支付将由微信支付完成
            </p>
          </div>
        )}
      </div>
    </main>
  );
}