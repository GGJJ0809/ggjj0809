import { memo } from 'react';
import type { DisplayConfig } from '@/hooks/useDisplayConfig';

interface MenuPanelProps {
  config?: DisplayConfig | null;
}

const tagColor: Record<string, string> = {
  '本餐特色': 'bg-red-500/20 text-red-400',
  '新鲜': 'bg-teal-500/20 text-teal-400',
  '热门': 'bg-orange-500/20 text-orange-400',
  '健康': 'bg-emerald-500/20 text-emerald-400',
  '经典': 'bg-slate-500/20 text-slate-300',
  '免费': 'bg-yellow-500/20 text-yellow-400',
  '清淡': 'bg-cyan-500/20 text-cyan-400',
  '现蒸': 'bg-pink-500/20 text-pink-400',
  '养胃': 'bg-lime-500/20 text-lime-400',
  '高蛋白': 'bg-violet-500/20 text-violet-400',
  '开胃': 'bg-orange-500/20 text-orange-400',
  '滋补': 'bg-amber-500/20 text-amber-400',
};

function MenuPanel({ config: propConfig }: MenuPanelProps) {

  const todayMenu = propConfig?.menu;
  const staffInfo = propConfig?.settings?.staffInfo ?? [];
  const contents = propConfig?.contents ?? [];
  const noticeContentId = propConfig?.settings?.noticeContentId;

  // 合并所有餐段菜单
  const menuItems = todayMenu
    ? [...(todayMenu.breakfast ?? []), ...(todayMenu.lunch ?? []), ...(todayMenu.dinner ?? [])]
    : [];

  // 已发布的内容作为公示
  const publishedContents = contents.filter((c) => c.status === 'published');
  const currentNotice = noticeContentId
    ? contents.find((c) => c.id === noticeContentId)
    : publishedContents[0];

  // 今日推荐菜品：从配置中读取本餐特色
  const featuredDishes = propConfig?.settings?.featuredDishes ?? [];
  // 构建特色菜品名称集合，用于菜单列表高亮
  const featuredNames = new Set(featuredDishes.map((fd) => fd.name));
  const featuredDish = featuredDishes.length > 0
    ? featuredDishes[0]
    : (menuItems.find((item) => item.tag === '本餐特色') ?? menuItems[0] ?? null);

  return (
    <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800">

      {/* ══════════════════════════════════════════════════
          整体改为：左列(炊事人员+今日面食) + 右列(公示内容+菜品信息)
          右列通栏贯穿整屏高度，菜品信息纵向延伸填满下方空白
      ══════════════════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0">

        {/* 左列：炊事人员(62%) + 今日面食(38%) */}
        <div className="w-[62%] flex flex-col min-h-0 border-r border-slate-800/60">

          {/* ── 上半：炊事人员 62% ── */}
          <div className="flex-none h-[62%] flex flex-col px-4 py-4 border-b border-slate-800/60 min-h-0">
            {/* 标题行 */}
            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
              <i className="ri-user-star-line text-emerald-400 text-6xl" />
              <span className="text-emerald-400 text-3xl font-bold tracking-wide">炊事人员</span>
            </div>

            {/* 员工网格：4列，撑满剩余高度 */}
            <div className="flex-1 grid grid-cols-4 gap-x-4 gap-y-2 content-start overflow-hidden">
              {staffInfo.map((staff, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="rounded-full bg-slate-800 overflow-hidden flex items-center justify-center border-2 border-slate-700 flex-shrink-0" style={{ width: '4.5rem', height: '4.5rem' }}>
                    {staff.photoUrl ? (
                      <img src={staff.photoUrl} alt={staff.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-700">
                        <i className="ri-user-3-line text-slate-400 text-6xl" />
                      </div>
                    )}
                  </div>
                  <span className="text-white text-2xl mt-1 truncate w-full text-center font-medium">{staff.name}</span>
                </div>
              ))}
              {/* 空白占位 */}
              {Array.from({ length: Math.max(0, 20 - staffInfo.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="flex flex-col items-center opacity-20">
                  <div className="rounded-full bg-slate-800 border-2 border-slate-800 flex items-center justify-center" style={{ width: '4.5rem', height: '4.5rem' }}>
                    <i className="ri-user-3-line text-slate-600 text-6xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 下半：今日面食 38% ── */}
          <div className="flex-1 flex flex-col px-4 py-3 min-h-0">
            {/* 标题行 */}
            <div className="flex items-center justify-center mb-2 flex-shrink-0">
              <span className="text-rose-400 text-4xl font-bold tracking-wide">今日面食</span>
            </div>

            {featuredDish ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-slate-900/80 rounded-lg border border-slate-800/60 px-3 py-3">
                {/* 菜品名 */}
                <p className="text-white text-5xl font-bold mb-1 truncate w-full text-center">{featuredDish.name}</p>
                {/* 标签 */}
                {'tag' in featuredDish && (featuredDish as any).tag ? (
                  <span className={`text-xl px-2 py-0.5 rounded-full mb-1.5 ${tagColor[(featuredDish as any).tag] || 'bg-slate-700 text-slate-400'}`}>
                    {(featuredDish as any).tag}
                  </span>
                ) : (
                  <span className="text-xl px-2 py-0.5 rounded-full mb-1.5 bg-rose-500/20 text-rose-400">
                    本餐特色
                  </span>
                )}
                {/* 信息行 */}
                <div className="flex items-center gap-4 text-slate-400 text-2xl">
                  <span>{(featuredDish as any).calories ?? 0}kcal</span>
                  {'category' in featuredDish && (featuredDish as any).category ? (
                    <span className="text-slate-500">{(featuredDish as any).category}</span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <i className="ri-restaurant-2-line text-slate-600 text-7xl mb-2" />
                <p className="text-slate-600 text-2xl">暂无推荐</p>
              </div>
            )}
          </div>
        </div>

        {/* 右列：公示内容 + 菜品信息（38%宽，通栏） */}
        <div className="w-[38%] flex flex-col min-h-0">

          {/* ── 上半：公示内容 ── */}
          <div className="flex-none h-[31%] flex flex-col px-4 pt-4 pb-2 border-b border-slate-800/60 min-h-0">
            {/* 标题行 */}
            <div className="flex items-center gap-2 mb-1.5 flex-shrink-0">
              <i className="ri-notification-3-line text-amber-400 text-3xl" />
              <span className="text-amber-400 text-2xl font-bold tracking-wide">公示内容</span>
            </div>

            {currentNotice ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* 公示标题 */}
                <p className="text-white text-3xl font-bold mb-1 leading-snug line-clamp-1">{currentNotice.title}</p>
                <div className="w-8 h-0.5 bg-amber-400/40 mb-2 flex-shrink-0" />
                {/* 公示正文 */}
                <p className="text-slate-300 text-2xl leading-relaxed flex-1 overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {currentNotice.preview}
                </p>
                {/* 底部信息 */}
                <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 flex-shrink-0">
                  <div className="flex items-center gap-1 text-slate-500 text-2xl">
                    <i className="ri-user-line text-xl" />
                    <span>发布人：{currentNotice.author}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <i className="ri-file-list-3-line text-slate-600 text-7xl mb-2" />
                <p className="text-slate-600 text-2xl">暂无公示内容</p>
              </div>
            )}
          </div>

          {/* ── 下半：菜品信息（纵向延伸，1个/行）── */}
          <div className="flex-1 flex flex-col px-4 pt-2 pb-4 min-h-0">
            {/* 标题行 */}
            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
              <i className="ri-restaurant-2-line text-emerald-400 text-3xl" />
              <span className="text-emerald-400 text-2xl font-bold tracking-wide">菜品信息</span>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar">
              {menuItems.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-slate-600 text-2xl">
                  暂无菜品数据
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {menuItems.map((item, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                        item.tag === '本餐特色' || featuredNames.has(item.name)
                          ? 'bg-red-500/10 border border-red-500/20'
                          : 'bg-slate-900/60 hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-emerald-500/60 flex-shrink-0" />
                        <span className="text-white text-2xl font-medium truncate">{item.name}</span>
                        {item.tag && (
                          <span className={`text-lg px-1.5 py-0.5 rounded flex-shrink-0 ${tagColor[item.tag] || 'bg-slate-700 text-slate-400'}`}>
                            {item.tag}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center flex-shrink-0 ml-2">
                        <span className="text-slate-400 text-2xl">{item.calories}kcal</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}

export default memo(MenuPanel);