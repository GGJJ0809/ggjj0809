import { useState } from "react";
import PageSettings from "./PageSettings";
import SettingsForm from "./SettingsForm";

export interface SectionConfig {
  id?: number;
  section_type: string;
  title: string;
  config: Record<string, any>;
  sort_order: number;
  enabled: boolean;
}

interface RightSettingsProps {
  activeTab: "page" | "component";
  onTabChange: (tab: "page" | "component") => void;
  pageConfig: Record<string, any>;
  onPageConfigChange: (config: Record<string, any>) => void;
  selectedSection: SectionConfig | null;
  selectedIndex: number | null;
  onSectionChange: (index: number, section: SectionConfig) => void;
  onToggleEnabled: (index: number) => void;
}

export default function RightSettings({
  activeTab,
  onTabChange,
  pageConfig,
  onPageConfigChange,
  selectedSection,
  selectedIndex,
  onSectionChange,
  onToggleEnabled,
}: RightSettingsProps) {
  return (
    <aside className="w-72 shrink-0 bg-background-50 border-l border-background-200/70 flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-background-200/70">
        <button
          onClick={() => onTabChange("page")}
          className={`flex-1 py-3 text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === "page"
              ? "text-primary-600 border-b-2 border-primary-500"
              : "text-foreground-400 hover:text-foreground-600"
          }`}
        >
          页面设置
        </button>
        <button
          onClick={() => onTabChange("component")}
          className={`flex-1 py-3 text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === "component"
              ? "text-primary-600 border-b-2 border-primary-500"
              : "text-foreground-400 hover:text-foreground-600"
          }`}
        >
          组件设置
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "page" ? (
          <PageSettings config={pageConfig} onChange={onPageConfigChange} />
        ) : selectedSection && selectedIndex !== null ? (
          <div className="space-y-4">
            {/* Component header */}
            <div className="flex items-center justify-between pb-3 border-b border-background-200/70">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded bg-primary-100 flex items-center justify-center">
                  <i className="ri-settings-3-line text-xs text-primary-600"></i>
                </div>
                <span className="text-sm font-semibold text-foreground-800">{selectedSection.title}</span>
              </div>
              <button
                onClick={() => onToggleEnabled(selectedIndex)}
                className={`w-9 h-5 rounded-full transition-colors ${
                  selectedSection.enabled ? "bg-primary-500" : "bg-background-300"
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                  selectedSection.enabled ? "translate-x-4" : "translate-x-0.5"
                }`}></div>
              </button>
            </div>

            {/* Component style section */}
            <div>
              <p className="text-xs font-semibold text-foreground-700 mb-2">组件样式</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-foreground-500 mb-1">外边距</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const updated = { ...selectedSection, config: { ...selectedSection.config, margin: "default" } };
                        onSectionChange(selectedIndex, updated);
                      }}
                      className={`flex-1 py-1.5 rounded-md text-xs border transition-all ${
                        selectedSection.config.margin !== "custom"
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-background-200/70 text-foreground-500"
                      }`}
                    >
                      默认
                    </button>
                    <button
                      onClick={() => {
                        const updated = { ...selectedSection, config: { ...selectedSection.config, margin: "custom" } };
                        onSectionChange(selectedIndex, updated);
                      }}
                      className={`flex-1 py-1.5 rounded-md text-xs border transition-all ${
                        selectedSection.config.margin === "custom"
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-background-200/70 text-foreground-500"
                      }`}
                    >
                      自定义
                    </button>
                  </div>
                </div>
                {selectedSection.config.margin === "custom" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-foreground-400 mb-1">上间距 (px)</label>
                      <input
                        type="number"
                        value={selectedSection.config.marginTop || 0}
                        onChange={(e) => {
                          const updated = { ...selectedSection, config: { ...selectedSection.config, marginTop: Number(e.target.value) } };
                          onSectionChange(selectedIndex, updated);
                        }}
                        className="w-full px-2 py-1.5 rounded border border-background-200/70 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-foreground-400 mb-1">下间距 (px)</label>
                      <input
                        type="number"
                        value={selectedSection.config.marginBottom || 0}
                        onChange={(e) => {
                          const updated = { ...selectedSection, config: { ...selectedSection.config, marginBottom: Number(e.target.value) } };
                          onSectionChange(selectedIndex, updated);
                        }}
                        className="w-full px-2 py-1.5 rounded border border-background-200/70 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-background-200/70"></div>

            {/* Specific settings */}
            <SettingsForm
              section={selectedSection}
              onChange={(cfg) => {
                const updated = { ...selectedSection, config: cfg };
                onSectionChange(selectedIndex, updated);
              }}
              onTitleChange={(t) => {
                const updated = { ...selectedSection, title: t };
                onSectionChange(selectedIndex, updated);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-foreground-300">
            <div className="w-12 h-12 rounded-xl bg-background-100 flex items-center justify-center mb-3">
              <i className="ri-settings-3-line text-xl"></i>
            </div>
            <p className="text-xs">点击中间组件进行设置</p>
          </div>
        )}
      </div>
    </aside>
  );
}