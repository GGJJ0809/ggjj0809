import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface ContentUnit {
  id?: number;
  course_id?: number;
  section_title: string;
  unit_type: "text" | "audio" | "video";
  unit_title: string;
  sort_order: number;
  is_free: boolean;
  content_text: string;
  audio_url: string;
  audio_duration: number;
  video_url: string;
  video_duration: number;
  video_cover: string;
}

interface Props {
  courseId: number;
  courseType: string;
  existingUnits: ContentUnit[];
  onSave: (units: ContentUnit[]) => Promise<void>;
  onCancel: () => void;
}

const emptyUnit = (sort: number, allowedType: string): ContentUnit => ({
  section_title: "",
  unit_type: (allowedType === "mixed" ? "video" : allowedType === "single_text" ? "text" : allowedType === "single_audio" ? "audio" : "video") as ContentUnit["unit_type"],
  unit_title: "",
  sort_order: sort,
  is_free: false,
  content_text: "",
  audio_url: "",
  audio_duration: 0,
  video_url: "",
  video_duration: 0,
  video_cover: "",
});

const typeLabel: Record<string, string> = {
  single_text: "图文",
  single_audio: "音频",
  single_video: "视频",
  mixed: "混合",
};

const getUnitTypeIcon = (t: string) => {
  if (t === "video") return "ri-play-circle-line";
  if (t === "audio") return "ri-music-line";
  return "ri-article-line";
};

const getUnitTypeName = (t: string) => {
  if (t === "video") return "视频";
  if (t === "audio") return "音频";
  return "图文";
};

