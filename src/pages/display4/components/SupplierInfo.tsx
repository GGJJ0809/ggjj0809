import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface Supplier {
  name: string;
  category: string;
  is_active: boolean;
}

const FALLBACK_SUPPLIERS: Supplier[] = [
  { name: '深圳绿色农副产品有限公司', category: '肉类', is_active: true },
  { name: '广东绿鑫源农产品有限公司', category: '蔬果类', is_active: true },
  { name: '广东绿鑫源农产品有限公司', category: '干调类', is_active: true },
  { name: '新疆省哈密市军粮供应站', category: '米面油豆类', is_active: true },
];

const categoryColors: Record<string, string> = {
  肉类: '#f87171',
  蔬果类: '#34d399',
  干调类: '#fbbf24',
  '米面油豆类': '#38bdf8',
};

const categoryIcons: Record<string, string> = {
  肉类: 'ri-restaurant-line',
  蔬果类: 'ri-plant-line',
  干调类: 'ri-shopping-basket-line',
  '米面油豆类': 'ri-bowl-line',
};

export default function SupplierInfo() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('suppliers')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (data && data.length > 0) {
        const mapped = data.map((s: any) => ({
          name: s.name || '未知供应商',
          category: s.category || '其他',
          is_active: s.is_active !== false,
        }));
        setSuppliers(mapped);
      } else {
        setSuppliers(FALLBACK_SUPPLIERS);
      }
    } catch (e) {
      console.error('[SupplierInfo] fetch error:', e);
      setSuppliers(FALLBACK_SUPPLIERS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll animation
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || loading) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) return;
    let pos = 0;
    const step = 0.6;
    const interval = setInterval(() => {
      pos += step;
      if (pos >= maxScroll + 30) pos = 0;
      el.scrollTop = pos;
    }, 40);
    return () => clearInterval(interval);
  }, [suppliers, loading]);

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-orange-500/10">
          <i className="ri-truck-line text-orange-400 text-3xl" />
        </div>
        <span className="text-4xl font-semibold text-slate-200">供应商信息</span>
        <span className="text-3xl text-slate-500 ml-auto">{suppliers.length} 家</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-hidden space-y-2.5 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-slate-500">
            <i className="ri-loader-4-line animate-spin text-7xl mr-2" />
            <span className="text-4xl">加载中...</span>
          </div>
        ) : (
          suppliers.map((s) => {
            const color = categoryColors[s.category] || '#94a3b8';
            const icon = categoryIcons[s.category] || 'ri-store-line';
            return (
              <div key={`${s.name}-${s.category}`} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                <div className="w-11 h-11 flex items-center justify-center rounded-lg flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
                  <i className={`${icon} text-4xl`} style={{ color }} />
                </div>
                <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                  <p className="text-4xl text-slate-300 truncate font-medium">{s.name}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span
                      className="text-4xl px-1.5 py-0.5 rounded whitespace-nowrap"
                      style={{ color, backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
                    >
                      {s.category}
                    </span>
                    <span className="text-4xl text-emerald-400 flex items-center gap-0.5 whitespace-nowrap">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      合作中
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}