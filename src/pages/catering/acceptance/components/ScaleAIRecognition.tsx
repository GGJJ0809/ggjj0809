import { useState, useEffect, useRef, useCallback } from 'react';
import { useScaleAI, type AIRecognitionResult } from '../hooks/useScaleAI';

interface Props {
  onApply?: (result: AIRecognitionResult) => void;
  onClose: () => void;
}

const confidenceColor = (v: number) => {
  if (v >= 80) return { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', dot: 'bg-emerald-400' };
  if (v >= 50) return { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-400', dot: 'bg-amber-300' };
  return { bg: 'bg-slate-50', text: 'text-slate-500', bar: 'bg-slate-300', dot: 'bg-slate-200' };
};

const matchTypeLabel: Record<string, string> = {
  exact: '精确匹配',
  range: '范围匹配',
  fuzzy: '模糊匹配',
  ambiguous: '低置信度',
};

export default function ScaleAIRecognition({ onApply, onClose }: Props) {
  const {
    weight, setWeight, weightUnit, setWeightUnit,
    category, setCategory, keyword, setKeyword,
    result, recognizing, error, setError,
    recognize, reset,
  } = useScaleAI();

  const [mode, setMode] = useState<'input' | 'results'>('input');
  const weightInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    weightInputRef.current?.focus();
  }, []);

  const handleRecognize = async () => {
    await recognize();
    setMode('results');
  };

  const handleApply = useCallback((r: AIRecognitionResult) => {
    onApply?.(r);
    onClose();
  }, [onApply, onClose]);

  const handleReset = () => {
    reset();
    setMode('input');
    setTimeout(() => weightInputRef.current?.focus(), 100);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-xl flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-50">
              <i className="ri-brain-line text-amber-600 text-base" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">AI 菜品识别</h3>
              <p className="text-xs text-slate-400">基于重量智能匹配食材</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"
          >
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {mode === 'input' && (
            <div className="p-6 space-y-5">
              {/* 重量输入 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">
                  <i className="ri-scales-line mr-1 text-slate-400" />
                  食材重量 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      ref={weightInputRef}
                      type="number"
                      min="0"
                      step="0.1"
                      value={weight}
                      onChange={(e) => { setWeight(e.target.value); setError(null); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleRecognize()}
                      placeholder={weightUnit === 'g' ? '输入克数，如：1500' : '输入千克数，如：1.5'}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 pr-14 focus:outline-none focus:border-slate-400 text-lg font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">
                      {weightUnit}
                    </span>
                  </div>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                    {[
                      { value: 'g', label: '克' },
                      { value: 'kg', label: 'kg' },
                      { value: '斤', label: '斤' },
                    ].map((u) => (
                      <button
                        key={u.value}
                        type="button"
                        onClick={() => setWeightUnit(u.value)}
                        className={`text-xs px-3 py-2.5 cursor-pointer whitespace-nowrap transition-colors ${
                          weightUnit === u.value
                            ? 'bg-slate-800 text-white'
                            : 'bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {u.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[100, 250, 500, 1000, 1500, 2500, 5000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => { setWeight(String(preset)); setError(null); }}
                      className={`text-xs px-2 py-1 rounded-full border cursor-pointer whitespace-nowrap transition-colors ${
                        String(preset) === weight
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {preset >= 1000 ? `${preset / 1000}kg` : `${preset}g`}
                    </button>
                  ))}
                </div>
              </div>

              {/* 可选的辅助信息 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    <i className="ri-folder-3-line mr-1 text-slate-400" />
                    分类提示 <span className="text-slate-400 font-normal">（可选）</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white cursor-pointer"
                  >
                    <option value="">不限分类</option>
                    <option value="蔬菜">蔬菜</option>
                    <option value="猪肉">猪肉</option>
                    <option value="禽肉">禽肉</option>
                    <option value="牛肉">牛肉</option>
                    <option value="羊肉">羊肉</option>
                    <option value="水产">水产</option>
                    <option value="蛋奶">蛋奶</option>
                    <option value="豆制品">豆制品</option>
                    <option value="主食">主食</option>
                    <option value="调料">调料</option>
                    <option value="水果">水果</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    <i className="ri-keyboard-line mr-1 text-slate-400" />
                    关键词 <span className="text-slate-400 font-normal">（可选）</span>
                  </label>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="如：猪肉、鸡蛋..."
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                  <i className="ri-error-warning-line" />
                  {error}
                </div>
              )}

              {/* 知识库提示 */}
              <div className="flex gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">
                <i className="ri-information-line text-slate-400 text-sm flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500 leading-relaxed">
                  将食材放置在电子秤上，输入称得的重量，AI 将自动匹配最可能的食材。支持蔬菜、肉类、水产、蛋奶、调料等 70+ 种常见食堂食材的智能识别。
                </p>
              </div>
            </div>
          )}

          {mode === 'results' && result && (
            <div className="p-6 space-y-4">
              {/* 重量回显 */}
              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-50">
                    <i className="ri-scales-line text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">称重结果</p>
                    <p className="text-lg font-bold text-slate-800">{result.weightDisplay}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-white cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-refresh-line mr-1" />重新识别
                </button>
              </div>

              {/* 结果 */}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">
                  识别结果（共匹配 {result.totalMatches} 种食材）
                  {result.isAmbiguous && <span className="ml-2 text-amber-500">— 匹配度较低，建议核对</span>}
                </p>
                <div className="space-y-2">
                  {result.results.map((r, idx) => {
                    const cc = confidenceColor(r.confidence);
                    const isTop = idx === 0;
                    return (
                      <button
                        key={`${r.name}-${idx}`}
                        type="button"
                        onClick={() => handleApply(r)}
                        className={`w-full text-left rounded-xl border p-4 cursor-pointer transition-colors ${
                          isTop
                            ? 'border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50'
                            : 'border-slate-100 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {isTop && (
                              <span className="w-5 h-5 flex items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold">
                                1
                              </span>
                            )}
                            <span className={`text-sm font-semibold ${isTop ? 'text-emerald-800' : 'text-slate-700'}`}>
                              {r.name}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${cc.bg} ${cc.text}`}>
                              {r.category}
                            </span>
                          </div>
                          <span className={`text-xs ${cc.text} font-medium`}>
                            {matchTypeLabel[r.matchType]}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${cc.bar} transition-all duration-500`}
                              style={{ width: `${Math.min(100, r.confidence)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-bold ${cc.text} w-10 text-right`}>
                            {r.confidence}%
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 leading-relaxed">
                          <i className="ri-information-line mr-1" />
                          {r.detail}
                        </p>

                        {isTop && (
                          <div className="mt-3 flex items-center gap-1 text-xs text-emerald-600">
                            <i className="ri-arrow-left-line" />
                            <span>点击此项可应用到验收记录</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <p className="text-xs text-slate-400">
            已覆盖蔬菜、肉类、水产、调料等 70+ 食材
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              {mode === 'results' ? '关闭' : '取消'}
            </button>
            {mode === 'input' && (
              <button
                type="button"
                onClick={handleRecognize}
                disabled={recognizing || !weight.trim()}
                className="flex items-center gap-1.5 text-sm bg-amber-500 text-white rounded-lg px-5 py-2 hover:bg-amber-600 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {recognizing ? (
                  <><i className="ri-loader-4-line animate-spin" />识别中...</>
                ) : (
                  <><i className="ri-brain-line" />开始识别</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}