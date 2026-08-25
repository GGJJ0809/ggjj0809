import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface SettingRow {
  key: string;
  value: string;
  type: string;
}

type TabKey = "methods" | "smtp" | "sms";

const TABS: { key: TabKey; label: string; icon: string; desc: string }[] = [
  { key: "methods", label: "登录方式", icon: "ri-login-box-line", desc: "控制前台可用的登录与注册方式" },
  { key: "smtp", label: "邮箱服务", icon: "ri-mail-send-line", desc: "邮件发送服务（SMTP）参数配置" },
  { key: "sms", label: "短信服务", icon: "ri-chat-smile-2-line", desc: "短信验证码发送服务参数配置" },
];

// 登录方式开关（默认值）
const METHOD_SWITCHES = [
  { key: "auth_email_login_enabled", label: "邮箱密码登录", desc: "关闭后前台不再显示「密码登录」", def: "true" },
  { key: "auth_email_signup_enabled", label: "邮箱注册", desc: "关闭后前台不再显示「注册」入口", def: "true" },
  { key: "auth_email_confirmation_enabled", label: "邮箱验证", desc: "开启后新注册用户需验证邮箱", def: "false" },
  { key: "auth_phone_login_enabled", label: "手机验证码登录", desc: "关闭后前台不再显示「验证码登录」", def: "true" },
];

// SMTP 字段
const SMTP_FIELDS = [
  { key: "smtp_host", label: "SMTP 服务器", type: "text", placeholder: "如 smtp.example.com" },
  { key: "smtp_port", label: "SMTP 端口", type: "text", placeholder: "如 465（SSL）或 587" },
  { key: "smtp_username", label: "SMTP 账号", type: "text", placeholder: "发信账号" },
  { key: "smtp_password", label: "SMTP 密码 / 授权码", type: "password", placeholder: "邮箱授权码" },
  { key: "smtp_from_name", label: "发件人名称", type: "text", placeholder: "如 引力场平台" },
  { key: "smtp_from_email", label: "发件邮箱", type: "text", placeholder: "noreply@example.com" },
];

// 短信字段
const SMS_FIELDS = [
  { key: "sms_provider", label: "短信服务商", type: "text", placeholder: "如 阿里云短信" },
  { key: "sms_sign_name", label: "短信签名", type: "text", placeholder: "如 引力场" },
  { key: "sms_template_code", label: "验证码模板 CODE", type: "text", placeholder: "如 SMS_123456789" },
];

export default function AuthConfigPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("methods");
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [originalConfigs, setOriginalConfigs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());

  const allKeys = [
    ...METHOD_SWITCHES.map((f) => f.key),
    ...SMTP_FIELDS.map((f) => f.key),
    ...SMS_FIELDS.map((f) => f.key),
  ];

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value, type")
        .in("key", allKeys);

      if (error) throw error;

      const map: Record<string, string> = {};
      (data || []).forEach((row: SettingRow) => {
        map[row.key] = row.value || "";
      });
      setConfigs(map);
      setOriginalConfigs(map);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "加载失败";
      showToast("error", msg);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleToggle = (key: string) => {
    setConfigs((prev) => ({
      ...prev,
      [key]: prev[key] === "true" ? "false" : "true",
    }));
  };

  const toggleReveal = (key: string) => {
    setRevealedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const valueOf = (key: string, def = "") => (configs[key] === undefined ? def : configs[key]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const rows = [
        ...METHOD_SWITCHES.map((f) => ({
          key: f.key,
          value: valueOf(f.key, f.def) === "true" ? "true" : "false",
          type: "auth",
        })),
        ...SMTP_FIELDS.map((f) => ({
          key: f.key,
          value: configs[f.key] || "",
          type: "smtp",
        })),
        ...SMS_FIELDS.map((f) => ({
          key: f.key,
          value: configs[f.key] || "",
          type: "sms",
        })),
      ];

      const { error } = await supabase
        .from("site_settings")
        .upsert(rows, { onConflict: "key" });

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
    for (const key of allKeys) {
      const cur = key.startsWith("auth_") ? (valueOf(key, "") === "true" ? "true" : "false") : configs[key] || "";
      const orig = originalConfigs[key] === undefined ? "" : originalConfigs[key];
      if (cur !== orig) return true;
    }
    return false;
  };

  const renderSwitch = (field: (typeof METHOD_SWITCHES)[number]) => {
    const val = valueOf(field.key, field.def) === "true";
    return (
      <div
        key={field.key}
        className="flex items-center justify-between py-4 px-5 bg-background-50 rounded-xl border border-background-200/70"
      >
        <div>
          <div className="text-sm font-medium text-foreground-900">{field.label}</div>
          <div className="text-xs text-foreground-500 mt-0.5">{field.desc}</div>
        </div>
        <button
          type="button"
          onClick={() => handleToggle(field.key)}
          className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
            val ? "bg-primary-500" : "bg-background-300"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
              val ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    );
  };

  const renderField = (field: { key: string; label: string; type: string; placeholder: string }) => {
    const value = configs[field.key] || "";

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

  if (loading) {
    return (
      <div className="p-6 md:p-8">
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
            toast.type === "success" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
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
          <span className="text-foreground-600">账号与登录配置</span>
        </div>
        <h1 className="text-2xl font-heading font-bold text-foreground-950">账号与登录配置</h1>
        <p className="text-sm text-foreground-500 mt-1">管理登录方式、邮箱服务与短信验证码配置</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 flex-wrap">
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
              <i className={`${tab.icon} text-lg ${activeTab === tab.key ? "text-primary-600" : "text-foreground-400"}`}></i>
            </div>
            <div>
              <div className="font-semibold text-sm text-foreground-900 whitespace-nowrap">{tab.label}</div>
              <div className="text-xs text-foreground-400 mt-0.5 hidden sm:block">{tab.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "methods" && (
        <div className="space-y-3">{METHOD_SWITCHES.map(renderSwitch)}</div>
      )}

      {activeTab === "smtp" && (
        <div className="space-y-4 max-w-2xl">{SMTP_FIELDS.map(renderField)}</div>
      )}

      {activeTab === "sms" && (
        <div className="space-y-4 max-w-2xl">
          {SMS_FIELDS.map(renderField)}
          <div className="p-4 bg-accent-100/60 rounded-xl border border-accent-200/60 text-sm text-foreground-600">
            <div className="flex gap-2">
              <i className="ri-information-line mt-0.5 text-accent-700"></i>
              <p className="leading-relaxed">
                短信服务的 AccessKey 密钥等敏感信息需存储在服务端密钥（Backend Secrets）中，由短信发送接口安全读取，不会暴露到前端。此处配置签名与模板 CODE 等非敏感参数。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Save */}
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
    </div>
  );
}