import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { nowBeijing, todayBeijing } from '@/lib/dateUtils';
import { useNavigate } from 'react-router-dom';

interface FinanceConfig {
  id: number;
  income: number;
  expense: number;
  balance: number;
  updated_at: string;
}

interface FinanceHistory {
  id: number;
  year_month: string;
  income: number;
  expense: number;
  balance: number;
  created_at: string;
  updated_at: string;
}

export default function FinanceConfigPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<FinanceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ income: '', expense: '', balance: '' });
  const [history, setHistory] = useState<FinanceHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('display_finance_config')
        .select('*')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      if (data) {
        const c = data as any;
        setConfig(c);
        setForm({
          income: String(c.income || ''),
          expense: String(c.expense || ''),
          balance: String(c.balance || ''),
        });
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('display_finance_config')
          .insert({ income: 128560.50, expense: 96740.80, balance: 31819.70 })
          .select()
          .maybeSingle();
        if (insertErr) {
          console.error('[FinanceConfigPage] insert default error:', insertErr);
          setMessage('初始化财务数据失败：' + (insertErr.message || '未知错误'));
          return;
        }
        if (inserted) {
          const c = inserted as any;
          setConfig(c);
          setForm({
            income: String(c.income),
            expense: String(c.expense),
            balance: String(c.balance),
          });
        } else {
          setMessage('初始化财务数据失败：插入后未返回数据，请重启应用');
        }
      }
    } catch (e) {
      console.error('[FinanceConfigPage] fetch error:', e);
      const err = e as any;
      setMessage('加载数据失败' + (err?.message ? '：' + err.message : ''));
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('display_finance_history')
        .select('*')
        .order('year_month', { ascending: false });
      if (error) throw error;
      setHistory((data as any[]) || []);
    } catch (e) {
      console.error('[FinanceConfigPage] fetch history error:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchHistory();
  }, []);

  const handleSave = async () => {
    if (!config) {
      setMessage('数据未加载完成，请刷新页面后重试');
      return;
    }
    const income = parseFloat(form.income);
    const expense = parseFloat(form.expense);
    const balance = parseFloat(form.balance);
    if (Number.isNaN(income) || Number.isNaN(expense) || Number.isNaN(balance)) {
      setMessage('请填写有效的数字');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      // Update current config
      const { error } = await supabase
        .from('display_finance_config')
        .update({ income, expense, balance, updated_at: nowBeijing() })
        .eq('id', config.id);
      if (error) throw error;

      // Upsert to history table
      const { error: historyError } = await supabase
        .from('display_finance_history')
        .upsert(
          {
            year_month: currentMonth,
            income,
            expense,
            balance,
            updated_at: nowBeijing(),
          },
          { onConflict: 'year_month' }
        );
      if (historyError) throw historyError;

      setMessage('保存成功');
      setTimeout(() => setMessage(''), 2000);
      await fetchConfig();
      await fetchHistory();
    } catch (e) {
      console.error('[FinanceConfigPage] save error:', e);
      const err = e as any;
      setMessage('保存失败' + (err?.message ? '：' + err.message : ''));
    } finally {
      setSaving(false);
    }
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  const formatMonth = (ym: string) => {
    const [y, m] = ym.split('-');
    return `${y}年${m}月`;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              title="返回菜单"
            >
              <i className="ri-arrow-left-line" />
            </button>
            <h1 className="text-3xl font-semibold text-slate-900">财务概览配置</h1>
          </div>
          <p className="text-lg text-slate-500 mt-1">手动填写上月财务数据，大屏将统一展示此处配置</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <i className="ri-loader-4-line animate-spin mr-2" />
          加载中...
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
            {/* Current preview */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <i className="ri-money-cny-circle-line text-emerald-500 text-lg" />
                </div>
                <p className="text-base text-slate-500 mb-1">上月总收入</p>
                <p className="text-2xl font-bold font-mono text-emerald-600">¥{formatMoney(config?.income || 0)}</p>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  <i className="ri-shopping-cart-line text-rose-500 text-lg" />
                </div>
                <p className="text-base text-slate-500 mb-1">上月总支出</p>
                <p className="text-2xl font-bold font-mono text-rose-600">¥{formatMoney(config?.expense || 0)}</p>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <i className="ri-wallet-3-line text-amber-500 text-lg" />
                </div>
                <p className="text-base text-slate-500 mb-1">伙食费结余</p>
                <p className="text-2xl font-bold font-mono text-amber-600">¥{formatMoney(config?.balance || 0)}</p>
              </div>
            </div>

            {/* Edit form */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-lg text-slate-700 mb-1.5 font-medium">上月总收入</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">¥</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.income}
                      onChange={(e) => setForm((prev) => ({ ...prev, income: e.target.value }))}
                      className="w-full text-lg text-slate-700 border border-slate-200 rounded-md pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-lg text-slate-700 mb-1.5 font-medium">上月总支出</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">¥</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.expense}
                      onChange={(e) => setForm((prev) => ({ ...prev, expense: e.target.value }))}
                      className="w-full text-lg text-slate-700 border border-slate-200 rounded-md pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-lg text-slate-700 mb-1.5 font-medium">伙食费结余</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">¥</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.balance}
                      onChange={(e) => setForm((prev) => ({ ...prev, balance: e.target.value }))}
                      className="w-full text-lg text-slate-700 border border-slate-200 rounded-md pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  {message && (
                    <span className={`text-lg ${message.includes('成功') ? 'text-emerald-600' : 'text-red-500'}`}>
                      {message}
                    </span>
                  )}
                  {config?.updated_at && (
                    <span className="text-base text-slate-400 ml-3">
                      最后更新：{new Date(config.updated_at).toLocaleString('zh-CN')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center gap-2 px-4 py-2 text-slate-600 text-lg border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className={`ri-history-line ${showHistory ? 'text-emerald-600' : ''}`} />
                    {showHistory ? '收起历史' : '查看历史'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-lg rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    <i className={`${saving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'}`} />
                    {saving ? '保存中...' : '保存数据'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* History list */}
          {showHistory && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <i className="ri-history-line text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-800">历史记录</h2>
                <span className="text-base text-slate-400">{history.length} 条记录</span>
              </div>

              {historyLoading ? (
                <div className="flex items-center justify-center py-10 text-slate-400">
                  <i className="ri-loader-4-line animate-spin mr-2" />
                  加载中...
                </div>
              ) : history.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-slate-400 text-lg">
                  <i className="ri-inbox-line mr-2" />
                  暂无历史记录
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-lg">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2.5 px-3 text-slate-500 font-medium text-base">月份</th>
                        <th className="text-right py-2.5 px-3 text-slate-500 font-medium text-base">上月总收入</th>
                        <th className="text-right py-2.5 px-3 text-slate-500 font-medium text-base">上月总支出</th>
                        <th className="text-right py-2.5 px-3 text-slate-500 font-medium text-base">伙食费结余</th>
                        <th className="text-right py-2.5 px-3 text-slate-500 font-medium text-base">更新时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row) => (
                        <tr
                          key={row.id}
                          className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${row.year_month === currentMonth ? 'bg-emerald-50/40' : ''}`}
                        >
                          <td className="py-2.5 px-3 text-slate-700">
                            <span className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              {formatMonth(row.year_month)}
                              {row.year_month === currentMonth && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded">当月</span>
                              )}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-emerald-600 font-mono text-right font-medium">
                            ¥{formatMoney(row.income)}
                          </td>
                          <td className="py-2.5 px-3 text-rose-600 font-mono text-right font-medium">
                            ¥{formatMoney(row.expense)}
                          </td>
                          <td className="py-2.5 px-3 text-amber-600 font-mono text-right font-medium">
                            ¥{formatMoney(row.balance)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-right text-base">
                            {row.updated_at ? new Date(row.updated_at).toLocaleString('zh-CN') : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}