export default function ContentUnitEditor({ courseType, existingUnits, onSave, onCancel }: Props) {
  const [units, setUnits] = useState<ContentUnit[]>(() => {
    if (existingUnits.length > 0) return existingUnits;
    return [emptyUnit(1, courseType)];
  });
  const [saveLoading, setSaveLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const allowedTypes: string[] =
    courseType === "single_text"
      ? ["text"]
      : courseType === "single_audio"
      ? ["audio"]
      : courseType === "single_video"
      ? ["video"]
      : ["text", "audio", "video"];

  const addUnit = () => {
    if (courseType !== "mixed" && units.length >= 1 && courseType.startsWith("single_")) {
      setMsg("单一类型课程只允许添加一个内容单元");
      setTimeout(() => setMsg(""), 3000);
      return;
    }
    setUnits([...units, emptyUnit(units.length + 1, courseType)]);
  };

  const removeUnit = (idx: number) => {
    if (units.length <= 1) {
      setMsg("至少保留一个内容单元");
      setTimeout(() => setMsg(""), 3000);
      return;
    }
    const updated = units.filter((_, i) => i !== idx).map((u, i) => ({ ...u, sort_order: i + 1 }));
    setUnits(updated);
  };

  const updateUnit = (idx: number, field: keyof ContentUnit, value: any) => {
    setUnits((prev) => prev.map((u, i) => (i === idx ? { ...u, [field]: value } : u)));
  };

  const moveUnit = (idx: number, dir: "up" | "down") => {
    if (dir === "up" && idx === 0) return;
    if (dir === "down" && idx === units.length - 1) return;
    const updated = [...units];
    const swap = dir === "up" ? idx - 1 : idx + 1;
    [updated[idx], updated[swap]] = [updated[swap], updated[idx]];
    setUnits(updated.map((u, i) => ({ ...u, sort_order: i + 1 })));
  };

  const handleSave = async () => {
    for (const u of units) {
      if (!u.unit_title.trim()) {
        setMsg("请为所有单元填写标题");
        setTimeout(() => setMsg(""), 3000);
        return;
      }
    }
    setSaveLoading(true);
    await onSave(units);
    setSaveLoading(false);
  };

  return (
    <div className="space-y-4">
      {msg && (
        <div className="px-3 py-2 rounded-lg bg-accent-100 text-accent-700 text-xs">{msg}</div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-foreground-500">
          课程类型：{typeLabel[courseType] || courseType} — 可添加{" "}
          {courseType === "mixed" ? "图文/音频/视频" : getUnitTypeName(allowedTypes[0])} 单元
        </p>
        <button
          onClick={addUnit}
          className="px-3 py-1.5 rounded-full bg-accent-500 text-white text-xs font-medium hover:bg-accent-600 transition-all whitespace-nowrap"
        >
          <i className="ri-add-line mr-1"></i>添加单元
        </button>
      </div>

      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
        {units.map((unit, idx) => (
          <div
            key={idx}
            className="bg-background-50 border border-background-200/70 rounded-lg p-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-background-100 flex items-center justify-center text-xs font-medium text-foreground-500">
                  {idx + 1}
                </span>
                {courseType === "mixed" ? (
                  <select
                    value={unit.unit_type}
                    onChange={(e) => updateUnit(idx, "unit_type", e.target.value)}
                    className="px-2 py-1 rounded border border-background-200/70 bg-background-50 text-xs"
                  >
                    <option value="video">视频</option>
                    <option value="audio">音频</option>
                    <option value="text">图文</option>
                  </select>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-background-100 text-xs text-foreground-600">
                    <i className={`${getUnitTypeIcon(unit.unit_type)} mr-1`}></i>
                    {getUnitTypeName(unit.unit_type)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveUnit(idx, "up")}
                  className="w-6 h-6 rounded flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
                  title="上移"
                >
                  <i className="ri-arrow-up-s-line text-sm"></i>
                </button>
                <button
                  onClick={() => moveUnit(idx, "down")}
                  className="w-6 h-6 rounded flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
                  title="下移"
                >
                  <i className="ri-arrow-down-s-line text-sm"></i>
                </button>
                <button
                  onClick={() => removeUnit(idx)}
                  className="w-6 h-6 rounded flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all"
                  title="删除"
                >
                  <i className="ri-delete-bin-line text-sm"></i>
                </button>
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-foreground-400 mb-1">
                    章节标题
                  </label>
                  <input
                    type="text"
                    value={unit.section_title}
                    onChange={(e) => updateUnit(idx, "section_title", e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-background-200/70 bg-background-50 text-xs"
                    placeholder="如：第一章"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground-400 mb-1">
                    单元标题 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={unit.unit_title}
                    onChange={(e) => updateUnit(idx, "unit_title", e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-background-200/70 bg-background-50 text-xs"
                    placeholder="如：1.1 课程介绍"
                  />
                </div>
              </div>

              {unit.unit_type === "text" && (
                <div>
                  <label className="block text-[11px] font-medium text-foreground-400 mb-1">
                    图文内容（富文本）
                  </label>
                  <textarea
                    value={unit.content_text}
                    onChange={(e) => updateUnit(idx, "content_text", e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-background-200/70 bg-background-50 text-xs h-24 resize-none"
                    placeholder="在此输入图文内容..."
                  />
                </div>
              )}

              {unit.unit_type === "audio" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-foreground-400 mb-1">
                      音频 URL
                    </label>
                    <input
                      type="text"
                      value={unit.audio_url}
                      onChange={(e) => updateUnit(idx, "audio_url", e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-background-200/70 bg-background-50 text-xs"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-foreground-400 mb-1">
                      音频时长（秒）
                    </label>
                    <input
                      type="number"
                      value={unit.audio_duration}
                      onChange={(e) => updateUnit(idx, "audio_duration", Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded border border-background-200/70 bg-background-50 text-xs"
                      min="0"
                    />
                  </div>
                </div>
              )}

              {unit.unit_type === "video" && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-foreground-400 mb-1">
                      视频 URL
                    </label>
                    <input
                      type="text"
                      value={unit.video_url}
                      onChange={(e) => updateUnit(idx, "video_url", e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-background-200/70 bg-background-50 text-xs"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-foreground-400 mb-1">
                      视频时长（秒）
                    </label>
                    <input
                      type="number"
                      value={unit.video_duration}
                      onChange={(e) => updateUnit(idx, "video_duration", Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded border border-background-200/70 bg-background-50 text-xs"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-foreground-400 mb-1">
                      视频封面 URL
                    </label>
                    <input
                      type="text"
                      value={unit.video_cover}
                      onChange={(e) => updateUnit(idx, "video_cover", e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-background-200/70 bg-background-50 text-xs"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={unit.is_free}
                  onChange={(e) => updateUnit(idx, "is_free", e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-background-300 text-accent-500 focus:ring-accent-400"
                />
                <span className="text-[11px] text-foreground-500">设为试看单元</span>
              </label>
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-background-200/70">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-xs font-medium hover:bg-background-50 transition-all whitespace-nowrap"
        >
          返回
        </button>
        <button
          onClick={handleSave}
          disabled={saveLoading}
          className="px-5 py-2 rounded-full bg-primary-500 text-white text-xs font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap"
        >
          {saveLoading ? "保存中..." : "保存内容单元"}
        </button>
      </div>
    </div>
  );
}