import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { nowBeijing, todayBeijing } from '@/lib/dateUtils';
import { useNavigate } from 'react-router-dom';

interface SeasonConfig {
  id: number;
  term_name: string;
  next_term_name: string;
  foods: string[];
  health_tip: string;
  updated_at: string;
}

const defaultTerms: { term_name: string; next_term_name: string; foods: string[]; health_tip: string }[] = [
  { term_name: '小寒', next_term_name: '大寒', foods: ['萝卜', '白菜', '山药', '羊肉', '牛肉', '韭菜'], health_tip: '防寒保暖，适当进补' },
  { term_name: '大寒', next_term_name: '立春', foods: ['萝卜', '白菜', '山药', '羊肉', '牛肉', '韭菜'], health_tip: '保暖护阳，养肾防寒' },
  { term_name: '立春', next_term_name: '雨水', foods: ['韭菜', '菠菜', '春笋', '萝卜', '芹菜', '豆芽'], health_tip: '早睡早起，护肝养阳' },
  { term_name: '雨水', next_term_name: '惊蛰', foods: ['韭菜', '菠菜', '春笋', '芹菜', '豆芽', '荠菜'], health_tip: '健脾祛湿，少食生冷' },
  { term_name: '惊蛰', next_term_name: '春分', foods: ['韭菜', '菠菜', '春笋', '芹菜', '荠菜', '香椿'], health_tip: '清淡饮食，润肺防燥' },
  { term_name: '春分', next_term_name: '清明', foods: ['韭菜', '菠菜', '春笋', '芹菜', '荠菜', '香椿', '豌豆'], health_tip: '阴阳平衡，适度运动' },
  { term_name: '清明', next_term_name: '谷雨', foods: ['菠菜', '春笋', '荠菜', '香椿', '豌豆', '蚕豆', '韭菜'], health_tip: '清肝明目，少吃辛辣' },
  { term_name: '谷雨', next_term_name: '立夏', foods: ['菠菜', '春笋', '荠菜', '香椿', '豌豆', '蚕豆', '韭菜'], health_tip: '健脾祛湿，预防过敏' },
  { term_name: '立夏', next_term_name: '小满', foods: ['黄瓜', '丝瓜', '西红柿', '茄子', '豆角', '冬瓜', '芹菜'], health_tip: '养心清热，多饮水' },
  { term_name: '小满', next_term_name: '芒种', foods: ['黄瓜', '苦瓜', '丝瓜', '绿豆', '薏米', '冬瓜', '芹菜', '番茄', '茄子'], health_tip: '清热利湿，饮食清淡' },
  { term_name: '芒种', next_term_name: '夏至', foods: ['西瓜', '香瓜', '黄瓜', '苦瓜', '绿豆', '西红柿', '茄子', '冬瓜'], health_tip: '防暑降温，补充盐分' },
  { term_name: '夏至', next_term_name: '小暑', foods: ['苦瓜', '丝瓜', '绿豆', '冬瓜', '西瓜', '黄瓜', '西红柿'], health_tip: '清淡饮食，午休养神' },
  { term_name: '小暑', next_term_name: '大暑', foods: ['苦瓜', '冬瓜', '西瓜', '绿豆', '黄瓜', '茄子', '芹菜'], health_tip: '防暑降温，避免暴晒' },
  { term_name: '大暑', next_term_name: '立秋', foods: ['绿豆', '西瓜', '冬瓜', '苦瓜', '黄瓜', '薏米', '芹菜'], health_tip: '清热解暑，及时补水' },
  { term_name: '立秋', next_term_name: '处暑', foods: ['南瓜', '冬瓜', '丝瓜', '茄子', '黄瓜', '西红柿', '豆角'], health_tip: '滋阴润燥，少辛增酸' },
  { term_name: '处暑', next_term_name: '白露', foods: ['萝卜', '白菜', '冬瓜', '南瓜', '丝瓜', '西红柿', '黄瓜'], health_tip: '防秋燥，多喝水' },
  { term_name: '白露', next_term_name: '秋分', foods: ['梨', '苹果', '萝卜', '白菜', '冬瓜', '南瓜', '山药'], health_tip: '滋阴润肺，防秋凉' },
  { term_name: '秋分', next_term_name: '寒露', foods: ['萝卜', '白菜', '山药', '南瓜', '冬瓜', '土豆', '红薯'], health_tip: '阴阳平衡，少食寒凉' },
  { term_name: '寒露', next_term_name: '霜降', foods: ['萝卜', '白菜', '山药', '莲藕', '土豆', '红薯', '南瓜'], health_tip: '防寒保暖，养肺润燥' },
  { term_name: '霜降', next_term_name: '立冬', foods: ['萝卜', '白菜', '山药', '莲藕', '土豆', '红薯', '南瓜'], health_tip: '防寒保暖，适当进补' },
  { term_name: '立冬', next_term_name: '小雪', foods: ['萝卜', '白菜', '山药', '莲藕', '土豆', '红薯', '羊肉'], health_tip: '养肾藏精，早睡晚起' },
  { term_name: '小雪', next_term_name: '大雪', foods: ['萝卜', '白菜', '山药', '莲藕', '土豆', '红薯', '羊肉'], health_tip: '防寒保暖，温补为主' },
  { term_name: '大雪', next_term_name: '冬至', foods: ['萝卜', '白菜', '山药', '莲藕', '土豆', '羊肉', '牛肉'], health_tip: '温补助阳，防寒保暖' },
  { term_name: '冬至', next_term_name: '小寒', foods: ['萝卜', '白菜', '山药', '莲藕', '羊肉', '牛肉', '饺子'], health_tip: '养肾护阳，忌寒凉' },
];

