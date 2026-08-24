import { useState, useEffect } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { supabase } from '@/lib/supabase';

interface MealPeriod {
  meal_type: number;
  meal_name: string;
  start_time: string;
  end_time: string;
  enabled: boolean;
}

const DEFAULT_PERIODS: MealPeriod[] = [
  { meal_type: 0, meal_name: '早餐', start_time: '05:00', end_time: '10:00', enabled: true },
  { meal_type: 1, meal_name: '午餐', start_time: '10:00', end_time: '16:00', enabled: true },
  { meal_type: 2, meal_name: '晚餐', start_time: '16:00', end_time: '22:00', enabled: true },
];

function getLocalApiBase(): string {
  // 纯局域网环境，只用 localhost 访问本地服务端（本地服务端监听 0.0.0.0:8081）
  return 'http://localhost:8081';
}

function isElectronEnv(): boolean {
  return typeof (window as any).electronAPI !== 'undefined';
}

function getCurrentMealInfo(periods: MealPeriod[]): string {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  for (const p of periods) {
    if (!p.enabled) continue;
    const [sh, sm] = (p.start_time || '05:00').split(':').map(Number);
    const [eh, em] = (p.end_time || '10:00').split(':').map(Number);
    if (minutes >= sh * 60 + sm && minutes < eh * 60 + em) {
      return `当前餐段：${p.meal_name}（${p.start_time} - ${p.end_time}）`;
    }
  }
  return '当前时间段无匹配餐段';
}

