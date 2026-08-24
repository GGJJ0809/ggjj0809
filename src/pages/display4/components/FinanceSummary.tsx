import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface FinanceData {
  income: number;
  expense: number;
  balance: number;
}

function formatMoney(val: number) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}

export default function FinanceSummary() {
  const [data, setData] = useState<FinanceData>({
    income: 0,
    expense: 0,
    balance: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchFinance = async () => {
    try {
      const { data: row, error } = await supabase
        .from('display_finance_config')
        .select('income, expense, balance')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (row) {
        setData({
          income: Number(row.income) || 0,
          expense: Number(row.expense) || 0,
          balance: Number(row.balance) || 0,
        });
      }
    } catch (e) {
      console.error('[FinanceSummary] fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinance();
    const timer = setInterval(fetchFinance, 30000);
    return () => clearInterval(timer);
  }, []);

  const items = [
    {
      label: '上月总收入',
      value: data.income,
      icon: 'ri-money-cny-circle-line',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      dot: 'bg-emerald-400',
    },
    {
      label: '上月总支出',
      value: data.expense,
      icon: 'ri-shopping-cart-line',
      color: 'text-rose-400',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
      dot: 'bg-rose-400',
    },
    {
      label: '伙食费结余',
      value: data.balance,
      icon: 'ri-wallet-3-line',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      dot: 'bg-amber-400',
    },
  ];

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-violet-500/10">
          <i className="ri-bar-chart-box-line text-violet-400 text-xl" />
        </div>
        <span className="text-4xl font-semibold text-slate-200">财务概览</span>
      </div>

      <div className="flex-1 flex flex-row gap-2 min-h-0 overflow-hidden">
        {items.map((item) => (
          <div key={item.label} className={`${item.bg} rounded-lg border ${item.border} p-3 flex-1 min-w-0 flex flex-col justify-center items-center text-center`}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`w-3 h-3 rounded-full ${item.dot}`} />
              <i className={`${item.icon} ${item.color} text-xl`} />
              <span className="text-xl text-slate-400">{item.label}</span>
            </div>
            {loading ? (
              <i className="ri-loader-4-line animate-spin text-3xl text-slate-500" />
            ) : (
              <p className={`text-3xl font-bold font-mono ${item.color} truncate w-full`}>
                ¥{formatMoney(item.value)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}