export default function SeasonConfigPage() {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<SeasonConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editMap, setEditMap] = useState<Record<number, { foods: string; healthTip: string }>>();

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('display_season_config')
        .select('*')
        .order('id');
      if (error) throw error;

      let items: SeasonConfig[] = (data || []) as any[];
      if (items.length === 0) {
        const { data: inserted, error: insertErr } = await supabase
          .from('display_season_config')
          .insert(defaultTerms)
          .select();
        if (insertErr) {
          console.error('[SeasonConfigPage] insert default error:', insertErr);
          setMessage('初始化节气数据失败：' + (insertErr.message || '未知错误'));
          setLoading(false);
          return;
        }
        items = (inserted || []) as any[];
        if (items.length === 0) {
          setMessage('初始化节气数据失败：插入后未返回数据，请重启应用');
          setLoading(false);
          return;
        }
      }
      setConfigs(items);
      const map: Record<number, { foods: string; healthTip: string }> = {};
      items.forEach((item) => {
        map[item.id] = {
          foods: (item.foods || []).join('、'),
          healthTip: item.health_tip || '',
        };
      });
      setEditMap(map);
    } catch (e) {
      console.error('[SeasonConfigPage] fetch error:', e);
      const err = e as any;
      setMessage('加载数据失败' + (err?.message ? '：' + err.message : ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleSave = async (id: number) => {
    const edit = editMap[id];
    if (!edit) return;
    setSaving(true);
    setMessage('');
    try {
      const foods = edit.foods
        .split(/[、,，\s]+/)
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
      const { error } = await supabase
        .from('display_season_config')
        .update({ foods, health_tip: edit.healthTip, updated_at: nowBeijing() })
        .eq('id', id);
      if (error) throw error;
      setMessage('保存成功');
      setTimeout(() => setMessage(''), 2000);
      await fetchConfigs();
    } catch (e) {
      console.error('[SeasonConfigPage] save error:', e);
      const err = e as any;
      setMessage('保存失败' + (err?.message ? '：' + err.message : ''));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setMessage('');
    try {
      for (const item of configs) {
        const edit = editMap[item.id];
        if (!edit) continue;
        const foods = edit.foods
          .split(/[、,，\s]+/)
          .map((f) => f.trim())
          .filter((f) => f.length > 0);
        const { error } = await supabase
          .from('display_season_config')
          .update({ foods, health_tip: edit.healthTip, updated_at: nowBeijing() })
          .eq('id', item.id);
        if (error) throw error;
      }
      setMessage('全部保存成功');
      setTimeout(() => setMessage(''), 2000);
      await fetchConfigs();
    } catch (e) {
      console.error('[SeasonConfigPage] save all error:', e);
      const err = e as any;
      setMessage('全部保存失败' + (err?.message ? '：' + err.message : ''));
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (id: number, field: 'foods' | 'healthTip', value: string) => {
    setEditMap((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
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
            <h1 className="text-3xl font-semibold text-slate-900">时令节气配置</h1>
          </div>
          <p className="text-lg text-slate-500 mt-1">管理大屏时令节气展示内容，所有含时令节气的大屏将统一展示此处配置</p>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <span className={`text-lg ${message.includes('成功') ? 'text-emerald-600' : 'text-red-500'}`}>
              {message}
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-lg rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <i className={`${saving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'}`} />
            {saving ? '保存中...' : '保存全部'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <i className="ri-loader-4-line animate-spin mr-2" />
          加载中...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {configs.map((item) => (
            <div key={item.id} className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500/10">
                    <i className="ri-calendar-todo-line text-emerald-500 text-lg" />
                  </div>
                  <div>
                    <span className="text-lg font-semibold text-slate-900">{item.term_name}</span>
                    <span className="text-base text-slate-400 ml-1">→ {item.next_term_name}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSave(item.id)}
                  disabled={saving}
                  className="text-base text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded border border-emerald-200 hover:border-emerald-300 transition-colors cursor-pointer whitespace-nowrap"
                >
                  保存
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-base text-slate-500 mb-1">推荐食材（用顿号分隔）</label>
                  <input
                    type="text"
                    value={editMap[item.id]?.foods || ''}
                    onChange={(e) => handleInputChange(item.id, 'foods', e.target.value)}
                    className="w-full text-lg text-slate-700 border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    placeholder="如：萝卜、白菜、山药"
                  />
                </div>
                <div>
                  <label className="block text-base text-slate-500 mb-1">健康提示</label>
                  <input
                    type="text"
                    value={editMap[item.id]?.healthTip || ''}
                    onChange={(e) => handleInputChange(item.id, 'healthTip', e.target.value)}
                    className="w-full text-lg text-slate-700 border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    placeholder="如：防寒保暖，适当进补"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}