import { useState } from "react";

interface PageSettingsConfig {
  pageTitle?: string;
  pageDesc?: string;
  backgroundColor?: string;
  marginTop?: string;
  marginBottom?: string;
}

interface PageSettingsProps {
  config: PageSettingsConfig;
  onChange: (config: PageSettingsConfig) => void;
}

export default function PageSettings({ config, onChange }: PageSettingsProps) {
  const update = (key: keyof PageSettingsConfig, value: any) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-foreground-500 mb-1">页面标题</label>
        <input
          type="text"
          value={config.pageTitle || ""}
          onChange={(e) => update("pageTitle", e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm text-foreground-800 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-all"
          placeholder="首页"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground-500 mb-1">页面描述</label>
        <textarea
          value={config.pageDesc || ""}
          onChange={(e) => update("pageDesc", e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm text-foreground-800 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-all resize-none"
          placeholder="SEO描述..."
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground-500 mb-1">页面背景色</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={config.backgroundColor || "#ffffff"}
            onChange={(e) => update("backgroundColor", e.target.value)}
            className="w-10 h-10 rounded border border-background-200/70 cursor-pointer shrink-0"
          />
          <input
            type="text"
            value={config.backgroundColor || "#ffffff"}
            onChange={(e) => update("backgroundColor", e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground-500 mb-1">页面顶部间距</label>
        <select
          value={config.marginTop || "0"}
          onChange={(e) => update("marginTop", e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
        >
          <option value="0">无</option>
          <option value="10">小 (10px)</option>
          <option value="20">中 (20px)</option>
          <option value="40">大 (40px)</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground-500 mb-1">页面底部间距</label>
        <select
          value={config.marginBottom || "0"}
          onChange={(e) => update("marginBottom", e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
        >
          <option value="0">无</option>
          <option value="10">小 (10px)</option>
          <option value="20">中 (20px)</option>
          <option value="40">大 (40px)</option>
        </select>
      </div>
    </div>
  );
}