import { useState, useEffect, useCallback, DragEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import LeftPalette, { ComponentCategory } from "./components/LeftPalette";
import PhonePreview from "./components/PhonePreview";
import RightSettings, { SectionConfig } from "./components/RightSettings";
import DeleteModal from "./components/DeleteModal";

const COMPONENT_CATEGORIES: ComponentCategory[] = [
  {
    name: "基础组件",
    items: [
      { type: "carousel", label: "轮播图", icon: "ri-image-line" },
      { type: "image_nav", label: "图文导航", icon: "ri-apps-line" },
      { type: "search", label: "搜索", icon: "ri-search-line" },
      { type: "image_ad", label: "图文广告", icon: "ri-advertisement-line" },
      { type: "rich_text", label: "富文本", icon: "ri-text" },
      { type: "announcement", label: "公告", icon: "ri-megaphone-line" },
      { type: "audio", label: "音频", icon: "ri-music-line" },
      { type: "video", label: "视频", icon: "ri-video-line" },
    ],
  },
  {
    name: "商品组件",
    items: [
      { type: "knowledge_product", label: "知识商品", icon: "ri-book-open-line" },
      { type: "distribution_product", label: "分销商品", icon: "ri-share-line" },
      { type: "live", label: "直播", icon: "ri-live-line" },
    ],
  },
  {
    name: "营销组件",
    items: [
      { type: "coupon", label: "优惠券", icon: "ri-coupon-line" },
      { type: "promotion", label: "限时促销", icon: "ri-timer-flash-line" },
    ],
  },
];

function getDefaultConfig(type: string): Record<string, any> {
  switch (type) {
    case "carousel":
      return { slides: [{ image: "", link: "", alt: "" }], autoplay: true, interval: 3000, showDots: true, height: 500 };
    case "image_nav":
      return { items: [{ icon: "ri-home-line", text: "导航项", link: "/" }], columns: 4, style: "rounded" };
    case "search":
      return { placeholder: "搜索课程、AI工具...", scope: "all" };
    case "image_ad":
      return { image: "", title: "", subtitle: "", description: "", buttonText: "", buttonLink: "", layout: "left-right" };
    case "rich_text":
      return { content: "<p>请输入内容...</p>", backgroundColor: "#ffffff", padding: "medium" };
    case "announcement":
      return { text: "请输入公告内容", backgroundColor: "#fff8e1", icon: "ri-megaphone-line", closable: true };
    case "audio":
      return { title: "音频标题", audioUrl: "", coverImage: "" };
    case "video":
      return { title: "视频标题", videoUrl: "", coverImage: "", autoplay: false };
    case "knowledge_product":
      return { productIds: [], displayCount: 4, layout: "grid" };
    case "distribution_product":
      return { productIds: [], displayCount: 4, layout: "grid" };
    case "live":
      return { title: "直播标题", coverImage: "", scheduledTime: "", status: "upcoming", roomId: "" };
    case "coupon":
      return { coupons: [{ title: "优惠券", amount: "10", condition: "满100可用", expireDate: "" }], style: "card" };
    case "promotion":
      return { title: "限时特惠", endTime: "", products: [], backgroundColor: "#ff6b35", showCountdown: true };
    default:
      return {};
  }
}

function getSectionLabel(type: string): string {
  const all = COMPONENT_CATEGORIES.flatMap((c) => c.items);
  return all.find((i) => i.type === type)?.label || type;
}

export default function HomepageEditor() {
  const [sections, setSections] = useState<SectionConfig[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"page" | "component">("component");
  const [pageConfig, setPageConfig] = useState<Record<string, any>>({ pageTitle: '首页', pageDesc: '', backgroundColor: '#ffffff', marginTop: '0', marginBottom: '0' });

  // Load sections
  const loadSections = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("homepage_sections")
      .select("*")
      .order("sort_order", { ascending: true });
    if (!error && data) {
      setSections(data as SectionConfig[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  // Add section
  const addSection = (type: string) => {
    const newSection: SectionConfig = {
      section_type: type,
      title: getSectionLabel(type),
      config: getDefaultConfig(type),
      sort_order: sections.length,
      enabled: true,
    };
    const updated = [...sections, newSection];
    setSections(updated);
    setSelectedIndex(updated.length - 1);
    setActiveTab("component");
  };

  // Remove section
  const removeSection = (index: number) => {
    const updated = sections.filter((_, i) => i !== index).map((s, i) => ({ ...s, sort_order: i }));
    setSections(updated);
    if (selectedIndex === index) setSelectedIndex(null);
    else if (selectedIndex !== null && selectedIndex > index) setSelectedIndex(selectedIndex - 1);
    setDeleteIndex(null);
  };

  // Toggle enabled
  const toggleEnabled = (index: number) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    setSections(updated);
  };

  // Update section
  const updateSection = (index: number, section: SectionConfig) => {
    const updated = [...sections];
    updated[index] = section;
    setSections(updated);
  };

  // Drag & Drop handlers
  const handleDragStart = (index: number) => setDragIndex(index);

  const handleDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const updated = [...sections];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(index, 0, moved);
    const reordered = updated.map((s, i) => ({ ...s, sort_order: i }));
    setSections(reordered);
    setDragIndex(index);
    if (selectedIndex === dragIndex) setSelectedIndex(index);
  };

  const handleDragEnd = () => setDragIndex(null);

  // Save all
  const saveAll = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      await supabase.from("homepage_sections").delete().neq("id", 0);
      const toInsert = sections.map((s) => ({
        section_type: s.section_type,
        title: s.title,
        config: s.config,
        sort_order: s.sort_order,
        enabled: s.enabled,
      }));
      const { error } = await supabase.from("homepage_sections").insert(toInsert);
      if (error) throw error;
      setSaveMsg("保存成功！刷新首页即可看到最新效果。");
      await loadSections();
    } catch (err: any) {
      setSaveMsg("保存失败：" + (err?.message || "未知错误"));
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 4000);
  };

  const selectedSection = selectedIndex !== null ? sections[selectedIndex] : null;

  return (
    <div className="h-full flex flex-col bg-background-50">
      {/* Top Bar */}
      <header className="h-14 shrink-0 bg-background-50 border-b border-background-200/70 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 text-foreground-500 hover:text-foreground-800 transition-colors">
            <i className="ri-arrow-left-line text-lg"></i>
            <span className="text-sm font-medium whitespace-nowrap">返回首页</span>
          </Link>
          <span className="text-foreground-300">|</span>
          <h1 className="text-sm font-semibold text-foreground-900 whitespace-nowrap">
            <i className="ri-layout-masonry-line mr-1.5"></i>首页编辑器
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { window.open("/", "_blank"); }}
            className="px-3 py-1.5 rounded-md bg-background-100 text-foreground-600 text-xs font-medium hover:text-foreground-800 transition-all whitespace-nowrap"
          >
            <i className="ri-eye-line mr-1"></i>保存并预览
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            className="px-4 py-1.5 rounded-md bg-primary-500 text-white text-xs font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap"
          >
            <i className={`${saving ? "ri-loader-4-line animate-spin" : "ri-save-line"} mr-1`}></i>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Palette */}
        <LeftPalette categories={COMPONENT_CATEGORIES} onAdd={addSection} />

        {/* Center: Phone Preview */}
        <PhonePreview
          sections={sections}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onDelete={setDeleteIndex}
          dragIndex={dragIndex}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        />

        {/* Right Settings */}
        <RightSettings
          activeTab={activeTab}
          onTabChange={setActiveTab}
          pageConfig={pageConfig}
          onPageConfigChange={setPageConfig}
          selectedSection={selectedSection}
          selectedIndex={selectedIndex}
          onSectionChange={updateSection}
          onToggleEnabled={toggleEnabled}
        />
      </div>

      {/* Delete Modal */}
      {deleteIndex !== null && (
        <DeleteModal
          title={sections[deleteIndex]?.title || "未命名"}
          onConfirm={() => removeSection(deleteIndex)}
          onCancel={() => setDeleteIndex(null)}
        />
      )}

      {/* Save Toast */}
      {saveMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-foreground-900 text-white text-sm shadow-lg whitespace-nowrap">
          {saveMsg}
        </div>
      )}
    </div>
  );
}