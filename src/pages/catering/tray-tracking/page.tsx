import { useState, useEffect } from 'react';

import AppLayout from '@/components/feature/AppLayout';
import { useTrayTracking } from './hooks/useTrayTracking';
import TrayCard from './components/TrayCard';
import PickupDetailsPanel from './components/PickupDetailsPanel';
import AddPickupModal from './components/AddPickupModal';
import TrayDisplayDevices from './components/TrayDisplayDevices';
import ScaleTestPanel from './components/ScaleTestPanel';
import TrayStationModal, { defaultStationForm, StationFormData } from './components/TrayStationModal';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { getLocalServerPort, getLocalLanIp, ensureLocalServerPortInit, DEFAULT_HTTP_PORT_8081 } from '@/lib/localServer';

const CATEGORY_COLORS: Record<string, string> = {
  荤菜: '#f87171',
  素菜: '#34d399',
  家常菜: '#fbbf24',
  主食: '#fb923c',
  汤品: '#38bdf8',
  凉菜: '#2dd4bf',
};

type TabKey = 'tray' | 'analysis' | 'displays' | 'test';

export default function TrayTrackingPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('tray');

  const [localPort, setLocalPort] = useState(0);
  const [lanIp, setLanIp] = useState('');
  const [isElectron, setIsElectron] = useState(false);
  const [localServerReady, setLocalServerReady] = useState(false);

  // Station modal state
  const [stationModalOpen, setStationModalOpen] = useState(false);
  const [stationEditing, setStationEditing] = useState(false);
  const [stationFormData, setStationFormData] = useState<StationFormData>(defaultStationForm);
  const [stationFormError, setStationFormError] = useState('');
  const [stationSubmitting, setStationSubmitting] = useState(false);

  // Pickup modal state
  const [pickupModalOpen, setPickupModalOpen] = useState(false);
  const [pickupModalStation, setPickupModalStation] = useState<any>(null);

  const openPickupModal = () => {
    const firstStation = summaries.length > 0 ? summaries[0] : null;
    if (!firstStation) {
      return;
    }
    setPickupModalStation(firstStation);
    setPickupModalOpen(true);
  };

  const handlePickupSubmit = async (data: {
    station: any;
    weight_before: number;
    weight_after: number;
    person_id?: string;
    notes?: string;
  }) => {
    const result = await addPickupLog(data);
    if (!result.error) {
      setPickupModalOpen(false);
      setPickupModalStation(null);
    }
    return result;
  };

  useEffect(() => {
    const hasElectron = !!(window as any).electronAPI;
    setIsElectron(hasElectron);
    console.log('[TrayTrackingPage] electronAPI exists:', hasElectron);

    if (!hasElectron) {
      // 浏览器环境：没有本地服务器，直接用默认端口，不轮询
      console.log('[TrayTrackingPage] 浏览器环境，跳过本地服务器端口轮询');
      setLocalPort(DEFAULT_HTTP_PORT_8081);
      setLocalServerReady(false);
      setLanIp('');
      return;
    }

    const port = getLocalServerPort();
    console.log('[TrayTrackingPage] localServer cached port:', port);
    if (port > 0) {
      setLocalPort(port);
      setLocalServerReady(true);
      setLanIp(getLocalLanIp());
    } else {
      ensureLocalServerPortInit();
      let attempts = 0;
      const maxAttempts = 30;
      const checkInterval = setInterval(() => {
        const p = getLocalServerPort();
        attempts++;
        console.log('[TrayTrackingPage] polling port attempt', attempts, 'port:', p);
        if (p > 0) {
          setLocalPort(p);
          setLocalServerReady(true);
          setLanIp(getLocalLanIp());
          clearInterval(checkInterval);
        } else if (attempts >= maxAttempts) {
          console.error('[TrayTrackingPage] 端口获取超时，本地服务器未启动');
          setLocalPort(0);
          setLocalServerReady(false);
          setLanIp('');
          clearInterval(checkInterval);
        }
      }, 500);
    }

    // ★ 兜底获取局域网 IP（如果 initLocalServerPort 里已获取则直接读缓存）
    if (!getLocalLanIp()) {
      const api = (window as any).electronAPI;
      if (api?.localServer?.getLanIp) {
        api.localServer.getLanIp().then((ip: string) => {
          console.log('[TrayTrackingPage] getLanIp result:', ip);
          setLanIp(ip || '');
        }).catch((err: any) => {
          console.error('[TrayTrackingPage] getLanIp error:', err);
          setLanIp('');
        });
      }
    }
  }, []);

  const {
    stations,
    logs,
    summaries,
    categorySummaries,
    categories,
    productCategories,
    loading,
    selectedMeal,
    setSelectedMeal,
    selectedCategory,
    setSelectedCategory,
    selectedDate,
    setSelectedDate,
    refetch,
    MEAL_TYPES,
    displayDevices,
    displayLoading,
    refreshDisplays,
    createDisplayDevice,
    updateDisplayDevice,
    deleteDisplayDevice,
    getRegisterUrl,
    getDishesUrl,
    getWeightReportUrl,
    getWeightQueryUrl,
    getWebSocketUrl,
    stationMap,
    allDishes,
    bindStationToDish,
    createStation,
    updateStation,
    deleteStation,
    addPickupLog,
    manualRegister,
  } = useTrayTracking();

  const totalPickups = summaries.reduce((s, v) => s + v.today_pickups, 0);
  const totalWeight = summaries.reduce((s, v) => s + v.today_weight, 0);
  const activeTrayCount = summaries.filter((s) => s.today_pickups > 0).length;

  const chartData = categorySummaries.map((c) => ({
    name: c.category,
    取餐次数: c.total_pickups,
  }));

  // Station modal helpers
  const openStationAdd = () => {
    setStationFormData(defaultStationForm);
    setStationEditing(false);
    setStationFormError('');
    setStationModalOpen(true);
  };

  const openStationEdit = (station: any) => {
    setStationFormData({
      id: station.id,
      name: station.name || '',
      station_code: station.station_code || '',
      category: station.category || '',
      location: station.location || '',
      dish_name: station.dish_name || '',
      tare_weight: String(station.tare_weight || 800),
      capacity_max: String(station.capacity_max || 60),
      sort_order: String(station.sort_order || 0),
      is_active: station.is_active !== false,
      hw_enabled: station.hw_enabled === true,
      hw_ip: station.hw_ip || '',
      hw_port: String(station.hw_port || ''),
      hw_sn: station.hw_sn || '',
      product_item_id: station.product_item_id ? String(station.product_item_id) : '',
    });
    setStationEditing(true);
    setStationFormError('');
    setStationModalOpen(true);
  };

  const handleStationSubmit = async () => {
    const d = stationFormData;
    if (!d.name.trim()) {
      setStationFormError('请输入餐盘名称');
      return;
    }
    if (!d.station_code.trim()) {
      setStationFormError('请输入餐盘编号');
      return;
    }
    if (!d.category.trim()) {
      setStationFormError('请选择分类');
      return;
    }
    setStationSubmitting(true);
    setStationFormError('');
    try {
      const payload = {
        name: d.name.trim(),
        station_code: d.station_code.trim(),
        category: d.category.trim(),
        location: d.location.trim(),
        dish_name: d.dish_name.trim(),
        tare_weight: Number(d.tare_weight) || 0,
        capacity_max: Number(d.capacity_max) || 0,
        sort_order: Number(d.sort_order) || 0,
        is_active: d.is_active,
        hw_enabled: d.hw_enabled,
        hw_ip: d.hw_ip.trim() || null,
        hw_port: d.hw_port ? Number(d.hw_port) : null,
        hw_sn: d.hw_sn.trim() || null,
        product_item_id: d.product_item_id ? Number(d.product_item_id) : null,
      };
      if (stationEditing && d.id) {
        const { error } = await updateStation(d.id, payload);
        if (error) {
          setStationFormError(error.message || '保存失败');
          setStationSubmitting(false);
          return;
        }
      } else {
        const { error } = await createStation(payload);
        if (error) {
          setStationFormError(error.message || '新增失败');
          setStationSubmitting(false);
          return;
        }
      }
      setStationSubmitting(false);
      setStationModalOpen(false);
      setStationFormData(defaultStationForm);
      setStationEditing(false);
      // 强制刷新数据，确保新增/编辑的餐盘立即显示
      console.log('[TrayTrackingPage] Station saved, triggering refetch...');
      await refetch();
      console.log('[TrayTrackingPage] Refetch completed');
    } catch (err: any) {
      setStationFormError(err.message || '操作失败');
      setStationSubmitting(false);
    }
  };

  const handleStationDelete = async (station: any) => {
    if (station.id < 0) return; // Virtual tray cannot be deleted
    const { error } = await deleteStation(station.id);
    if (error) {
      console.error('删除餐盘失败:', error);
    }
  };

  return (
    <AppLayout title="智能取餐管理" breadcrumb={['餐饮管理', '智能取餐管理']}>
      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-5">
        {([
          { key: 'tray', label: '取餐盘记录', icon: 'ri-inbox-archive-line' },
          { key: 'analysis', label: '取餐分析', icon: 'ri-pie-chart-line' },
          { key: 'displays', label: '电子屏设备', icon: 'ri-tv-2-line' },
          { key: 'test', label: '测试上报', icon: 'ri-flask-line' },
        ] as { key: TabKey; label: string; icon: string }[]).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-md transition-all cursor-pointer whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-white text-slate-800 font-medium'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <i className={tab.icon} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== TAB: 取餐盘记录 ===== */}
      {activeTab === 'tray' && (
        <>
          {/* Top controls */}
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                <i className="ri-calendar-line text-slate-400 text-sm" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-sm text-slate-700 outline-none cursor-pointer"
                />
              </div>
              <div className="flex bg-white border border-slate-200 rounded-lg p-1 gap-1">
                {MEAL_TYPES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedMeal(m)}
                    className={`text-xs px-3 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                      selectedMeal === m
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refetch}
                className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 bg-white px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-refresh-line" />刷新
              </button>
              <button
                type="button"
                onClick={openStationAdd}
                className="flex items-center gap-1.5 text-xs bg-slate-900 text-white px-3 py-2 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line" />新增餐盘
              </button>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              { label: '取餐次数', value: totalPickups.toString(), unit: '次', icon: 'ri-swap-box-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: '取餐总重量', value: totalWeight >= 1000 ? `${(totalWeight / 1000).toFixed(1)}` : Math.round(totalWeight).toString(), unit: totalWeight >= 1000 ? 'kg' : 'g', icon: 'ri-weight-line', color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: '活跃托盘', value: activeTrayCount.toString(), unit: `/ ${summaries.length}`, icon: 'ri-dashboard-3-line', color: 'text-teal-600', bg: 'bg-teal-50' },
              { label: '称重在线', value: summaries.filter((s) => s.hw_enabled && s.hw_last_seen && new Date().getTime() - new Date(s.hw_last_seen).getTime() < 5 * 60 * 1000).length.toString(), unit: ` / ${summaries.filter((s) => s.hw_enabled).length}`, icon: 'ri-wifi-line', color: 'text-sky-600', bg: 'bg-sky-50' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3">
                <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${s.bg}`}>
                  <i className={`${s.icon} ${s.color} text-xl`} />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-800">{s.value}<span className="text-xs text-slate-400 font-normal ml-1">{s.unit}</span></p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* Category chart */}
            <div className="bg-white rounded-xl border border-slate-100 p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">菜系取餐分布</h3>
              <p className="text-xs text-slate-400 mb-4">各菜系取餐次数统计</p>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} barSize={16} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: 12 }} />
                    <Bar dataKey="取餐次数" radius={[3, 3, 0, 0]}>
                      {chartData.map((entry) => (
                        <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || '#94a3b8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-slate-300 text-sm">暂无数据</div>
              )}
            </div>

            {/* Category summary list */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">菜系汇总</h3>
              <p className="text-xs text-slate-400 mb-4">按菜系分组的取餐数据</p>
              <div className="space-y-2.5">
                {categorySummaries.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">暂无数据</p>
                ) : categorySummaries.map((cat) => {
                  const maxWeight = Math.max(...categorySummaries.map((c) => c.total_weight), 1);
                  const pct = Math.round((cat.total_weight / maxWeight) * 100);
                  return (
                    <div key={cat.category} className="flex items-center gap-3">
                      <div className="w-14 text-right">
                        <span className="text-xs font-medium text-slate-700">{cat.category}</span>
                      </div>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[cat.category] || '#94a3b8' }}
                        />
                      </div>
                      <div className="flex items-center gap-3 min-w-[130px]">
                        <span className="text-xs text-slate-400">{cat.total_pickups} 次</span>
                        <span className="text-xs font-semibold text-slate-700">
                          {cat.total_weight >= 1000
                            ? `${(cat.total_weight / 1000).toFixed(1)}kg`
                            : `${Math.round(cat.total_weight)}g`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs text-slate-400">筛选菜系：</span>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Tray grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : summaries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-xl border border-slate-100 mb-6">
              <i className="ri-inbox-2-line text-3xl mb-3" />
              <p className="text-sm font-medium text-slate-600">暂无取餐盘</p>
              <p className="text-xs mt-1 max-w-xs text-center">当前还没有添加任何取餐盘。点击右上角「新增餐盘」或下方按钮来创建第一个餐盘。</p>
              <button
                type="button"
                onClick={openStationAdd}
                className="mt-4 flex items-center gap-1.5 text-xs bg-slate-900 text-white px-4 py-2.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line" />新增餐盘
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
              {summaries.map((station) => (
                <TrayCard
                  key={station.id}
                  station={station}
                  dishes={allDishes}
                  onBindDish={bindStationToDish}
                  onEdit={openStationEdit}
                  onDelete={handleStationDelete}
                  onAddPickup={(s) => {
                    setPickupModalStation(s);
                    setPickupModalOpen(true);
                  }}
                />
              ))}
            </div>
          )}

          {/* Add Pickup Modal */}
          <AddPickupModal
            station={pickupModalStation}
            onClose={() => {
              setPickupModalOpen(false);
              setPickupModalStation(null);
            }}
            onSubmit={handlePickupSubmit}
          />

          {/* Station Add/Edit Modal */}
          <TrayStationModal
            open={stationModalOpen}
            editing={stationEditing}
            formData={stationFormData}
            categories={productCategories}
            dishes={allDishes}
            formError={stationFormError}
            submitting={stationSubmitting}
            onClose={() => {
              setStationModalOpen(false);
              setStationFormData(defaultStationForm);
              setStationEditing(false);
              setStationFormError('');
            }}
            onChange={setStationFormData}
            onSubmit={handleStationSubmit}
          />
        </>
      )}

      {/* ===== TAB: 取餐分析 ===== */}
      {activeTab === 'analysis' && (
        <PickupDetailsPanel />
      )}

      {/* ===== TAB: 电子屏设备 ===== */}
      {activeTab === 'displays' && (
        <>
          {/* 本地服务器状态诊断 */}
          {!isElectron && (
            <div className="mb-4 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
              <div className="flex items-start gap-2">
                <i className="ri-information-line text-amber-500 mt-0.5" />
                <div className="text-xs text-amber-700">
                  <p className="font-medium">当前在浏览器中运行</p>
                  <p className="mt-0.5">本地服务器地址仅在 Electron 桌面应用中显示。如需本地设备注册，请打开桌面应用。</p>
                </div>
              </div>
            </div>
          )}
          {isElectron && !localServerReady && (
            <div className="mb-4 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
              <div className="flex items-start gap-2">
                <i className="ri-error-warning-line text-red-500 mt-0.5" />
                <div className="text-xs text-red-700">
                  <p className="font-medium">本地服务器未启动（localPort: {localPort}）</p>
                  <p className="mt-0.5">本地设备注册地址无法显示。请重启桌面应用，或查看日志排查原因。</p>
                </div>
              </div>
            </div>
          )}
          {isElectron && localServerReady && (
            <div className="mb-4 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
              <div className="flex items-start gap-2">
                <i className="ri-checkbox-circle-line text-emerald-500 mt-0.5" />
                <div className="text-xs text-emerald-700">
                  <p className="font-medium">本地服务器运行中</p>
                  <p className="mt-0.5">HTTP 端口: {localPort} · 局域网 IP: {lanIp || '获取中...'}</p>
                </div>
              </div>
            </div>
          )}

          <TrayDisplayDevices
            devices={displayDevices}
            loading={displayLoading}
            onRefresh={refreshDisplays}
            onCreate={createDisplayDevice}
            onUpdate={updateDisplayDevice}
            onDelete={deleteDisplayDevice}
            stationOptions={stations}
            getRegisterUrl={getRegisterUrl}
            getDishesUrl={getDishesUrl}
            getWeightReportUrl={getWeightReportUrl}
            getWeightQueryUrl={getWeightQueryUrl}
            getWebSocketUrl={getWebSocketUrl}
            localPort={localPort}
            lanIp={lanIp}
            manualRegister={manualRegister}
          />
        </>
      )}

      {/* ===== TAB: 测试上报 ===== */}
      {activeTab === 'test' && <ScaleTestPanel />}
    </AppLayout>
  );
}