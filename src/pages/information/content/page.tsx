import { useState } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { useDisplayConfig } from '@/hooks/useDisplayConfig';
import { nowBeijing } from '@/lib/dateUtils';
import type { DisplayContent, DisplaySettings, MenuItem } from '@/hooks/useDisplayConfig';
import PushToScreenModal from './components/PushToScreenModal';
import { useDishes } from '@/pages/catering/dishes/hooks/useDishes';
import ImageUploader from '@/components/base/ImageUploader';
import { normalizeType } from '@/lib/displayStore';

const statusConfig = {
  published: { label: '已发布', bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-400' },
  draft: { label: '草稿', bg: 'bg-slate-50', text: 'text-slate-500', dot: 'bg-slate-300' },
  scheduled: { label: '定时发布', bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-400' },
  archived: { label: '已归档', bg: 'bg-slate-50', text: 'text-slate-400', dot: 'bg-slate-200' },
};

const contentTemplates = [
  { id: 'T001', name: '菜谱模板' },
  { id: 'T002', name: '公示模板' },
  { id: 'T003', name: '通知模板' },
  { id: 'T004', name: '调查模板' },
  { id: 'T005', name: '报告模板' },
];

const mealTabs = ['早餐', '午餐', '晚餐'] as const;
type MealType = (typeof mealTabs)[number];

function mapDishToMenuItem(dish: { name: string; category: string; price: number; calories: number }): MenuItem {
  return {
    name: dish.name,
    price: dish.price,
    category: dish.category,
    calories: dish.calories,
    tag: '推荐',
  };
}

// ─── Content Tab ─────────────────────────────────────────────────────────────
interface ContentTabProps {
  config: ReturnType<typeof useDisplayConfig>['config'];
  loading: boolean;
  editContent: ReturnType<typeof useDisplayConfig>['editContent'];
  removeContent: ReturnType<typeof useDisplayConfig>['removeContent'];
  pushContent: ReturnType<typeof useDisplayConfig>['pushContent'];
  createContent: ReturnType<typeof useDisplayConfig>['createContent'];
}

function ContentTab({ config, loading, editContent, removeContent, pushContent, createContent, editNoticeContent, pushAndSetNotice }: ContentTabProps & { editNoticeContent: (id: string) => Promise<void>; pushAndSetNotice: (contentId: string, targetScreenIds?: string[]) => Promise<void> }) {
  const [selected, setSelected] = useState<DisplayContent | null>(null);
  const [statusFilter, setStatusFilter] = useState('全部');
  const [previewMode, setPreviewMode] = useState(false);
  const [pushTarget, setPushTarget] = useState<DisplayContent | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({ title: '', type: '通知模板', body: '', author: '', screens: [] as string[] });
  const [editItem, setEditItem] = useState<DisplayContent | null>(null);
  const [selectedScreens, setSelectedScreens] = useState<string[]>([]);
  const [settingNotice, setSettingNotice] = useState<string | null>(null);

  const statusTabs = ['全部', '已发布', '草稿', '定时发布', '已归档'];
  const statusMap: Record<string, string> = { '已发布': 'published', '草稿': 'draft', '定时发布': 'scheduled', '已归档': 'archived' };
  const contents = config?.contents ?? [];
  const screens = config?.screens ?? [];
  const filtered = contents.filter((c) => statusFilter === '全部' || c.status === statusMap[statusFilter]);
  const activeNoticeId = config?.settings?.noticeContentId;

  const handlePush = async (screenIds: string[]) => {
    if (!pushTarget) return;
    await pushAndSetNotice(pushTarget.id, screenIds);
    setPushTarget(null);
  };

  const handleSetNotice = async (id: string) => {
    setSettingNotice(id);
    await editNoticeContent(id);
    setSettingNotice(null);
  };

  const handleAdd = async () => {
    if (!newItem.title.trim()) return;
    const now = nowBeijing();
    await createContent({
      ...newItem,
      status: 'draft',
      preview: newItem.body,
      publishTime: '',
      author: newItem.author || '管理员',
      screens: [],
      updateTime: now,
    });
    setNewItem({ title: '', type: '临时通知', body: '', author: '', screens: [] });
    setShowAddModal(false);
  };

  const handleSave = async () => {
    if (!editItem) return;
    await editContent(editItem.id, {
      title: editItem.title,
      type: editItem.type,
      body: editItem.body,
      preview: editItem.body,
      author: editItem.author,
      screens: selectedScreens,
    });
    setEditItem(null);
    setSelectedScreens([]);
  };

  const currentItem = editItem ?? selected;

  const isPublished = (item: DisplayContent) => item.status === 'published' || item.status === 'scheduled';

  return (
    <div className="flex gap-4">
      {/* Left: Content list */}
      <div className="w-80 flex-shrink-0 space-y-3">
        <div className="bg-white rounded-xl border border-slate-100 p-3">
          <div className="flex flex-wrap gap-1">
            {statusTabs.map((tab) => (
              <button key={tab} type="button" onClick={() => setStatusFilter(tab)}
                className={`text-xs px-2 py-0.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${statusFilter === tab ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
            <p className="text-sm font-semibold text-slate-800">公示内容</p>
            <button type="button" onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 text-xs bg-emerald-500 text-white px-2.5 py-1 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
              <i className="ri-add-line" />新建
            </button>
          </div>
          <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-slate-400">
                <i className="ri-loader-4-line animate-spin text-xl" />
                <p className="text-xs mt-2">加载中...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">暂无内容</div>
            ) : (
              filtered.map((item) => {
                const cfg = statusConfig[item.status as keyof typeof statusConfig];
                const canPush = item.status === 'published' || item.status === 'scheduled';
                return (
                  <div key={item.id} className={`relative group transition-colors ${selected?.id === item.id ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                    <button type="button"
                      onClick={() => { setSelected(item); setEditItem(null); setPreviewMode(false); }}
                      className="w-full p-4 text-left cursor-pointer pr-12">
                      <div className="flex items-start justify-between mb-1.5">
                        <p className="text-sm font-medium text-slate-800 flex-1 pr-2">{item.title}</p>
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.bg} ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mb-1">{item.type} · {item.author}</p>
                      <p className="text-xs text-slate-400 truncate">{item.preview}</p>
                      {item.screens.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {item.screens.map((s) => (
                            <span key={s} className="text-xs bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">{s}</span>
                          ))}
                        </div>
                      )}
                    </button>
                    {canPush && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPushTarget(item); }}
                        title="快速推送"
                        className="absolute right-3 top-3 w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-emerald-600"
                      >
                        <i className="ri-send-plane-line text-xs" />
                      </button>
                    )}
                    {isPublished(item) && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleSetNotice(item.id); }}
                        title="设为公示"
                        disabled={settingNotice === item.id}
                        className={`absolute right-12 top-3 w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer transition-opacity ${
                          activeNoticeId === item.id
                            ? 'bg-amber-500 text-white opacity-100'
                            : 'bg-amber-500 text-white opacity-0 group-hover:opacity-100 hover:bg-amber-600'
                        }`}
                      >
                        {settingNotice === item.id ? (
                          <i className="ri-loader-4-line animate-spin text-xs" />
                        ) : (
                          <i className="ri-notification-3-line text-xs" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right: Editor / Preview */}
      <div className="flex-1 min-w-0">
        {currentItem ? (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-50">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPreviewMode(false)}
                  className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer whitespace-nowrap transition-colors ${!previewMode ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                  <i className="ri-edit-line mr-1" />编辑
                </button>
                <button type="button" onClick={() => setPreviewMode(true)}
                  className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer whitespace-nowrap transition-colors ${previewMode ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                  <i className="ri-eye-line mr-1" />预览
                </button>
              </div>
              <div className="flex items-center gap-2">
                {editItem ? (
                  <>
                    <button type="button" onClick={() => setEditItem(null)}
                      className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">取消</button>
                    <button type="button" onClick={handleSave}
                      className="text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
                      <i className="ri-save-line mr-1" />保存
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { setEditItem({ ...selected!, type: normalizeType(selected!.type) }); setSelectedScreens(selected!.screens); }}
                      className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">编辑</button>
                    <button type="button" onClick={() => setPushTarget(selected)}
                      className="text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
                      <i className="ri-send-plane-line mr-1" />发布推送
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="p-5">
              {!previewMode ? (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">内容标题</label>
                      <input type="text" value={editItem ? editItem.title : selected!.title}
                        onChange={(e) => editItem && setEditItem({ ...editItem, title: e.target.value })}
                        readOnly={!editItem}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 read-only:bg-slate-50" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">内容类型</label>
                      <select value={editItem ? editItem.type : selected!.type}
                        onChange={(e) => editItem && setEditItem({ ...editItem, type: e.target.value })}
                        disabled={!editItem}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white disabled:bg-slate-50">
                        {contentTemplates.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-xs text-slate-500 mb-1">作者</label>
                    <input type="text" value={editItem ? editItem.author : selected!.author}
                      onChange={(e) => editItem && setEditItem({ ...editItem, author: e.target.value })}
                      readOnly={!editItem}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 read-only:bg-slate-50" />
                  </div>

                  <div className="mb-4">
                    <label className="block text-xs text-slate-500 mb-1">公示内容</label>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 bg-slate-50">
                        {['ri-bold', 'ri-italic', 'ri-underline', 'ri-list-unordered', 'ri-list-ordered', 'ri-image-line', 'ri-link'].map((icon) => (
                          <button key={icon} type="button" className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-200 cursor-pointer text-slate-500">
                            <i className={`${icon} text-sm`} />
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={editItem ? editItem.body : selected!.body}
                        onChange={(e) => editItem && setEditItem({ ...editItem, body: e.target.value })}
                        readOnly={!editItem}
                        rows={8}
                        className="w-full text-sm px-4 py-3 focus:outline-none resize-none text-slate-700 leading-relaxed read-only:bg-slate-50" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 mb-2">推送屏幕</label>
                    <div className="flex flex-wrap gap-2">
                      {screens.map((screen) => {
                        const isSel = (editItem ? editItem.screens : selected!.screens).includes(screen.name);
                        return (
                          <button key={screen.id} type="button"
                            onClick={() => {
                              if (!editItem) return;
                              const next = isSel
                                ? editItem.screens.filter((s) => s !== screen.name)
                                : [...editItem.screens, screen.name];
                              setEditItem({ ...editItem, screens: next });
                              setSelectedScreens(next);
                            }}
                            className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer whitespace-nowrap transition-colors ${isSel ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                            <i className="ri-tv-2-line mr-1" />{screen.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-slate-900 rounded-xl p-6 min-h-64">
                  <div className="bg-slate-800 rounded-lg p-4 text-white">
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-700">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 flex items-center justify-center bg-emerald-500 rounded">
                          <i className="ri-restaurant-fill text-white text-sm" />
                        </div>
                        <span className="text-sm font-semibold">智慧食堂公示栏</span>
                      </div>
                      <span className="text-xs text-slate-400">LED显示屏预览</span>
                    </div>
                    <h2 className="text-lg font-bold mb-3">{currentItem.title}</h2>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{currentItem.body}</p>
                    <p className="text-xs text-slate-500 mt-4">{currentItem.author} · {currentItem.publishTime || '待发布'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-100 h-80 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <i className="ri-file-text-line text-3xl mb-2 block" />
              <p className="text-sm">选择左侧内容进行编辑</p>
            </div>
          </div>
        )}
      </div>

      {/* Add modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">新建内容</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <i className="ri-close-line text-lg" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">标题</label>
                <input type="text" value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">类型</label>
                <select value={newItem.type} onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white">
                  {contentTemplates.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">作者</label>
                <input type="text" value={newItem.author} onChange={(e) => setNewItem({ ...newItem, author: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">内容</label>
                <textarea value={newItem.body} onChange={(e) => setNewItem({ ...newItem, body: e.target.value })} rows={4}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setShowAddModal(false)}
                className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">取消</button>
              <button type="button" onClick={handleAdd}
                className="text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
                <i className="ri-add-line mr-1" />创建
              </button>
            </div>
          </div>
        </div>
      )}

      {pushTarget && (
        <PushToScreenModal
          content={pushTarget}
          screens={screens}
          onClose={() => setPushTarget(null)}
          onPush={handlePush}
        />
      )}
    </div>
  );
}

// ─── Menu Tab ─────────────────────────────────────────────────────────────────
interface MenuTabProps {
  config: ReturnType<typeof useDisplayConfig>['config'];
  editMenu: ReturnType<typeof useDisplayConfig>['editMenu'];
}

function MenuTab({ config, editMenu }: MenuTabProps) {
  const { dishes, categories, loading: dishesLoading } = useDishes();
  const [menuMeal, setMenuMeal] = useState<MealType>('午餐');
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCategoryFilter, setMenuCategoryFilter] = useState<number | null>(null);
  const [menuDraft, setMenuDraft] = useState<{ breakfast: MenuItem[]; lunch: MenuItem[]; dinner: MenuItem[] } | null>(null);
  const [menuSaving, setMenuSaving] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: 'success' | 'error' } | null>(null);

  const currentMenu = config?.menu ?? { date: '', breakfast: [], lunch: [], dinner: [] };
  const draftMenu = menuDraft ?? { breakfast: currentMenu.breakfast, lunch: currentMenu.lunch, dinner: currentMenu.dinner };
  const mealKey = menuMeal === '早餐' ? 'breakfast' : menuMeal === '午餐' ? 'lunch' : 'dinner';
  const currentMealList = draftMenu[mealKey];

  const filteredDishes = dishes.filter((d) => {
    const matchSearch = !menuSearch || d.name.includes(menuSearch);
    const matchCat = menuCategoryFilter === null || d.category_id === menuCategoryFilter;
    return matchSearch && matchCat;
  });

  const addDishToMeal = (dish: typeof dishes[0]) => {
    const exists = draftMenu[mealKey].some((m) => m.name === dish.name);
    if (exists) {
      setToast({ show: true, msg: '该菜品已在当前菜单中', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setMenuDraft({ ...draftMenu, [mealKey]: [...draftMenu[mealKey], mapDishToMenuItem(dish)] });
  };

  const removeDishFromMeal = (index: number) => {
    const list = [...draftMenu[mealKey]];
    list.splice(index, 1);
    setMenuDraft({ ...draftMenu, [mealKey]: list });
  };

  const handleMenuSave = async () => {
    setMenuSaving(true);
    await editMenu({ breakfast: draftMenu.breakfast, lunch: draftMenu.lunch, dinner: draftMenu.dinner });
    setMenuSaving(false);
    setMenuDraft(null);
    setToast({ show: true, msg: '今日菜单已保存并同步到大屏', type: 'success' });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="flex gap-4">
      {toast?.show && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl text-sm border transition-all ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'
        }`}>
          <div className="flex items-center gap-2">
            <i className={toast.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
            {toast.msg}
          </div>
        </div>
      )}

      {/* Left: Dish library */}
      <div className="w-80 flex-shrink-0">
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-slate-50">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-800">
                菜品库
                <span className="ml-2 text-xs text-slate-400 font-normal">{dishes.length} 道</span>
              </p>
            </div>
            <div className="relative mb-3">
              <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
              <input type="text" placeholder="搜索菜品名称..." value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                className="w-full text-sm pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400" />
            </div>
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => setMenuCategoryFilter(null)}
                className={`text-xs px-2 py-0.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${menuCategoryFilter === null ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>全部</button>
              {categories.map((cat) => (
                <button key={cat.id} type="button" onClick={() => setMenuCategoryFilter(cat.id)}
                  className={`text-xs px-2 py-0.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${menuCategoryFilter === cat.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{cat.name}</button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-50 max-h-[560px] overflow-y-auto">
            {dishesLoading && (
              <div className="py-10 text-center text-sm text-slate-400">
                <i className="ri-loader-4-line animate-spin block text-xl mb-2" />加载中...
              </div>
            )}
            {!dishesLoading && filteredDishes.map((dish) => (
              <div key={dish.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                  {dish.img
                    ? <img src={dish.img} alt={dish.name} className="w-full h-full object-cover object-top" />
                    : <div className="w-full h-full flex items-center justify-center text-slate-300"><i className="ri-bowl-line text-sm" /></div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{dish.name}</p>
                  <p className="text-xs text-slate-400">{dish.category} · {dish.calories} 大卡</p>
                </div>
                <button type="button" onClick={() => addDishToMeal(dish)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer transition-colors flex-shrink-0"
                  title={`添加到${menuMeal}`}>
                  <i className="ri-add-line text-sm" />
                </button>
              </div>
            ))}
            {!dishesLoading && filteredDishes.length === 0 && (
              <div className="py-10 text-center text-sm text-slate-400">暂无匹配菜品</div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Menu editor */}
      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-50">
            <p className="text-sm font-semibold text-slate-800">今日菜单编辑</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setMenuDraft(null)}
                className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">重置</button>
              <button type="button" onClick={handleMenuSave} disabled={menuSaving}
                className="text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-60 flex items-center gap-1.5">
                {menuSaving && <i className="ri-loader-4-line animate-spin" />}
                <i className="ri-save-line" />保存
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 px-5 pt-4 pb-3">
            {mealTabs.map((tab) => (
              <button key={tab} type="button" onClick={() => setMenuMeal(tab)}
                className={`text-xs px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${menuMeal === tab ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {tab}
                <span className="ml-1 text-[10px] opacity-70">
                  ({draftMenu[tab === '早餐' ? 'breakfast' : tab === '午餐' ? 'lunch' : 'dinner'].length})
                </span>
              </button>
            ))}
          </div>

          <div className="px-5 pb-5">
            {currentMealList.length === 0 ? (
              <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                <i className="ri-restaurant-line text-2xl mb-2 block" />
                <p className="text-sm">点击左侧菜品「+」按钮添加到 {menuMeal}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {currentMealList.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2.5">
                    <div className="w-8 h-8 flex items-center justify-center rounded-md bg-emerald-100 text-emerald-600 flex-shrink-0 text-sm font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-800">{item.name}</p>
                        <span className="text-xs bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">{item.category}</span>
                        {item.tag && <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">{item.tag}</span>}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{item.calories} 大卡</p>
                    </div>
                    <button type="button" onClick={() => removeDishFromMeal(index)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors flex-shrink-0">
                      <i className="ri-close-line text-sm" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-500">
                    共 <span className="font-semibold text-slate-800">{currentMealList.length}</span> 道菜
                  </div>
                  <div className="text-xs text-slate-500">
                    总热量 <span className="font-semibold text-orange-500">{currentMealList.reduce((sum, d) => sum + d.calories, 0)}</span> 大卡
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Display Settings Tab ────────────────────────────────────────────────────
interface DisplayTabProps {
  config: ReturnType<typeof useDisplayConfig>['config'];
  editStaffInfo: ReturnType<typeof useDisplayConfig>['editStaffInfo'];
  editShowcaseImages: ReturnType<typeof useDisplayConfig>['editShowcaseImages'];
}

function DisplayTab({ config, editStaffInfo, editShowcaseImages, editTicker }: DisplayTabProps & { editTicker: (notices: string[]) => Promise<void> }) {
  const existing = config?.settings;

  const defaultStaff = Array.from({ length: 16 }, () => ({ name: '', title: '', photoUrl: '' }));
  const [staffList, setStaffList] = useState<DisplaySettings['staffInfo']>(() => {
    const existingList = existing?.staffInfo ?? [];
    if (existingList.length >= 16) return existingList;
    // 补齐到16个槽位
    const padded: DisplaySettings['staffInfo'] = [...existingList];
    while (padded.length < 16) {
      padded.push({ name: '', title: '', photoUrl: '' });
    }
    return padded;
  });
  const [showcaseImages, setShowcaseImages] = useState<string[]>(
    existing?.showcaseImages ?? ['', '', '', ''],
  );
  const [tickerNotices, setTickerNotices] = useState<string[]>(
    existing?.tickerNotices ?? [''],
  );
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: 'success' | 'error' } | null>(null);

  const handleSave = async () => {
    setSaving(true);
    await Promise.all([
      editStaffInfo(staffList),
      editShowcaseImages(showcaseImages),
      editTicker(tickerNotices.filter((n) => n.trim())),
    ]);
    setSaving(false);
    setToast({ show: true, msg: '大屏配置已保存并同步', type: 'success' });
    setTimeout(() => setToast(null), 3000);
  };

  const updateStaff = (index: number, field: 'name' | 'title' | 'photoUrl', value: string) => {
    const next = [...staffList];
    next[index] = { ...next[index], [field]: value };
    setStaffList(next);
  };

  const updateTicker = (index: number, value: string) => {
    const next = [...tickerNotices];
    next[index] = value;
    setTickerNotices(next);
  };

  const addTicker = () => {
    setTickerNotices([...tickerNotices, '']);
  };

  const removeTicker = (index: number) => {
    const next = [...tickerNotices];
    next.splice(index, 1);
    setTickerNotices(next);
  };

  return (
    <div className="space-y-4">
      {toast?.show && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl text-sm border transition-all ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'
        }`}>
          <div className="flex items-center gap-2">
            <i className={toast.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
            {toast.msg}
          </div>
        </div>
      )}

      {/* Staff info grid — with image upload */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-50 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">炊事人员</p>
            <p className="text-xs text-slate-400 mt-0.5">大屏顶部展示16位员工照片和姓名</p>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-4 gap-4">
            {staffList.map((staff, i) => (
              <div key={i} className="flex flex-col gap-2">
                <ImageUploader
                  value={staff.photoUrl}
                  onChange={(url) => updateStaff(i, 'photoUrl', url)}
                  shape="circle"
                  size="h-16"
                  placeholder="上传头像"
                />
                <input
                  type="text"
                  value={staff.name}
                  onChange={(e) => updateStaff(i, 'name', e.target.value)}
                  placeholder={`姓名${i + 1}`}
                  className="w-full text-xs text-center border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-slate-400"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 菜价公示 — with image upload */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-50">
          <p className="text-sm font-semibold text-slate-800">菜价公示</p>
          <p className="text-xs text-slate-400 mt-0.5">大屏右侧竖排展示 4 张菜价图片（本地上传）</p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <ImageUploader
                  value={showcaseImages[i]}
                  onChange={(url) => {
                    const next = [...showcaseImages];
                    next[i] = url;
                    setShowcaseImages(next);
                  }}
                  shape="square"
                  size="h-28"
                  placeholder={`上传图片${i + 1}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ticker notices */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-50 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">滚动公告</p>
            <p className="text-xs text-slate-400 mt-0.5">大屏底部循环滚动的公告文字</p>
          </div>
          <button
            type="button"
            onClick={addTicker}
            className="text-xs flex items-center gap-1 bg-emerald-500 text-white px-2.5 py-1 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line" />添加公告
          </button>
        </div>
        <div className="p-5 space-y-3">
          {tickerNotices.map((notice, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-6 h-6 flex items-center justify-center rounded bg-emerald-50 text-emerald-600 text-xs font-bold flex-shrink-0">
                {i + 1}
              </div>
              <input
                type="text"
                value={notice}
                onChange={(e) => updateTicker(i, e.target.value)}
                placeholder={`公告内容 ${i + 1}`}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
              <button
                type="button"
                onClick={() => removeTicker(i)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors flex-shrink-0"
              >
                <i className="ri-close-line text-sm" />
              </button>
            </div>
          ))}
          {tickerNotices.length === 0 && (
            <div className="text-center text-slate-400 text-xs py-4">
              暂无公告，点击上方「添加公告」按钮创建
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="text-sm bg-emerald-500 text-white px-5 py-2 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-60 flex items-center gap-2"
        >
          {saving && <i className="ri-loader-4-line animate-spin" />}
          <i className="ri-save-line" />保存并同步到大屏
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ContentPage() {
  const { config, loading, createContent, editContent, removeContent, pushContent, editMenu, editStaffInfo, editShowcaseImages, editNoticeContent, editTicker, pushAndSetNotice } = useDisplayConfig();
  const [pageTab, setPageTab] = useState<'content' | 'menu' | 'display'>('content');

  return (
    <AppLayout title="内容管理" breadcrumb={['信息公示', '内容管理']}>
      {/* Top tabs */}
      <div className="flex items-center gap-2 mb-4">
        {[
          { key: 'content' as const, icon: 'ri-file-text-line', label: '公示内容' },
          { key: 'menu' as const, icon: 'ri-restaurant-line', label: '今日菜单' },
          { key: 'display' as const, icon: 'ri-tv-2-line', label: '大屏配置' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setPageTab(tab.key)}
            className={`text-sm px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
              pageTab === tab.key ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <i className={`${tab.icon} mr-1`} />{tab.label}
          </button>
        ))}
      </div>

      {pageTab === 'content' && (
        <ContentTab
          config={config}
          loading={loading}
          editContent={editContent}
          removeContent={removeContent}
          pushContent={pushContent}
          createContent={createContent}
          editNoticeContent={editNoticeContent}
          pushAndSetNotice={pushAndSetNotice}
        />
      )}
      {pageTab === 'menu' && (
        <MenuTab config={config} editMenu={editMenu} />
      )}
      {pageTab === 'display' && (
        <DisplayTab
          config={config}
          editStaffInfo={editStaffInfo}
          editShowcaseImages={editShowcaseImages}
          editTicker={editTicker}
        />
      )}
    </AppLayout>
  );
}