export default function MealPeriodConfigPage() {
  const [periods, setPeriods] = useState<MealPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'warning'; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const LOCAL_API = getLocalApiBase();

      // 策略1：尝试本地服务端 API
      try {
        const r = await fetch(`${LOCAL_API}/api/meal-period-config`, { signal: AbortSignal.timeout(3000) });
        const data = await r.json();
        if (data.code === 0 && Array.isArray(data.data) && data.data.length > 0) {
          if (!cancelled) {
            setPeriods(data.data);
            setLoading(false);
          }
          return;
        }
      } catch {
        // 本地 API 不可用，继续下一级兜底
      }

      // 策略2：Electron 环境 → 本地 SQLite（meal_period_config 表）
      if (isElectronEnv()) {
        try {
          const { data, error } = await supabase
            .from('meal_period_config')
            .select('*')
            .order('meal_type');
          if (!cancelled) {
            if (!error && data && data.length > 0) {
              setPeriods(data as MealPeriod[]);
              setStatus({ type: 'warning', msg: '本地服务端未连接（端口 8081），已从本地数据库加载配置。' });
            } else {
              setPeriods([...DEFAULT_PERIODS]);
            }
            setLoading(false);
          }
          return;
        } catch {
          // fall through to defaults
        }
      }

      // 策略3：兜底默认值
      if (!cancelled) {
        setPeriods([...DEFAULT_PERIODS]);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const handleChange = (index: number, field: string, value: string | boolean) => {
    setPeriods((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    const LOCAL_API = getLocalApiBase();

    let saved = false;

    // 策略1：保存到本地服务端 API → 服务端写入 meal-period-config.json
    try {
      const res = await fetch(`${LOCAL_API}/api/meal-period-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(periods),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      if (data.code === 0) {
        saved = true;
        setStatus({ type: 'success', msg: '保存成功！配置已写入本地服务端，重启后端服务或等待自动重载后设备端生效。' });
      } else {
        setStatus({ type: 'warning', msg: `本地服务端返回异常：${data.msg || '未知错误'}，尝试写入本地数据库...` });
      }
    } catch {
      // 本地 API 不可用，尝试下一级兜底
    }

    // 策略2：Electron 环境 → 写入本地 SQLite（meal_period_config 表）
    if (!saved && isElectronEnv()) {
      try {
        const rows = periods.map((p) => ({
          meal_type: p.meal_type,
          meal_name: p.meal_name,
          start_time: p.start_time,
          end_time: p.end_time,
          enabled: p.enabled,
        }));
        const { error } = await supabase.from('meal_period_config').upsert(rows, { onConflict: 'meal_type' });
        if (!error) {
          saved = true;
          setStatus({ type: 'success', msg: '保存成功！配置已写入本地数据库。注意：设备端通过本地服务端读取配置，请确保本地服务端（端口 8081）已启动。' });
        } else {
          setStatus({ type: 'error', msg: '保存到本地数据库失败：' + error.message });
        }
      } catch (e: any) {
        setStatus({ type: 'error', msg: '保存到本地数据库失败：' + (e.message || '未知错误') });
      }
    }

    // 策略3：纯局域网但非 Electron（比如直接用浏览器访问局域网 IP）
    // 此时没有 electronAPI，也没有云端，只能依赖本地 API（已经在策略1试过）
    if (!saved && !isElectronEnv()) {
      if (typeof (window as any).electronAPI === 'undefined') {
        setStatus({
          type: 'error',
          msg: '保存失败：本地服务端（localhost:8081）未响应，且不在 Electron 桌面应用中。请在局域网设备上通过桌面应用打开此页面，或确认本地服务端已启动。',
        });
      }
    }

    setSaving(false);
  };

  const handleReset = () => {
    setPeriods([...DEFAULT_PERIODS]);
    setStatus({ type: 'success', msg: '已恢复为默认时间，点击「保存」生效' });
  };

  const currentInfo = periods.length > 0 ? getCurrentMealInfo(periods) : '';

  return (
    <AppLayout title="餐段时间配置" breadcrumb={['餐饮管理', '餐段时间配置']}>
      <div className="max-w-2xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-foreground-500">加载中...</p>
          </div>
        ) : (
          <>
            {currentInfo && (
              <div className="mb-6 px-4 py-3 bg-accent-100 text-accent-900 rounded-lg text-sm">
                <i className="ri-information-line mr-2" />
                {currentInfo}
              </div>
            )}

            {status && (
              <div
                className={`mb-6 px-4 py-3 rounded-lg text-sm ${
                  status.type === 'success'
                    ? 'bg-green-100 text-green-900'
                    : status.type === 'warning'
                      ? 'bg-yellow-100 text-yellow-900'
                      : 'bg-red-100 text-red-900'
                }`}
              >
                <i className={`${
                  status.type === 'success'
                    ? 'ri-check-line'
                    : status.type === 'warning'
                      ? 'ri-alert-line'
                      : 'ri-error-warning-line'
                } mr-2`} />
                {status.msg}
              </div>
            )}

            <div className="space-y-4 mb-8">
              {periods.map((p, idx) => (
                <div
                  key={p.meal_type}
                  className="flex items-center gap-4 p-4 bg-background-100 rounded-lg border border-background-200/70"
                >
                  <div className="w-24">
                    <input
                      type="text"
                      value={p.meal_name}
                      onChange={(e) => handleChange(idx, 'meal_name', e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-background-300/60 rounded-md text-foreground-950 focus:outline-none focus:border-primary-500"
                      placeholder="餐段名"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={p.start_time}
                      onChange={(e) => handleChange(idx, 'start_time', e.target.value)}
                      className="px-3 py-2 text-sm bg-white border border-background-300/60 rounded-md text-foreground-950 focus:outline-none focus:border-primary-500"
                    />
                    <span className="text-foreground-400 text-sm">—</span>
                    <input
                      type="time"
                      value={p.end_time}
                      onChange={(e) => handleChange(idx, 'end_time', e.target.value)}
                      className="px-3 py-2 text-sm bg-white border border-background-300/60 rounded-md text-foreground-950 focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-foreground-600 cursor-pointer whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) => handleChange(idx, 'enabled', e.target.checked)}
                      className="w-4 h-4 rounded accent-primary-500"
                    />
                    启用
                  </label>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 text-sm font-medium bg-primary-500 text-white rounded-md hover:bg-primary-600 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer select-none"
              >
                {saving ? '保存中...' : '保存配置'}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-6 py-2.5 text-sm font-medium bg-background-200/70 text-foreground-700 rounded-md hover:bg-background-300/60 transition-colors whitespace-nowrap cursor-pointer select-none"
              >
                恢复默认
              </button>
            </div>

            <div className="mt-8 p-4 bg-background-100 rounded-lg border border-background-200/70">
              <h3 className="text-sm font-medium text-foreground-900 mb-2">说明</h3>
              <ul className="text-xs text-foreground-500 space-y-1 list-disc list-inside">
                <li>餐段时间决定取餐盘设备/秤推送哪个餐段的菜品</li>
                <li>如果当前时间不在任何餐段范围内，默认显示午餐</li>
                <li>设备端（乐牛/腾云/小牛）拉取 interval-config 时会获取此配置</li>
                <li>配置优先保存到本地服务端（端口 8081），如服务端未启动则写入本地数据库</li>
                <li>设备端通过本地服务端的 /api/v4/.../interval-config 接口实时读取配置</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}