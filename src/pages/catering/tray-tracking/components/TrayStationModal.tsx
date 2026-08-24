import { useState, useCallback } from 'react';

export interface StationFormData {
  id?: number;
  name: string;
  station_code: string;
  category: string;
  location: string;
  dish_name: string;
  tare_weight: string;
  capacity_max: string;
  sort_order: string;
  is_active: boolean;
  hw_enabled: boolean;
  hw_ip: string;
  hw_port: string;
  hw_sn: string;
  product_item_id: string;
}

interface CategoryOption {
  id: number;
  name: string;
}

interface DishOption {
  id: number;
  name: string;
  category: string;
}

interface Props {
  open: boolean;
  editing: boolean;
  formData: StationFormData;
  categories: CategoryOption[];
  dishes: DishOption[];
  formError: string;
  submitting: boolean;
  onClose: () => void;
  onChange: (data: StationFormData) => void;
  onSubmit: () => void;
}

export const defaultStationForm: StationFormData = {
  name: '',
  station_code: '',
  category: '',
  location: '',
  dish_name: '',
  tare_weight: '800',
  capacity_max: '60',
  sort_order: '0',
  is_active: true,
  hw_enabled: false,
  hw_ip: '',
  hw_port: '',
  hw_sn: '',
  product_item_id: '',
};

export default function TrayStationModal({
  open,
  editing,
  formData,
  categories,
  dishes,
  formError,
  submitting,
  onClose,
  onChange,
  onSubmit,
}: Props) {
  const [showHw, setShowHw] = useState(false);

  const update = useCallback(
    (partial: Partial<StationFormData>) => {
      onChange({ ...formData, ...partial });
    },
    [formData, onChange],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">
            {editing ? '编辑餐盘' : '新增餐盘'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="space-y-3">
          {/* 名称 + 编号 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                餐盘名称 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="例如：红烧肉盘"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                餐盘编号 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.station_code}
                onChange={(e) => update({ station_code: e.target.value })}
                placeholder="例如：TRY-001"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>

          {/* 分类 + 位置 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                分类 <span className="text-red-400">*</span>
              </label>
              {categories.length > 0 ? (
                <select
                  value={formData.category}
                  onChange={(e) => update({ category: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white"
                >
                  <option value="">请选择</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => update({ category: e.target.value })}
                  placeholder="例如：荤菜、素菜、主食"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                />
              )}
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">安装位置</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => update({ location: e.target.value })}
                placeholder="例如：1号窗口"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>

          {/* 菜品名 + 绑定菜品 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">菜品名称</label>
              <input
                type="text"
                value={formData.dish_name}
                onChange={(e) => update({ dish_name: e.target.value })}
                placeholder="例如：红烧肉"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">绑定菜品（可选）</label>
              <select
                value={formData.product_item_id}
                onChange={(e) => update({ product_item_id: e.target.value })}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white"
              >
                <option value="">不绑定</option>
                {dishes.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 皮重 + 容量 + 排序 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">皮重 (g)</label>
              <input
                type="number"
                value={formData.tare_weight}
                onChange={(e) => update({ tare_weight: e.target.value })}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">最大容量 (份)</label>
              <input
                type="number"
                value={formData.capacity_max}
                onChange={(e) => update({ capacity_max: e.target.value })}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">排序</label>
              <input
                type="number"
                value={formData.sort_order}
                onChange={(e) => update({ sort_order: e.target.value })}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>

          {/* 状态 + 硬件开关 */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                className={`w-9 h-5 rounded-full transition-all cursor-pointer flex items-center ${
                  formData.is_active ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
                onClick={() => update({ is_active: !formData.is_active })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    update({ is_active: !formData.is_active });
                  }
                }}
              >
                <div
                  className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all ml-0.5 ${
                    formData.is_active ? 'translate-x-3.5' : ''
                  }`}
                />
              </div>
              <span className="text-sm text-slate-700">启用</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                className={`w-9 h-5 rounded-full transition-all cursor-pointer flex items-center ${
                  formData.hw_enabled ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
                onClick={() => {
                  const next = !formData.hw_enabled;
                  update({ hw_enabled: next });
                  if (next) setShowHw(true);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    const next = !formData.hw_enabled;
                    update({ hw_enabled: next });
                    if (next) setShowHw(true);
                  }
                }}
              >
                <div
                  className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all ml-0.5 ${
                    formData.hw_enabled ? 'translate-x-3.5' : ''
                  }`}
                />
              </div>
              <span className="text-sm text-slate-700">硬件连接</span>
            </label>
          </div>

          {/* 硬件配置展开 */}
          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setShowHw(!showHw)}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer whitespace-nowrap"
            >
              <i className={`ri-${showHw ? 'arrow-up-s-line' : 'arrow-down-s-line'}`} />
              硬件配置（传感器）
              <span className="text-xs text-slate-400">（IP / 端口 / SN）</span>
            </button>
            {showHw && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">传感器 IP</label>
                  <input
                    type="text"
                    value={formData.hw_ip}
                    onChange={(e) => update({ hw_ip: e.target.value })}
                    placeholder="192.168.1.101"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">传感器端口</label>
                  <input
                    type="number"
                    value={formData.hw_port}
                    onChange={(e) => update({ hw_port: e.target.value })}
                    placeholder="8080"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">传感器 SN</label>
                  <input
                    type="text"
                    value={formData.hw_sn}
                    onChange={(e) => update({ hw_sn: e.target.value })}
                    placeholder="传感器序列号"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>
            )}
          </div>

          {formError && (
            <div className="flex items-center gap-1.5 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
              <i className="ri-error-warning-line" />
              {formError}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            {submitting ? (
              <>
                <i className="ri-loader-4-line animate-spin mr-1" />
                保存中...
              </>
            ) : editing ? (
              <>
                <i className="ri-save-line mr-1" />
                保存
              </>
            ) : (
              <>
                <i className="ri-add-line mr-1" />
                新增餐盘
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}