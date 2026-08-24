import { useState, useRef, useEffect } from 'react';
import type { DishCategory } from '../hooks/useDishes';
import { compressImage } from '@/lib/imageUtils';

interface AddDishForm {
  name: string;
  category_id: number;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
  method: string;
  nutrition: string;
  contraindications: string;
  taste: string;
  effect: string;
  status: 'active' | 'inactive';
}

interface Props {
  categories: DishCategory[];
  onClose: () => void;
  onAdd: (form: {
    name: string; category_id: number; status: string; price: number;
    calories: number; protein: number; fat: number; carbs: number; fiber: number;
    method: string; nutrition: string; contraindications: string;
    taste?: string; effect?: string;
    imgBase64?: string;
  }) => Promise<void>;
}

const HARDCODED_CATEGORIES = [
  '凉菜', '热菜', '炖煲', '蒸菜', '油炸', '海鲜', '肉食', '素菜', '汤品', '主食', '小吃',
];

export default function AddDishModal({ categories, onClose, onAdd }: Props) {
  const initDone = useRef(false);

  const [form, setForm] = useState<AddDishForm>(() => {
    const firstCatId = categories.length > 0 ? categories[0].id : 0;
    return {
      name: '', category_id: firstCatId,
      calories: '', protein: '', fat: '', carbs: '',
      method: '', nutrition: '', contraindications: '', taste: '', effect: '', status: 'active',
    };
  });

  const [imgBase64, setImgBase64] = useState('');
  const [imgPreview, setImgPreview] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof AddDishForm | 'submit', string>>>({});
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 只在数据首次加载完再修正一次初始值
  useEffect(() => {
    if (initDone.current) return;
    if (categories.length === 0) return;
    initDone.current = true;
    setForm((prev) => ({
      ...prev,
      category_id: prev.category_id > 0 ? prev.category_id : (categories[0]?.id ?? 0),
    }));
  }, [categories]);

  function set<K extends keyof AddDishForm>(key: K, val: AddDishForm[K]) {
    setForm((p) => ({ ...p, [key]: val }));
    setErrors((p) => ({ ...p, [key]: '' }));
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrors((p) => ({ ...p, submit: '图片大小不能超过 5MB' }));
      return;
    }
    try {
      const compressed = await compressImage(file, { maxWidth: 400, maxHeight: 400, quality: 0.75 });
      setImgBase64(compressed);
      setImgPreview(compressed);
      setErrors((p) => ({ ...p, submit: '' }));
    } catch {
      setErrors((p) => ({ ...p, submit: '图片处理失败，请重试' }));
    }
  }

  function handleRemoveImage() {
    setImgBase64('');
    setImgPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof AddDishForm, string>> = {};
    if (!form.name.trim()) errs.name = '请输入菜品名称';
    if (!form.calories || Number(form.calories) <= 0) errs.calories = '请输入热量';
    if (!form.category_id) errs.category_id = '请选择分类';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSaving(true);
    setErrors((p) => ({ ...p, submit: '' }));
    try {
      await onAdd({
        name: form.name.trim(),
        category_id: form.category_id,
        status: form.status,
        price: 0,
        calories: Number(form.calories) || 0,
        protein: Number(form.protein) || 0,
        fat: Number(form.fat) || 0,
        carbs: Number(form.carbs) || 0,
        fiber: 0,
        method: form.method,
        nutrition: form.nutrition,
        contraindications: form.contraindications,
        taste: form.taste,
        effect: form.effect,
        imgBase64: imgBase64 || undefined,
      });
      onClose();
    } catch (err) {
      setErrors((p) => ({
        ...p,
        submit: err instanceof Error ? err.message : '添加失败，请重试',
      }));
    } finally {
      setSaving(false);
    }
  }

  // 合并分类：优先用传入的 DB 分类，如果为空则用写死的
  const displayCategories = categories.length > 0
    ? categories
    : HARDCODED_CATEGORIES.map((name, i) => ({ id: i + 1, name, sort_order: i }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-[580px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">添加菜品</h3>
          <button
            type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer rounded-lg hover:bg-slate-100"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Error banner */}
          {errors.submit && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
              <i className="ri-error-warning-fill text-red-400 text-base flex-shrink-0" />
              <p className="text-sm text-red-600">{errors.submit}</p>
            </div>
          )}

          {/* Image upload */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">菜品图片</p>
            <div className="flex items-start gap-4">
              <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 overflow-hidden flex-shrink-0 bg-slate-50 flex items-center justify-center relative group">
                {imgPreview ? (
                  <>
                    <img src={imgPreview} alt="预览" className="w-full h-full object-cover object-top" />
                    <button
                      type="button" onClick={handleRemoveImage}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                    >
                      <i className="ri-delete-bin-line text-white text-xl" />
                    </button>
                  </>
                ) : (
                  <div className="text-center">
                    <i className="ri-image-add-line text-2xl text-slate-300 block" />
                    <span className="text-xs text-slate-400 mt-1 block">暂无图片</span>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                <button
                  type="button" onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-sm border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-upload-2-line" />
                  {imgPreview ? '更换图片' : '从本地上传'}
                </button>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  支持 JPG / PNG / WEBP，文件大小不超过 5MB。<br />
                  不上传时将自动匹配菜品图片。
                </p>
              </div>
            </div>
          </div>

          {/* Basic info */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">基本信息</p>
            <div className="grid grid-cols-2 gap-3">
              {/* 菜品名称 */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  菜品名称 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text" value={form.name} onChange={(e) => set('name', e.target.value)}
                  placeholder="请输入菜品名称"
                  className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 ${errors.name ? 'border-red-300' : 'border-slate-200'}`}
                />
                {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
              </div>

              {/* 分类 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  分类 <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.category_id}
                  onChange={(e) => set('category_id', Number(e.target.value))}
                  className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white cursor-pointer ${errors.category_id ? 'border-red-300' : 'border-slate-200'}`}
                >
                  <option value={0}>请选择分类</option>
                  {displayCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {errors.category_id && <p className="text-xs text-red-400 mt-1">{errors.category_id}</p>}
              </div>

              {/* 状态 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">上架状态</label>
                <div className="flex gap-2 mt-1.5">
                  {(['active', 'inactive'] as const).map((s) => (
                    <button
                      key={s} type="button" onClick={() => set('status', s)}
                      className={`flex-1 text-xs py-1.5 rounded-lg border cursor-pointer transition-colors whitespace-nowrap ${
                        form.status === s
                          ? s === 'active'
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-600'
                            : 'bg-slate-100 border-slate-300 text-slate-500'
                          : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {s === 'active' ? '上架中' : '已下架'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 热量 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  热量（kcal）<span className="text-red-400">*</span>
                </label>
                <input
                  type="number" min="0" value={form.calories}
                  onChange={(e) => set('calories', e.target.value)} placeholder="0"
                  className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 ${errors.calories ? 'border-red-300' : 'border-slate-200'}`}
                />
                {errors.calories && <p className="text-xs text-red-400 mt-1">{errors.calories}</p>}
              </div>
            </div>
          </div>

          {/* Nutrition */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">营养素</p>
            <div className="grid grid-cols-3 gap-3">
              {([
                { key: 'protein' as const, label: '蛋白质（g）' },
                { key: 'fat' as const, label: '脂肪（g）' },
                { key: 'carbs' as const, label: '碳水（g）' },
              ]).map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                  <input
                    type="number" min="0" step="0.1" value={form[key]}
                    onChange={(e) => set(key, e.target.value)} placeholder="0"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Detail fields */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">详细信息</p>
            <div className="space-y-3">
              {([
                { key: 'taste' as const, label: '口味标签', placeholder: '如：咸甜,浓香（逗号分隔多个口味）' },
                { key: 'effect' as const, label: '功效说明', placeholder: '如：补铁补血,增强体力（逗号分隔）' },
                { key: 'method' as const, label: '烹饪方法', placeholder: '描述烹饪步骤和方法...' },
                { key: 'nutrition' as const, label: '营养说明', placeholder: '描述营养特点...' },
                { key: 'contraindications' as const, label: '饮食禁忌', placeholder: '描述饮食禁忌人群...' },
              ]).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                  <textarea
                    rows={2} value={form[key]}
                    onChange={(e) => set(key, e.target.value)}
                    placeholder={placeholder} maxLength={500}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 resize-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button
            type="button" onClick={onClose}
            className="text-sm border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            取消
          </button>
          <button
            type="button" onClick={handleSubmit} disabled={saving}
            className="text-sm bg-emerald-500 text-white px-5 py-2 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-60 flex items-center gap-1.5"
          >
            {saving && <i className="ri-loader-4-line animate-spin" />}
            确认添加
          </button>
        </div>
      </div>
    </div>
  );
}