import { useState, useEffect } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { loadDisplayConfig, updateStaffInfo, updateTodayDutyStaff } from '@/lib/displayStore';
import type { DisplaySettings } from '@/lib/displayStore';
import ImageUploader from '@/components/base/ImageUploader';

type StaffMember = DisplaySettings['staffInfo'][number];

export default function StaffPage() {
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [todayDutyNames, setTodayDutyNames] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadStaffData();
  }, []);

  const loadStaffData = async () => {
    setLoading(true);
    try {
      const config = await loadDisplayConfig('default');
      const existing = config?.settings?.staffInfo;
      if (Array.isArray(existing) && existing.length > 0) {
        setStaffList(existing);
      } else {
        setStaffList([]);
      }
      // 加载今日值班
      const duty = config?.settings?.todayDutyStaff;
      if (Array.isArray(duty) && duty.length > 0) {
        setTodayDutyNames(new Set(duty.map((s: StaffMember) => s.name)));
      } else {
        setTodayDutyNames(new Set());
      }
    } catch (e) {
      console.error('[Staff] load error:', e);
      setStaffList([]);
      setTodayDutyNames(new Set());
    } finally {
      setLoading(false);
    }
  };

  const updateStaff = (index: number, field: keyof StaffMember, value: string) => {
    const next = [...staffList];
    next[index] = { ...next[index], [field]: value };
    setStaffList(next);
  };

  const addStaff = () => {
    setStaffList([...staffList, { name: '', title: '', photoUrl: '' }]);
  };

  const removeStaff = (index: number) => {
    const next = [...staffList];
    next.splice(index, 1);
    setStaffList(next);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...staffList];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setStaffList(next);
  };

  const moveDown = (index: number) => {
    if (index === staffList.length - 1) return;
    const next = [...staffList];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setStaffList(next);
  };

  const handleSave = async () => {
    // 过滤掉空姓名的人员（允许只留名字还没上传照片的）
    const valid = staffList.filter((s) => s.name.trim());
    if (valid.length === 0) {
      setToast({ show: true, msg: '请至少填写一位人员姓名', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    // 检查姓名重复
    const names = valid.map((s) => s.name.trim());
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) {
      setToast({ show: true, msg: `姓名「${dupes[0]}」重复，请修改后再保存`, type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setSaving(true);
    try {
      // 同时保存人员列表和今日值班（一步到位，不用分开点两个按钮）
      await updateStaffInfo(valid, 'default');

      // 也保存今日值班选择（如果已选）
      const dutyList: StaffMember[] = [];
      todayDutyNames.forEach((name) => {
        const staff = valid.find((s) => s.name === name);
        if (staff) {
          dutyList.push({ ...staff });
        }
      });
      if (dutyList.length > 0) {
        await updateTodayDutyStaff(dutyList, 'default');
      }

      setStaffList(valid);
      const msg = dutyList.length > 0
        ? `已保存 ${valid.length} 位炊事人员，今日值班 ${dutyList.length} 人，大屏即时更新`
        : `已保存 ${valid.length} 位炊事人员，大屏即时更新`;
      setToast({ show: true, msg, type: 'success' });
    } catch (e) {
      console.error('[Staff] save error:', e);
      setToast({ show: true, msg: '保存失败，请重试', type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  const toggleDuty = (name: string) => {
    setTodayDutyNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const selectAllDuty = () => {
    setTodayDutyNames(new Set(staffList.filter((s) => s.name.trim()).map((s) => s.name)));
  };

  const clearAllDuty = () => {
    setTodayDutyNames(new Set());
  };

  const saveDutyStaff = async () => {
    const dutyList: StaffMember[] = [];
    todayDutyNames.forEach((name) => {
      const staff = staffList.find((s) => s.name === name);
      if (staff) {
        dutyList.push({ ...staff });
      }
    });

    setSaving(true);
    try {
      await updateTodayDutyStaff(dutyList, 'default');
      setToast({ show: true, msg: `今日值班已保存：${dutyList.length} 人，大屏即时更新`, type: 'success' });
    } catch (e) {
      console.error('[Staff] save duty error:', e);
      setToast({ show: true, msg: '值班保存失败，请重试', type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  const filledCount = staffList.filter((s) => s.name.trim()).length;

  // 统计有多少人有照片
  const photoCount = staffList.filter((s) => s.photoUrl).length;

  return (
    <AppLayout title="炊事人员管理" breadcrumb={['餐饮管理', '炊事人员管理']}>
      {toast?.show && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl text-sm border transition-all shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          <div className="flex items-center gap-2">
            <i className={toast.type === 'success' ? 'ri-checkbox-circle-fill text-lg' : 'ri-error-warning-fill text-lg'} />
            {toast.msg}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* 统计卡片 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-emerald-50">
                <i className="ri-team-line text-emerald-500 text-lg" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{filledCount}</p>
                <p className="text-xs text-slate-500">在册人员</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-amber-50">
                <i className="ri-image-line text-amber-500 text-lg" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{photoCount}</p>
                <p className="text-xs text-slate-500">已上传照片</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-sky-50">
                <i className="ri-tv-2-line text-sky-500 text-lg" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {filledCount > 0 ? '已同步' : '待配置'}
                </p>
                <p className="text-xs text-slate-500">大屏同步状态</p>
              </div>
            </div>
          </div>
        </div>

        {/* 说明 */}
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-50 flex-shrink-0">
              <i className="ri-information-line text-slate-400 text-lg" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 mb-1">炊事人员展示说明</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                此处管理的炊事人员信息将在<strong className="text-slate-700">智慧食堂监控大屏</strong>顶部的「炊事人员」区域展示。
                点击每个人员卡片可分别上传照片、填写姓名和职务。照片建议使用 1:1 正方形头像，大小不超过 5MB。
                在 Electron 桌面端运行时，图片以 base64 格式存入本地 SQLite 数据库，纯局域网环境即可使用。
              </p>
            </div>
          </div>
        </div>

        {/* 人员编辑区 */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">人员列表</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {loading ? '加载中...' : `${staffList.length} 个槽位，${filledCount} 人已填写`}
              </p>
            </div>
            <button
              type="button"
              onClick={addStaff}
              className="text-xs flex items-center gap-1.5 bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap transition-colors"
            >
              <i className="ri-user-add-line" />添加人员
            </button>
          </div>

          <div className="p-5">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <i className="ri-loader-4-line animate-spin text-xl mr-2" />
                <span className="text-sm">加载中...</span>
              </div>
            ) : staffList.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-3 flex items-center justify-center rounded-full bg-slate-100">
                  <i className="ri-user-search-line text-slate-400 text-2xl" />
                </div>
                <p className="text-sm text-slate-500 mb-3">暂无人员信息</p>
                <button
                  type="button"
                  onClick={addStaff}
                  className="text-xs bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap transition-colors"
                >
                  <i className="ri-user-add-line mr-1" />添加第一位人员
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {staffList.map((staff, i) => (
                  <div
                    key={i}
                    className="relative group bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-slate-200 transition-all"
                  >
                    {/* 操作按钮组 */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => moveUp(i)}
                          className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300 cursor-pointer transition-colors"
                          title="上移"
                        >
                          <i className="ri-arrow-up-s-line text-xs" />
                        </button>
                      )}
                      {i < staffList.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveDown(i)}
                          className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300 cursor-pointer transition-colors"
                          title="下移"
                        >
                          <i className="ri-arrow-down-s-line text-xs" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeStaff(i)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 cursor-pointer transition-colors"
                        title="删除"
                      >
                        <i className="ri-close-line text-xs" />
                      </button>
                    </div>

                    {/* 序号 */}
                    <div className="absolute top-2 left-2 w-5 h-5 flex items-center justify-center rounded-full bg-white border border-slate-200 text-xs font-bold text-slate-400">
                      {i + 1}
                    </div>

                    {/* 照片上传 */}
                    <div className="flex justify-center mb-3 mt-1">
                      <ImageUploader
                        value={staff.photoUrl}
                        onChange={(url) => updateStaff(i, 'photoUrl', url)}
                        shape="circle"
                        size="h-20 w-20"
                        placeholder="上传照片"
                      />
                    </div>

                    {/* 姓名 */}
                    <input
                      type="text"
                      value={staff.name}
                      onChange={(e) => updateStaff(i, 'name', e.target.value)}
                      placeholder="姓名"
                      className="w-full text-sm text-center font-medium text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 transition-all placeholder:text-slate-300"
                    />

                    {/* 职务 */}
                    <input
                      type="text"
                      value={staff.title}
                      onChange={(e) => updateStaff(i, 'title', e.target.value)}
                      placeholder="职务"
                      className="w-full text-xs text-center text-slate-600 border border-slate-200 rounded-lg px-2 py-1.5 mt-2 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 transition-all placeholder:text-slate-300"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 今日值班选择 */}
        {staffList.filter((s) => s.name.trim()).length > 0 && (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  <i className="ri-calendar-check-line text-amber-500 mr-1.5" />
                  今日值班选择
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  点击人员卡片选择今日当班，已选 {todayDutyNames.size} 人
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllDuty}
                  className="text-xs border border-slate-200 text-slate-500 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap transition-colors"
                >
                  全选
                </button>
                <button
                  type="button"
                  onClick={clearAllDuty}
                  className="text-xs border border-slate-200 text-slate-500 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap transition-colors"
                >
                  清空
                </button>
                <button
                  type="button"
                  onClick={saveDutyStaff}
                  disabled={saving}
                  className="text-xs bg-amber-500 text-white px-4 py-1.5 rounded-lg hover:bg-amber-600 cursor-pointer whitespace-nowrap disabled:opacity-60 transition-colors flex items-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <i className="ri-loader-4-line animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <i className="ri-save-line" />保存值班
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="flex flex-wrap gap-2">
                {staffList
                  .filter((s) => s.name.trim())
                  .map((staff) => {
                    const selected = todayDutyNames.has(staff.name);
                    return (
                      <button
                        key={staff.name}
                        type="button"
                        onClick={() => toggleDuty(staff.name)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-full border cursor-pointer transition-all whitespace-nowrap ${
                          selected
                            ? 'bg-amber-50 border-amber-300 text-amber-800'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
                          {staff.photoUrl ? (
                            <img src={staff.photoUrl} alt={staff.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <i className="ri-user-3-line text-slate-400 text-xs" />
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-medium">{staff.name}</span>
                        <span className="text-[10px] opacity-60">{staff.title}</span>
                        {selected && (
                          <i className="ri-checkbox-circle-fill text-amber-500 text-sm" />
                        )}
                      </button>
                    );
                  })}
              </div>

              {todayDutyNames.size === 0 && (
                <div className="text-center py-6">
                  <p className="text-xs text-slate-400">
                    <i className="ri-information-line mr-1" />
                    尚未选择今日值班人员，大屏将显示全部炊事人员
                  </p>
                </div>
              )}

              {todayDutyNames.size > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-500 mb-2">
                    今日值班预览（将显示在 DISPLAY5 大屏顶部）：
                  </p>
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {staffList
                      .filter((s) => todayDutyNames.has(s.name))
                      .map((staff) => (
                        <div key={staff.name} className="flex items-center gap-2 flex-shrink-0 bg-amber-50 rounded-full pr-3 border border-amber-200">
                          <div className="w-7 h-7 rounded-full overflow-hidden bg-amber-100 flex-shrink-0 border border-amber-200">
                            {staff.photoUrl ? (
                              <img src={staff.photoUrl} alt={staff.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <i className="ri-user-3-line text-amber-400 text-xs" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-amber-800 text-xs font-medium leading-tight">{staff.name}</p>
                            <p className="text-amber-500 text-[10px] leading-tight">{staff.title}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 保存按钮 */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={loadStaffData}
            className="text-sm border border-slate-200 text-slate-600 px-4 py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap transition-colors"
          >
            <i className="ri-refresh-line mr-1" />重置
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-sm bg-emerald-500 text-white px-6 py-2.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-60 transition-colors flex items-center gap-2"
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