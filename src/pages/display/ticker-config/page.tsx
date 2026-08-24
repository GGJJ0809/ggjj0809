import { useState, useEffect } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { loadDisplayConfig, updateTicker } from '@/lib/displayStore';

export default function TickerConfigPage() {
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadTickerData();
  }, []);

  const loadTickerData = async () => {
    setLoading(true);
    try {
      const config = await loadDisplayConfig('default');
      const tickerNotices = config?.settings?.tickerNotices;
      if (Array.isArray(tickerNotices) && tickerNotices.length > 0) {
        setNotices(tickerNotices.filter((n) => n?.trim()));
      } else {
        setNotices([]);
      }
    } catch (e) {
      console.error('[TickerConfig] load error:', e);
      setNotices([]);
    } finally {
      setLoading(false);
    }
  };

  const updateNotice = (index: number, value: string) => {
    const next = [...notices];
    next[index] = value;
    setNotices(next);
  };

  const addNotice = () => {
    setNotices([...notices, '']);
  };

  const removeNotice = (index: number) => {
    const next = [...notices];
    next.splice(index, 1);
    setNotices(next);
  };

  const handleSave = async () => {
    const filtered = notices.filter((n) => n.trim());
    if (filtered.length === 0) {
      setToast({ show: true, msg: '请至少保留一条公告内容', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setSaving(true);
    try {
      await updateTicker(filtered, 'default');
      setNotices(filtered);
      setToast({ show: true, msg: '滚动公告已保存，大屏即时更新', type: 'success' });
    } catch (e) {
      console.error('[TickerConfig] save error:', e);
      setToast({ show: true, msg: '保存失败，请重试', type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  // 预设模板
  const templates = [
    '【食品安全公示】本食堂已取得食品经营许可证，欢迎就餐员工监督',
    '【温馨提示】请按需取餐，珍惜粮食，节约每一粒米',
    '【营养建议】荤素搭配、粗细结合，每日摄入蔬菜不少于300g',
    '【卫生告知】本食堂今日所有食材均已通过检疫验收，请放心就餐',
    '【留样公示】今日午餐留样已存入留样柜，保存48小时',
    '【就餐须知】文明用餐，保持桌面清洁，用餐后请将餐盘放至指定位置',
    '【满意度调查】您对今日餐品满意吗？请扫码参与调查，感谢配合',
    '【菜品推荐】今日主厨推荐：红烧肉、清蒸鲈鱼，欢迎品尝',
  ];

  const addTemplate = (text: string) => {
    if (notices.some((n) => n.trim() === text)) return;
    setNotices([...notices, text]);
  };

  return (
    <AppLayout title="滚动通知配置" breadcrumb={['大屏展示', '滚动通知配置']}>
      {toast?.show && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl text-lg border transition-all shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          <div className="flex items-center gap-2">
            <i className={toast.type === 'success' ? 'ri-checkbox-circle-fill text-2xl' : 'ri-error-warning-fill text-2xl'} />
            {toast.msg}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* 说明卡片 */}
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-amber-50 flex-shrink-0">
              <i className="ri-information-line text-amber-500 text-2xl" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-800 mb-1">关于滚动公告</p>
              <p className="text-base text-slate-500 leading-relaxed">
                此处编辑的公告文字将在<strong className="text-slate-700">综合运营大屏</strong>和<strong className="text-slate-700">传感器数据大屏</strong>底部循环滚动显示。
                公告与报警事件混合展示，自定义公告优先于报警信息。保存后大屏即时生效，无需刷新。
              </p>
            </div>
          </div>
        </div>

        {/* 公告编辑区 */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-slate-800">公告列表</p>
              <p className="text-base text-slate-400 mt-0.5">
                {loading ? '加载中...' : `共 ${notices.length} 条公告`}
              </p>
            </div>
            <button
              type="button"
              onClick={addNotice}
              className="text-base flex items-center gap-1.5 bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap transition-colors"
            >
              <i className="ri-add-line" />添加公告
            </button>
          </div>

          <div className="p-5">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <i className="ri-loader-4-line animate-spin text-3xl mr-2" />
                <span className="text-lg">加载中...</span>
              </div>
            ) : notices.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-3 flex items-center justify-center rounded-full bg-slate-100">
                  <i className="ri-notification-off-line text-slate-400 text-4xl" />
                </div>
                <p className="text-lg text-slate-500 mb-3">暂无公告内容</p>
                <button
                  type="button"
                  onClick={addNotice}
                  className="text-base bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap transition-colors"
                >
                  <i className="ri-add-line mr-1" />添加第一条公告
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {notices.map((notice, i) => (
                  <div key={i} className="flex items-center gap-3 group">
                    <div className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-base font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={notice}
                        onChange={(e) => updateNotice(i, e.target.value)}
                        placeholder={`请输入第 ${i + 1} 条公告内容...`}
                        className="w-full text-lg border border-slate-200 rounded-lg pl-3 pr-10 py-2.5 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 transition-all"
                      />
                      {notice.trim() && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-slate-400">
                          {notice.length} 字
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeNotice(i)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      <i className="ri-delete-bin-line text-lg" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 快速模板 */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-50">
            <p className="text-lg font-semibold text-slate-800">快速模板</p>
            <p className="text-base text-slate-400 mt-0.5">点击下方模板快速添加到公告列表</p>
          </div>
          <div className="p-5">
            <div className="flex flex-wrap gap-2">
              {templates.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => addTemplate(t)}
                  disabled={notices.some((n) => n.trim() === t)}
                  className={`text-base px-3 py-1.5 rounded-full border cursor-pointer whitespace-nowrap transition-colors ${
                    notices.some((n) => n.trim() === t)
                      ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                      : 'border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600'
                  }`}
                >
                  <i className="ri-add-line mr-1" />{t.slice(0, 18)}{t.length > 18 ? '...' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 保存按钮 */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={loadTickerData}
            className="text-lg border border-slate-200 text-slate-600 px-4 py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap transition-colors"
          >
            <i className="ri-refresh-line mr-1" />重置
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-lg bg-emerald-500 text-white px-6 py-2.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <i className="ri-loader-4-line animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <i className="ri-save-line" />保存并同步到大屏
              </>
            )}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}