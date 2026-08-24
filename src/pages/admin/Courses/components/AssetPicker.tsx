import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface ContentAsset {
  id: number;
  asset_type: "text" | "audio" | "video";
  title: string;
  category_id: number | null;
  chapter_id: number | null;
  category_name?: string;
  chapter_name?: string;
  audio_duration: number | null;
  video_duration: number | null;
  is_free_preview: boolean;
  status: string;
  /* full fields for lesson creation */
  audio_url?: string;
  video_url?: string;
  content_text?: string;
}

interface CategoryOption {
  id: number;
  name: string;
}

interface ChapterOption {
  id: number;
  name: string;
  category_id: number | null;
}

interface PickedAsset {
  asset_id: number;
  asset: ContentAsset;
  sort_order: number;
  is_free_trial: boolean;
}

interface ChapterGroup {
  tempId: string;
  name: string;
  assets: PickedAsset[];
}

export interface AssetPickerResult {
  chapters: ChapterGroup[];
  ungrouped: PickedAsset[];
}

interface Props {
  existingPicks?: PickedAsset[];
  existingChapters?: ChapterGroup[];
  onSave: (result: AssetPickerResult) => void;
  onCancel: () => void;
}

const TYPE_CONFIG: Record<string, { label: string; icon: string }> = {
  text: { label: "图文", icon: "ri-article-line" },
  audio: { label: "音频", icon: "ri-music-line" },
  video: { label: "视频", icon: "ri-play-circle-line" },
};

let tempIdCounter = 1;
const genTempId = () => `ch_${Date.now()}_${tempIdCounter++}`;

