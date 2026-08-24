import { DragEvent, useRef } from "react";
import SectionRenderer, { SectionConfig } from "@/components/homepage/SectionRenderer";

interface PhonePreviewProps {
  sections: SectionConfig[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  onDelete: (index: number) => void;
  dragIndex: number | null;
  onDragStart: (index: number) => void;
  onDragOver: (e: DragEvent, index: number) => void;
  onDragEnd: () => void;
}

const bottomNavItems = [
  { name: "首页", icon: "ri-home-line" },
  { name: "课程", icon: "ri-graduation-cap-line" },
  { name: "AI教练", icon: "ri-robot-2-line" },
  { name: "活动", icon: "ri-calendar-event-line" },
  { name: "会员", icon: "ri-vip-crown-line" },
];

export default function PhonePreview({
  sections,
  selectedIndex,
  onSelect,
  onDelete,
  dragIndex,
  onDragStart,
  onDragOver,
  onDragEnd,
}: PhonePreviewProps) {
  const isDragging = dragIndex !== null;
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();

    // Auto-scroll during drag when near edges
    if (scrollRef.current) {
      const rect = scrollRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const threshold = 60;
      if (y < threshold) {
        scrollRef.current.scrollTop -= 8;
      } else if (y > rect.height - threshold) {
        scrollRef.current.scrollTop += 8;
      }
    }

    onDragOver(e, index);
  };

  return (
    <div className="flex-1 flex flex-col bg-background-100/50 min-w-0">
      {/* Preview Header */}
      <div className="h-10 shrink-0 flex items-center justify-center border-b border-background-200/70 bg-background-50">
        <span className="text-xs text-foreground-400 font-medium">手机端预览</span>
      </div>

      {/* Scrollable Content */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto overflow-x-hidden ${isDragging ? "overflow-y-hidden" : ""}`}
        style={{ scrollbarWidth: "thin" }}
      >
        <div className="w-[375px] mx-auto min-h-full bg-white border-x border-background-200/70">
          {sections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-foreground-300">
              <div className="w-14 h-14 rounded-2xl bg-background-100 flex items-center justify-center mb-3">
                <i className="ri-stack-line text-xl"></i>
              </div>
              <p className="text-xs font-medium">还没有组件</p>
              <p className="text-[10px] mt-1">从左侧组件库点击添加</p>
            </div>
          ) : (
            <div className="pb-2">
              {sections.map((section, index) => (
                <div
                  key={index}
                  draggable
                  onDragStart={() => onDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={onDragEnd}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(selectedIndex === index ? null : index);
                  }}
                  className={`relative cursor-pointer transition-all ${
                    selectedIndex === index
                      ? "ring-2 ring-primary-500 ring-inset"
                      : "hover:ring-1 hover:ring-primary-300 hover:ring-inset"
                  } ${dragIndex === index ? "opacity-50" : ""}`}
                >
                  {/* Selected badge */}
                  {selectedIndex === index && (
                    <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
                      <div className="px-2 py-1 rounded bg-primary-500 text-white text-[10px] font-medium whitespace-nowrap shadow-sm">
                        {section.title}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(index);
                        }}
                        className="w-6 h-6 rounded bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                        title="删除"
                      >
                        <i className="ri-close-line text-xs"></i>
                      </button>
                    </div>
                  )}

                  {/* Drag handle */}
                  <div className="absolute top-2 left-2 z-20 opacity-0 hover:opacity-100 transition-opacity">
                    <div className="px-1.5 py-0.5 rounded bg-foreground-800/70 text-white text-[10px] cursor-grab active:cursor-grabbing">
                      <i className="ri-draggable"></i>
                    </div>
                  </div>

                  {/* Section content */}
                  <div className={`max-w-full overflow-hidden ${!section.enabled ? "opacity-50 grayscale" : ""}`}>
                    <SectionRenderer section={section} isPreview />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation Bar - always visible */}
      <div className="shrink-0 bg-white border-t border-background-200/70 w-full max-w-[375px] mx-auto">
        <div className="flex items-center justify-around py-2">
          {bottomNavItems.map((item, idx) => (
            <div
              key={item.name}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 min-w-[48px] cursor-pointer ${
                idx === 0 ? "text-primary-500" : "text-foreground-400"
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${idx === 0 ? "bg-primary-100" : ""}`}>
                <i className={`${item.icon} text-base`}></i>
              </div>
              <span className="text-[10px] font-medium whitespace-nowrap">{item.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}