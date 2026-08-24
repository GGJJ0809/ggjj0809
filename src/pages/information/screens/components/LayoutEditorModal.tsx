import { useState, useEffect } from 'react';

interface Zone {
  id: string;
  name: string;
  heightRatio: number; // relative height weight, e.g. 3 = 3x, 1 = 1x
}

interface Props {
  screenName: string;
  resolution: string;
  initialZones: string[];
  onClose: () => void;
  onSave: (zones: string[]) => void;
}

const PRESET_ZONES = [
  '菜谱区', '公告区', 'Logo区', '日期区', '价格区',
  '滚动字幕区', '主内容区', '图片区', '二维码区', '欢迎区',
  '操作规范区', '提示区', '标题区', '正文区', '数据区',
];

const HEIGHT_OPTIONS = [
  { label: '小', value: 1 },
  { label: '中', value: 2 },
  { label: '大', value: 3 },
];

const COLOR_MAP: Record<number, string> = {
  0: 'rgba(52,211,153,0.15)',
  1: 'rgba(251,191,36,0.15)',
  2: 'rgba(167,139,250,0.15)',
  3: 'rgba(251,113,133,0.15)',
  4: 'rgba(96,165,250,0.15)',
};

export default function LayoutEditorModal({ screenName, resolution, initialZones, onClose, onSave }: Props) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [customName, setCustomName] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setZones(
      initialZones.map((z, i) => ({
        id: `zone-${i}-${Date.now()}`,
        name: z,
        heightRatio: i === 0 ? 3 : 1,
      }))
    );
  }, [initialZones]);

  const totalRatio = zones.reduce((s, z) => s + z.heightRatio, 0);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...zones];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setZones(next);
  };

  const moveDown = (index: number) => {
    if (index === zones.length - 1) return;
    const next = [...zones];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setZones(next);
  };

  const deleteZone = (id: string) => {
    setZones(zones.filter((z) => z.id !== id));
  };

  const addZone = (name: string) => {
    if (!name.trim()) return;
    setZones([...zones, { id: `zone-new-${Date.now()}`, name: name.trim(), heightRatio: 1 }]);
    setShowAddDropdown(false);
    setCustomName('');
  };

  const startEdit = (zone: Zone) => {
    setEditingId(zone.id);
    setEditingName(zone.name);
  };

  const confirmEdit = () => {
    if (!editingId) return;
    setZones(zones.map((z) => (z.id === editingId ? { ...z, name: editingName } : z)));
    setEditingId(null);
  };

  const setHeight = (id: string, ratio: number) => {
    setZones(zones.map((z) => (z.id === id ? { ...z, heightRatio: ratio } : z)));
  };

  const handleSave = () => {
    onSave(zones.map((z) => z.name));
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-800">编辑显示区域布局</h2>
            <p className="text-xs text-slate-400 mt-0.5">{screenName} · {resolution}</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer transition-colors">
            <i className="ri-close-line text-slate-500 text-lg" />
          </button>
        </div>

        <div className="flex gap-0 flex-1 overflow-hidden">
          {/* Left: Zone editor */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-100">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-50 flex-shrink-0">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">区域列表</p>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAddDropdown(!showAddDropdown)}
                  className="flex items-center gap-1 text-xs bg-emerald-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap transition-colors"
                >
                  <i className="ri-add-line" />添加区域
                </button>
                {showAddDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-100 rounded-xl z-10 overflow-hidden">
                    <div className="p-2 border-b border-slate-50">
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="自定义区域名称"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addZone(customName)}
                          className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-emerald-400"
                        />
                        <button type="button" onClick={() => addZone(customName)} className="text-xs bg-emerald-500 text-white px-2 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
                          添加
                        </button>
                      </div>
                    </div>
                    <div className="p-2 max-h-40 overflow-y-auto">
                      <p className="text-xs text-slate-400 mb-1.5 px-1">预设区域</p>
                      {PRESET_ZONES.filter((p) => !zones.some((z) => z.name === p)).map((preset) => (
                        <button key={preset} type="button" onClick={() => addZone(preset)}
                          className="w-full text-left text-xs text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {zones.length === 0 && (
                <div className="text-center text-slate-400 py-10">
                  <i className="ri-layout-line text-3xl block mb-2" />
                  <p className="text-sm">暂无区域，点击"添加区域"开始</p>
                </div>
              )}
              {zones.map((zone, index) => (
                <div key={zone.id} className="flex items-center gap-2 bg-slate-50 rounded-xl p-3 group">
                  {/* Order */}
                  <span className="text-xs font-bold text-slate-400 w-5 text-center flex-shrink-0">{index + 1}</span>

                  {/* Name / Edit */}
                  <div className="flex-1 min-w-0">
                    {editingId === zone.id ? (
                      <input
                        type="text"
                        value={editingName}
                        autoFocus
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={confirmEdit}
                        onKeyDown={(e) => e.key === 'Enter' && confirmEdit()}
                        className="w-full text-sm font-medium border border-emerald-400 rounded-lg px-2 py-0.5 outline-none bg-white"
                      />
                    ) : (
                      <p className="text-sm font-medium text-slate-700 truncate">{zone.name}</p>
                    )}
                  </div>

                  {/* Height selector */}
                  <div className="flex gap-1 flex-shrink-0">
                    {HEIGHT_OPTIONS.map((opt) => (
                      <button key={opt.value} type="button"
                        onClick={() => setHeight(zone.id, opt.value)}
                        className={`text-xs px-2 py-0.5 rounded-md cursor-pointer whitespace-nowrap transition-colors ${zone.heightRatio === opt.value ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-emerald-300'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 flex-shrink-0">
                    <button type="button" onClick={() => startEdit(zone)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white cursor-pointer transition-colors">
                      <i className="ri-pencil-line text-slate-400 text-sm" />
                    </button>
                    <button type="button" onClick={() => moveUp(index)} disabled={index === 0} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white cursor-pointer transition-colors disabled:opacity-30">
                      <i className="ri-arrow-up-s-line text-slate-400 text-sm" />
                    </button>
                    <button type="button" onClick={() => moveDown(index)} disabled={index === zones.length - 1} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white cursor-pointer transition-colors disabled:opacity-30">
                      <i className="ri-arrow-down-s-line text-slate-400 text-sm" />
                    </button>
                    <button type="button" onClick={() => deleteZone(zone.id)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-50 cursor-pointer transition-colors">
                      <i className="ri-delete-bin-line text-red-400 text-sm" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Preview */}
          <div className="w-64 flex flex-col flex-shrink-0">
            <div className="px-5 py-3 border-b border-slate-50">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">实时预览</p>
            </div>
            <div className="flex-1 p-4 flex flex-col">
              <div className="bg-slate-900 rounded-xl flex-1 p-3 flex flex-col gap-1.5 overflow-hidden" style={{ minHeight: 260 }}>
                {zones.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-slate-600 text-xs">暂无区域</div>
                ) : zones.map((zone, i) => (
                  <div
                    key={zone.id}
                    className="rounded-lg border border-slate-600 flex items-center justify-center text-xs font-medium text-slate-300 transition-all"
                    style={{
                      flex: zone.heightRatio,
                      background: COLOR_MAP[i % 5],
                    }}
                  >
                    {zone.name}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2 text-center">{resolution}</p>
              <div className="mt-3 space-y-1">
                <p className="text-xs text-slate-500 font-medium">区域比例说明</p>
                {zones.map((z, i) => (
                  <div key={z.id} className="flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: COLOR_MAP[i % 5].replace('0.15', '0.7') }} />
                      {z.name}
                    </span>
                    <span className="text-slate-400">{Math.round((z.heightRatio / totalRatio) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <p className="text-xs text-slate-400">共 {zones.length} 个显示区域</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="text-sm border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap transition-colors">
              取消
            </button>
            <button type="button" onClick={handleSave}
              className={`text-sm px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap transition-colors ${saved ? 'bg-emerald-400 text-white' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}>
              {saved ? <><i className="ri-check-line mr-1" />已保存</> : '保存布局'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}