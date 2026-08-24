import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type PaymentProvider = "wechat_pay" | "huifu";

interface PaymentConfig {
  provider: PaymentProvider;
  config_key: string;
  config_value: string;
}

const WECHAT_FIELDS = [
  { key: "enabled", label: "启用微信支付", type: "switch", placeholder: "", group: "basic" },
  { key: "app_id", label: "应用ID (AppID)", type: "text", placeholder: "wx开头或公众号/小程序的AppID", group: "basic" },
  { key: "mch_id", label: "商户号 (MchID)", type: "text", placeholder: "微信支付商户号", group: "basic" },
  { key: "serial_no", label: "证书序列号", type: "text", placeholder: "API证书序列号", group: "cert" },
  { key: "api_v3_key", label: "API v3 密钥", type: "password", placeholder: "32位API v3密钥", group: "cert" },
  { key: "private_key", label: "商户私钥", type: "textarea", placeholder: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----", group: "cert" },
  { key: "notify_url", label: "支付回调地址", type: "text", placeholder: "https://your-domain.com/api/payment/wechat/notify", group: "advanced" },
];

const HUIFU_FIELDS = [
  { key: "enabled", label: "启用汇付天下", type: "switch", placeholder: "", group: "basic" },
  { key: "merchant_id", label: "商户号", type: "text", placeholder: "汇付天下商户号", group: "basic" },
  { key: "product_id", label: "产品编号", type: "text", placeholder: "汇付天下产品编号", group: "basic" },
  { key: "private_key", label: "商户私钥", type: "textarea", placeholder: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----", group: "cert" },
  { key: "public_key", label: "汇付公钥", type: "textarea", placeholder: "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----", group: "cert" },
  { key: "notify_url", label: "支付回调地址", type: "text", placeholder: "https://your-domain.com/api/payment/huifu/notify", group: "advanced" },
];

const TABS: { key: PaymentProvider; label: string; icon: string; desc: string }[] = [
  { key: "wechat_pay", label: "微信支付", icon: "ri-wechat-pay-line", desc: "微信公众号/小程序/App内的微信支付能力" },
  { key: "huifu", label: "汇付天下", icon: "ri-bank-line", desc: "汇付天下聚合支付，支持多种支付方式" },
];

export default function PaymentConfigPage() {
  const [activeTab, setActiveTab] = useState<PaymentProvider>("wechat_pay");
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [originalConfigs, setOriginalConfigs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());

  const currentFields = activeTab === "wechat_pay" ? WECHAT_FIELDS : HUIFU_FIELDS;

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("payment_configs")
        .select("*")
        .eq("provider", activeTab);

      if (error) throw error;

      const map: Record<string, string> = {};
      (data || []).forEach((row: PaymentConfig) => {
        map[row.config_key] = row.config_value || "";
      });
      setConfigs(map);
      setOriginalConfigs(map);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "加载失败";
      showToast("error", msg);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleChange = (key: string, value: string) => {
    setConfigs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSwitchToggle = (key: string) => {
    setConfigs((prev) => ({ ...prev, [key]: prev[key] === "true" ? "false" : "true" }));
  };

  const toggleReveal = (key: string) => {
    setRevealedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const upserts = currentFields.map((field) => ({
        provider: activeTab,
        config_key: field.key,
        config_value: configs[field.key] || "",
      }));

      const { error } = await supabase
        .from("payment_configs")
        .upsert(upserts, { onConflict: "provider,config_key" });

      if (error) throw error;

      setOriginalConfigs({ ...configs });
      showToast("success", "配置保存成功");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      showToast("error", msg);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = () => {
    for (const key of Object.keys(configs)) {
      if (configs[key] !== (originalConfigs[key] || "")) return true;
    }
    for (const key of Object.keys(originalConfigs)) {
      if ((configs[key] || "") !== originalConfigs[key]) return true;
    }
    return false;
  };

  const renderField = (field: (typeof currentFields)[number]) => {
    const value = configs[field.key] || "";

    if (field.type === "switch") {
      return (
        <div key={field.key} className="flex items-center justify-between py-4 px-5 bg-background-50 rounded-xl border border-background-200/70">
          <div>
            <div className="text-sm font-medium text-foreground-900">{field.label}</div>
            <div className="text-xs text-foreground-500 mt-0.5">
              {value === "true" ? "已启用，用户可在前台使用该支付方式" : "未启用"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleSwitchToggle(field.key)}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
              value === "true" ? "bg-primary-500" : "bg-background-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                value === "true" ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      );
    }

    if (field.type === "password") {
      return (
        <div key={field.key} className="space-y-1.5">
          <label className="text-sm font-medium text-foreground-800">{field.label}</label>
          <div className="relative">
            <input
              type={revealedFields.has(field.key) ? "text" : "password"}
              value={value}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="w-full px-4 py-2.5 pr-12 bg-background-50 border border-background-200/70 rounded-lg text-sm text-foreground-900 placeholder-foreground-400 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-colors"
            />
            <button
              type="button"
              onClick={() => toggleReveal(field.key)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-400 hover:text-foreground-600 transition-colors"
            >
              <i className={`${revealedFields.has(field.key) ? "ri-eye-off-line" : "ri-eye-line"} text-base`}></i>
            </button>
          </div>
        </div>
      );
    }

    if (field.type === "textarea") {
      return (
        <div key={field.key} className="space-y-1.5">
          <label className="text-sm font-medium text-foreground-800">{field.label}</label>
          <textarea
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            rows={6}
            className="w-full px-4 py-2.5 bg-background-50 border border-background-200/70 rounded-lg text-sm text-foreground-900 placeholder-foreground-400 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-colors font-mono resize-y"
          />
        </div>
      );
    }

    return (
      <div key={field.key} className="space-y-1.5">
        <label className="text-sm font-medium text-foreground-800">{field.label}</label>
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          className="w-full px-4 py-2.5 bg-background-50 border border-background-200/70 rounded-lg text-sm text-foreground-900 placeholder-foreground-400 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-colors"
        />
      </div>
    );
  };

  const groups = [...new Set(currentFields.map((f) => f.group))];
  const groupLabels: Record<string, string> = {
    basic: "基本设置",
    cert: "证书与密钥",
    advanced: "高级设置",
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-5 w-32 bg-background-200 rounded animate-pulse" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-background-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-lg text-sm font-medium shadow-lg transition-all ${
            toast.type === "success"
              ? "bg-emerald-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          <div className="flex items-center gap-2">
            <i className={`${toast.type === "success" ? "ri-checkbox-circle-line" : "ri-error-warning-line"} text-base`}></i>
            {toast.message}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-foreground-400 mb-1">
          <span>系统配置</span>
          <i className="ri-arrow-right-s-line"></i>
          <span className="text-foreground-600">支付配置</span>
        </div>
        <h1 className="text-2xl font-heading font-bold text-foreground-950">支付配置</h1>
        <p className="text-sm text-foreground-500 mt-1">管理微信支付和汇付天下的支付参数配置</p>
      </div>

      {/* Provider Tabs */}
      <div className="flex gap-2 mb-8">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-3 px-6 py-4 rounded-xl border transition-all text-left ${
              activeTab === tab.key
                ? "bg-background-50 border-primary-400 shadow-sm"
                : "bg-background-100/60 border-transparent hover:border-background-200/70"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                activeTab === tab.key ? "bg-primary-100" : "bg-background-200/70"
              }`}
            >
              <i
                className={`${tab.icon} text-lg ${
                  activeTab === tab.key ? "text-primary-600" : "text-foreground-400"
                }`}
              ></i>
            </div>
            <div>
              <div className="font-semibold text-sm text-foreground-900">{tab.label}</div>
              <div className="text-xs text-foreground-400 mt-0.5">{tab.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Provider Status Banner */}
      <div
        className={`mb-6 px-5 py-3 rounded-xl border text-sm flex items-center gap-3 ${
          configs["enabled"] === "true"
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-background-100 border-background-200 text-foreground-500"
        }`}
      >
        <div
          className={`w-2 h-2 rounded-full ${
            configs["enabled"] === "true" ? "bg-emerald-500" : "bg-foreground-300"
          }`}
        />
        <span>
          {activeTab === "wechat_pay" ? "微信支付" : "汇付天下"}
          {configs["enabled"] === "true" ? "：已启用，正在接收支付请求" : "：未启用，前台不可用"}
        </span>
      </div>

      {/* Config Form */}
      <div className="space-y-8">
        {groups.map((group) => {
          const groupFields = currentFields.filter((f) => f.group === group && f.type !== "switch");
          if (groupFields.length === 0) return null;

          return (
            <section key={group}>
              <h3 className="text-sm font-semibold text-foreground-800 mb-4 uppercase tracking-wide">
                {groupLabels[group] || group}
              </h3>
              <div className="space-y-4">
                {groupFields.map(renderField)}
              </div>
            </section>
          );
        })}

        {/* Switch goes last */}
        <section>
          {currentFields
            .filter((f) => f.type === "switch")
            .map(renderField)}
        </section>
      </div>

      {/* Save Button */}
      <div className="mt-10 pt-6 border-t border-background-200/70 flex items-center gap-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges() || saving}
          className="px-6 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap flex items-center gap-2"
        >
          {saving ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              保存中...
            </>
          ) : (
            <>
              <i className="ri-save-line"></i>
              保存配置
            </>
          )}
        </button>
        {hasChanges() && (
          <span className="text-xs text-foreground-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            有未保存的更改
          </span>
        )}
      </div>

      {/* Documentation Note */}
      <div className="mt-8 p-5 bg-background-100/80 rounded-xl border border-background-200/70">
        <h4 className="text-sm font-semibold text-foreground-800 mb-2 flex items-center gap-2">
          <i className="ri-information-line"></i>
          配置说明
        </h4>
        <ul className="text-xs text-foreground-500 space-y-1.5 leading-relaxed">
          {activeTab === "wechat_pay" ? (
            <>
              <li>• AppID 和 MchID 在微信支付商户平台 (pay.weixin.qq.com) 获取</li>
              <li>• API v3 密钥需要自行设置一个 32 位的随机字符串</li>
              <li>• 证书序列号和商户私钥通过商户平台下载的证书获取</li>
              <li>• 回调地址需要配置为你的服务器接收微信支付通知的 URL</li>
              <li>• 证书和密钥信息将安全存储在服务器端，不会暴露到前端</li>
            </>
          ) : (
            <>
              <li>• 商户号和产品编号在汇付天下商户后台获取</li>
              <li>• 商户私钥由你自行生成并上传公钥到汇付天下后台</li>
              <li>• 汇付公钥从汇付天下商户后台下载</li>
              <li>• 回调地址需要配置为你的服务器接收汇付支付通知的 URL</li>
              <li>• 密钥信息将安全存储在服务器端，不会暴露到前端</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}