export default function AssetPicker({ existingPicks, existingChapters, onSave, onCancel }: Props) {
  const [allAssets, setAllAssets] = useState<ContentAsset[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [chapters, setChapters] = useState<ChapterOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [chaptersData, setChaptersData] = useState<ChapterGroup[]>(existingChapters || []);
  const [ungrouped, setUngrouped] = useState<PickedAsset[]>(existingPicks || []);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);

  /* new chapter input */
  const [showNewChapter, setShowNewChapter] = useState(false);
  const [newChapterName, setNewChapterName] = useState("");

  /* expanded chapters tracking */
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [showUngrouped, setShowUngrouped] = useState(true);

  /* filters */
  const [filterType, setFilterType] = useState("all");
  const [filterCategoryId, setFilterCategoryId] = useState("all");
  const [filterChapterId, setFilterChapterId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [catRes, chapRes, assetRes] = await Promise.all([
          supabase.from("content_categories").select("id, name").is("deleted_at", null).order("sort_order"),
          supabase.from("content_chapters").select("id, name, category_id").is("deleted_at", null).order("sort_order"),
          supabase.from("content_assets").select("id, asset_type, title, category_id, chapter_id, audio_duration, video_duration, is_free_preview, status, audio_url, video_url, content_text").eq("status", "published").is("deleted_at", null).order("created_at", { ascending: false }),
        ]);

        const catMap = new Map<number, string>();
        (catRes.data || []).forEach((c: any) => catMap.set(c.id, c.name));
        setCategories(catRes.data || []);

        const chapMap = new Map<number, string>();
        (chapRes.data || []).forEach((c: any) => chapMap.set(c.id, c.name));
        setChapters(chapRes.data || []);

        const assets: ContentAsset[] = (assetRes.data || []).map((a: any) => ({
          ...a,
          category_name: a.category_id ? catMap.get(a.category_id) : undefined,
          chapter_name: a.chapter_id ? chapMap.get(a.chapter_id) : undefined,
        }));
        setAllAssets(assets);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* init expanded state for existing chapters */
  useEffect(() => {
    if (chaptersData.length > 0) {
      setExpandedChapters(new Set(chaptersData.map(c => c.tempId)));
    }
  }, []);

  /* collect all picked IDs */
  const allPickedIds = new Set<number>([
    ...ungrouped.map(p => p.asset_id),
    ...chaptersData.flatMap(ch => ch.assets.map(a => a.asset_id)),
  ]);

  const filteredChapers = filterCategoryId === "all" || filterCategoryId === "none"
    ? chapters
    : chapters.filter((ch) => ch.category_id === null || ch.category_id === Number(filterCategoryId));

  const available = allAssets.filter((a) => {
    if (allPickedIds.has(a.id)) return false;
    if (filterType !== "all" && a.asset_type !== filterType) return false;
    if (filterCategoryId !== "all") {
      if (filterCategoryId === "none") { if (a.category_id !== null) return false; }
      else if (a.category_id !== Number(filterCategoryId)) return false;
    }
    if (filterChapterId !== "all") {
      if (filterChapterId === "none") { if (a.chapter_id !== null) return false; }
      else if (a.chapter_id !== Number(filterChapterId)) return false;
    }
    if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  /* ---- Chapter CRUD ---- */
  const startNewChapter = () => {
    setShowNewChapter(true);
    setNewChapterName("");
  };

  const confirmNewChapter = () => {
    const name = newChapterName.trim();
    if (!name) return;
    const tempId = genTempId();
    setChaptersData(prev => [...prev, { tempId, name, assets: [] }]);
    setExpandedChapters(prev => new Set(prev).add(tempId));
    setActiveChapterId(tempId);
    setShowNewChapter(false);
    setNewChapterName("");
  };

  const deleteChapter = (tempId: string) => {
    const chapter = chaptersData.find(ch => ch.tempId === tempId);
    if (!chapter) return;
    const reordered = chapter.assets.map((a, i) => ({
      ...a,
      sort_order: ungrouped.length + chaptersData.reduce((sum, ch) => ch.tempId === tempId ? sum : sum + ch.assets.length, 0) + i + 1,
    }));
    setUngrouped(prev => [...prev, ...reordered]);
    setChaptersData(prev => prev.filter(ch => ch.tempId !== tempId));
    if (activeChapterId === tempId) setActiveChapterId(null);
    setExpandedChapters(prev => {
      const next = new Set(prev);
      next.delete(tempId);
      return next;
    });
  };

  const toggleChapterExpand = (tempId: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  };

  /* ---- Add / Remove assets ---- */
  const addToActive = (asset: ContentAsset) => {
    if (activeChapterId) {
      setChaptersData(prev => prev.map(ch => {
        if (ch.tempId !== activeChapterId) return ch;
        return {
          ...ch,
          assets: [...ch.assets, {
            asset_id: asset.id,
            asset,
            sort_order: ch.assets.length + 1,
            is_free_trial: asset.is_free_preview,
          }],
        };
      }));
    } else {
      setUngrouped(prev => [...prev, {
        asset_id: asset.id,
        asset,
        sort_order: prev.length + 1,
        is_free_trial: asset.is_free_preview,
      }]);
    }
  };

  const removeFromChapter = (chapterTempId: string, assetId: number) => {
    setChaptersData(prev => prev.map(ch => {
      if (ch.tempId !== chapterTempId) return ch;
      return {
        ...ch,
        assets: ch.assets.filter(a => a.asset_id !== assetId).map((a, i) => ({ ...a, sort_order: i + 1 })),
      };
    }));
  };

  const removeFromUngrouped = (assetId: number) => {
    setUngrouped(prev => prev.filter(a => a.asset_id !== assetId).map((a, i) => ({ ...a, sort_order: i + 1 })));
  };

  /* ---- Reorder within chapter ---- */
  const moveInChapter = (chapterTempId: string, index: number, dir: "up" | "down") => {
    setChaptersData(prev => prev.map(ch => {
      if (ch.tempId !== chapterTempId) return ch;
      const arr = [...ch.assets];
      const swapIdx = dir === "up" ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= arr.length) return ch;
      [arr[index], arr[swapIdx]] = [arr[swapIdx], arr[index]];
      return { ...ch, assets: arr.map((a, i) => ({ ...a, sort_order: i + 1 })) };
    }));
  };

  const moveInUngrouped = (index: number, dir: "up" | "down") => {
    setUngrouped(prev => {
      const swapIdx = dir === "up" ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[index], arr[swapIdx]] = [arr[swapIdx], arr[index]];
      return arr.map((a, i) => ({ ...a, sort_order: i + 1 }));
    });
  };

  /* ---- Free trial toggle ---- */
  const toggleChapterAssetTrial = (chapterTempId: string, assetId: number) => {
    setChaptersData(prev => prev.map(ch => {
      if (ch.tempId !== chapterTempId) return ch;
      return {
        ...ch,
        assets: ch.assets.map(a => a.asset_id === assetId ? { ...a, is_free_trial: !a.is_free_trial } : a),
      };
    }));
  };

  const toggleUngroupedTrial = (assetId: number) => {
    setUngrouped(prev => prev.map(a => a.asset_id === assetId ? { ...a, is_free_trial: !a.is_free_trial } : a));
  };

  /* ---- helpers ---- */
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const totalPicked = ungrouped.length + chaptersData.reduce((sum, ch) => sum + ch.assets.length, 0);

  /* ---- Render asset row (reusable) ---- */
  const renderAssetRow = (
    pick: PickedAsset,
    idx: number,
    onMoveUp: () => void,
    onMoveDown: () => void,
    onToggleTrial: () => void,
    onRemove: () => void,
  ) => {
    const a = pick.asset;
    return (
      <div key={pick.asset_id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background-100/70 hover:bg-background-100 transition-colors group">
        <span className="text-[10px] font-medium text-foreground-400 w-4 text-center shrink-0">{idx + 1}</span>
        <i className={`${TYPE_CONFIG[a.asset_type].icon} text-xs text-foreground-500 shrink-0`}></i>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground-800 truncate">{a.title}</p>
        </div>
        <button onClick={onToggleTrial}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 transition-all whitespace-nowrap ${pick.is_free_trial ? "bg-primary-100 text-primary-700" : "bg-background-200 text-foreground-400"}`}
          title="切换试看状态">
          {pick.is_free_trial ? "试看" : "付费"}
        </button>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
          <button onClick={onMoveUp}
            className="w-5 h-5 rounded flex items-center justify-center text-foreground-400 hover:text-foreground-600 disabled:opacity-30">
            <i className="ri-arrow-up-s-line text-xs"></i>
          </button>
          <button onClick={onMoveDown}
            className="w-5 h-5 rounded flex items-center justify-center text-foreground-400 hover:text-foreground-600 disabled:opacity-30">
            <i className="ri-arrow-down-s-line text-xs"></i>
          </button>
        </div>
        <button onClick={onRemove}
          className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-foreground-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
          <i className="ri-close-line text-xs"></i>
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-500">
        从素材库中选择内容编排课程。可创建章节分组管理。已选择 <strong className="text-foreground-800">{totalPicked}</strong> 个素材
      </p>

      <div className="grid grid-cols-2 gap-4 min-h-[400px]">
        {/* ===== LEFT: Asset Library ===== */}
        <div className="border border-background-200/70 rounded-xl bg-background-50 flex flex-col max-h-[60vh]">
          <div className="px-3 py-2 border-b border-background-200/70 space-y-2 shrink-0">
            <p className="text-xs font-semibold text-foreground-700">素材库</p>
            <div className="relative">
              <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-400 text-xs"></i>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索素材..."
                className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-background-200/70 bg-background-50 text-xs text-foreground-800 focus:outline-none focus:border-primary-400" />
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { value: "all", label: "全部" },
                { value: "text", label: "图文" },
                { value: "audio", label: "音频" },
                { value: "video", label: "视频" },
              ].map((opt) => (
                <button key={opt.value} onClick={() => setFilterType(opt.value)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all whitespace-nowrap ${filterType === opt.value ? "bg-primary-500 text-white" : "bg-background-100 text-foreground-500 hover:text-foreground-800"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <select value={filterCategoryId} onChange={(e) => { setFilterCategoryId(e.target.value); setFilterChapterId("all"); }}
                className="px-2 py-1 rounded text-[10px] border border-background-200/70 bg-background-50 text-foreground-600">
                <option value="all">全部分类</option>
                <option value="none">未分类</option>
                {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              <select value={filterChapterId} onChange={(e) => setFilterChapterId(e.target.value)}
                className="px-2 py-1 rounded text-[10px] border border-background-200/70 bg-background-50 text-foreground-600">
                <option value="all">全部章节</option>
                <option value="none">未分配</option>
                {filteredChapers.map((ch) => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <div className="flex justify-center py-8"><i className="ri-loader-4-line animate-spin text-foreground-400"></i></div>
            ) : available.length === 0 ? (
              <p className="text-xs text-foreground-400 text-center py-8">
                {allAssets.length === 0 ? "素材库为空" : "没有符合筛选条件的素材"}
              </p>
            ) : (
              available.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-background-100 transition-colors group">
                  <i className={`${TYPE_CONFIG[a.asset_type].icon} text-xs text-foreground-400 shrink-0`}></i>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground-700 truncate">{a.title}</p>
                    <p className="text-[10px] text-foreground-400">
                      {a.category_name && <span>{a.category_name}</span>}
                      {a.chapter_name && <span>{a.category_name ? " · " : ""}{a.chapter_name}</span>}
                      {formatDuration(a.asset_type === "video" ? a.video_duration : a.audio_duration) && (
                        <span> · {formatDuration(a.asset_type === "video" ? a.video_duration : a.audio_duration)}</span>
                      )}
                    </p>
                  </div>
                  <button onClick={() => addToActive(a)}
                    className="shrink-0 w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-primary-600"
                    title={activeChapterId ? "添加到当前章节" : "添加到未分组"}>
                    <i className="ri-add-line text-xs"></i>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ===== RIGHT: Course Layout ===== */}
        <div className="border border-background-200/70 rounded-xl bg-background-50 flex flex-col max-h-[60vh]">
          <div className="px-3 py-2 border-b border-background-200/70 flex items-center justify-between shrink-0">
            <div>
              <p className="text-xs font-semibold text-foreground-700">课程编排区</p>
              <p className="text-[10px] text-foreground-400">
                {activeChapterId
                  ? `已选中章节：${chaptersData.find(ch => ch.tempId === activeChapterId)?.name || "未知"}`
                  : "当前添加位置：未分组"}
              </p>
            </div>
            <button onClick={startNewChapter}
              className="px-2.5 py-1 rounded-full bg-accent-500 text-white text-[10px] font-medium hover:bg-accent-600 transition-all whitespace-nowrap">
              <i className="ri-add-line mr-0.5"></i>新建章节
            </button>
          </div>

          {/* New chapter input */}
          {showNewChapter && (
            <div className="px-3 py-2 border-b border-background-200/70 flex items-center gap-2 bg-background-100/50">
              <input
                type="text"
                value={newChapterName}
                onChange={(e) => setNewChapterName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") confirmNewChapter(); }}
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-background-200/70 bg-background-50 text-xs text-foreground-800 focus:outline-none focus:border-primary-400"
                placeholder="输入章节名称，如：第一章 · 认知篇"
                autoFocus
              />
              <button onClick={confirmNewChapter}
                disabled={!newChapterName.trim()}
                className="px-3 py-1.5 rounded-full bg-primary-500 text-white text-[10px] font-medium hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap">
                确定
              </button>
              <button onClick={() => { setShowNewChapter(false); setNewChapterName(""); }}
                className="w-6 h-6 rounded flex items-center justify-center text-foreground-400 hover:text-foreground-600 transition-all">
                <i className="ri-close-line text-xs"></i>
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {chaptersData.length === 0 && ungrouped.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-foreground-400">
                <i className="ri-inbox-line text-2xl mb-2"></i>
                <p className="text-xs">从左侧素材库选择内容</p>
                <p className="text-[10px] mt-0.5">可先创建章节再添加素材</p>
              </div>
            ) : (
              <>
                {/* Chapters */}
                {chaptersData.map((chapter) => {
                  const isExpanded = expandedChapters.has(chapter.tempId);
                  const isActive = activeChapterId === chapter.tempId;
                  return (
                    <div key={chapter.tempId} className={`rounded-lg border transition-all ${isActive ? "border-primary-400 bg-primary-50/50" : "border-background-200/70 bg-background-50"}`}>
                      {/* Chapter header */}
                      <div
                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${isActive ? "" : "hover:bg-background-100/50"}`}
                        onClick={() => {
                          setActiveChapterId(isActive ? null : chapter.tempId);
                          toggleChapterExpand(chapter.tempId);
                        }}
                      >
                        <i className={`ri-${isExpanded ? "subtract" : "add"}-line text-foreground-400 text-xs`}></i>
                        <i className="ri-folder-line text-foreground-500 text-xs"></i>
                        <span className="text-xs font-medium text-foreground-800 flex-1 truncate">{chapter.name}</span>
                        <span className="text-[10px] text-foreground-400">{chapter.assets.length} 个素材</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteChapter(chapter.tempId); }}
                          className="w-5 h-5 rounded flex items-center justify-center text-foreground-400 hover:text-red-500 transition-all"
                          title="删除章节（素材移入未分组）"
                        >
                          <i className="ri-delete-bin-line text-[10px]"></i>
                        </button>
                      </div>

                      {/* Chapter assets */}
                      {isExpanded && (
                        <div className="border-t border-background-200/70 px-2 py-1 space-y-1">
                          {chapter.assets.length === 0 ? (
                            <p className="text-[10px] text-foreground-400 text-center py-3">
                              选中此章节后，从左侧添加素材
                            </p>
                          ) : (
                            chapter.assets.map((pick, idx) =>
                              renderAssetRow(
                                pick, idx,
                                () => moveInChapter(chapter.tempId, idx, "up"),
                                () => moveInChapter(chapter.tempId, idx, "down"),
                                () => toggleChapterAssetTrial(chapter.tempId, pick.asset_id),
                                () => removeFromChapter(chapter.tempId, pick.asset_id),
                              )
                            )
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Ungrouped section */}
                {ungrouped.length > 0 && (
                  <div className={`rounded-lg border transition-all ${!activeChapterId ? "border-accent-400 bg-accent-50/30" : "border-background-200/70 bg-background-50"}`}>
                    <div
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-background-100/50"
                      onClick={() => {
                        setShowUngrouped(!showUngrouped);
                        if (activeChapterId) setActiveChapterId(null);
                      }}
                    >
                      <i className={`ri-${showUngrouped ? "subtract" : "add"}-line text-foreground-400 text-xs`}></i>
                      <i className="ri-stack-line text-foreground-500 text-xs"></i>
                      <span className="text-xs font-medium text-foreground-800 flex-1">未分组素材</span>
                      <span className="text-[10px] text-foreground-400">{ungrouped.length} 个</span>
                    </div>
                    {showUngrouped && (
                      <div className="border-t border-background-200/70 px-2 py-1 space-y-1">
                        {ungrouped.map((pick, idx) =>
                          renderAssetRow(
                            pick, idx,
                            () => moveInUngrouped(idx, "up"),
                            () => moveInUngrouped(idx, "down"),
                            () => toggleUngroupedTrial(pick.asset_id),
                            () => removeFromUngrouped(pick.asset_id),
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer stats */}
          <div className="px-3 py-2 border-t border-background-200/70 text-xs text-foreground-400 shrink-0 flex items-center gap-3">
            <span>共 {totalPicked} 个内容单元</span>
            {chaptersData.length > 0 && <span>· {chaptersData.length} 个章节</span>}
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">上一步</button>
        <button onClick={() => onSave({ chapters: chaptersData, ungrouped })} className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap">确认内容编排 · 下一步</button>
      </div>
    </div>
  );
}