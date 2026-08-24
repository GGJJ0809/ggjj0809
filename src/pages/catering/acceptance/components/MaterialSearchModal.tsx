import { useState, useEffect, useRef, useCallback } from 'react';
import { useScaleConfig } from '@/hooks/useScaleConfig';
import {
  fetchMaterialPage,
  extractMaterialPage,
  getMaterialSearchName,
  fetchTopCategories,
  extractTopCategories,
  getTopCategoryName,
  getTopCategoryId,
  addMaterial,
  type MaterialSearchItem,
  type TopCategoryItem,
  type AddMaterialParams,
} from '@/services/scaleApi';

interface Props {
  onSelect: (material: MaterialSearchItem) => void;
  onClose: () => void;
}

export default function MaterialSearchModal({ onSelect, onClose }: Props) {
  const { config, isConfigured } = useScaleConfig();

  const [keyword, setKeyword] = useState('');
  const [materialType, setMaterialType] = useState<number | undefined>(undefined);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<MaterialSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [categories, setCategories] = useState<TopCategoryItem[]>([]);
  const [catsLoading, setCatsLoading] = useState(false);

  // 新增货品子表单
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ materialName: '', categoryId: '', unitId: '', unitPrice: '', barCode: '' });
  const [addMaterialType, setAddMaterialType] = useState(1);
  const [addSalesMode, setAddSalesMode] = useState(2);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const searchRef = useRef<HTMLInputElement>(null);
  const pageSize = 15;

  // 加载前10大类
  useEffect(() => {
    if (!isConfigured) return;
    setCatsLoading(true);
    fetchTopCategories(config)
      .then((resp) => {
        const list = extractTopCategories(resp);
        setCategories(list);
      })
      .catch(() => { /* 大类加载失败不影响搜索 */ })
      .finally(() => setCatsLoading(false));
  }, [config, isConfigured]);

  // 自动聚焦
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (p: number = 1) => {
    if (!isConfigured) {
      setError('电子秤未配置，请先在「配置」中填写连接信息');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const resp = await fetchMaterialPage(config, {
        current: p,
        size: pageSize,
        ifCount: 1,
        materialInfo: keyword.trim() || undefined,
        materialType,
        categoryIdList: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
      });
      const pageData = extractMaterialPage(resp);
      setResults(pageData.records ?? []);
      setTotal(pageData.total ?? 0);
      setPage(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '查询失败');
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [config, isConfigured, keyword, materialType, selectedCategoryIds]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch(1);
    }
  };

  const toggleCategory = (id: number | undefined) => {
    if (id == null) return;
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 新增货品
  const handleAddMaterial = async () => {
    if (!addForm.materialName.trim()) { setAddError('请输入货品名称'); return; }
    if (!addForm.categoryId) { setAddError('请选择类别'); return; }
    if (!addForm.unitId) { setAddError('请输入单位ID'); return; }

    const params: AddMaterialParams = {
      materialName: addForm.materialName.trim(),
      materialType: addMaterialType,
      categoryId: Number(addForm.categoryId),
      salesMode: addSalesMode,
      unitId: Number(addForm.unitId),
    };
    if (addForm.unitPrice.trim()) params.unitPrice = Number(addForm.unitPrice);
    if (addForm.barCode.trim()) params.barCode = addForm.barCode.trim();

    setAdding(true);
    setAddError('');
    try {
      const resp = await addMaterial(config, params);
      const code = (resp as Record<string, unknown>)?.code ?? (resp as Record<string, unknown>)?.status;
      if (code === 0 || code === 200 || code === '0' || code === '200') {
        // 成功后关闭新增表单并刷新列表
        setShowAddForm(false);
        setAddForm({ materialName: '', categoryId: '', unitId: '', unitPrice: '', barCode: '' });
        // 尝试把新增的货品搜出来
        setKeyword(params.materialName);
        // 延迟搜索，等 keyword 更新
        setTimeout(() => doSearch(1), 100);
      } else {
        setAddError(String((resp as Record<string, unknown>)?.msg ?? '新增失败'));
      }
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : '新增失败');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100">
              <i className="ri-search-line text-slate-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">搜索 DRP 货品</h3>
              <p className="text-xs text-slate-400">按名称、编码、条码搜索货品</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-6 py-4 border-b border-slate-50 flex-shrink-0 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
              <input
                ref={searchRef}
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isConfigured ? '输入货品名称、编码、条码、首字母…' : '请先在「配置」中填写电子秤连接信息'}
                disabled={!isConfigured}
                className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
              />
            </div>
            <button
              type="button"
              onClick={() => doSearch(1)}
              disabled={loading || !isConfigured}
              className="flex items-center gap-1.5 text-sm bg-slate-800 text-white px-4 py-2.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <><i className="ri-loader-4-line animate-spin" /></> : <><i className="ri-search-line" />搜索</>}
            </button>
          </div>

          {/* Filters row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Material type */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {[
                { value: undefined, label: '全部类型' },
                { value: 1, label: '原料' },
                { value: 2, label: '商品' },
              ].map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => setMaterialType(opt.value)}
                  className={`text-xs px-2.5 py-1 cursor-pointer whitespace-nowrap transition-colors ${
                    materialType === opt.value
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Category chips */}
            {catsLoading ? (
              <span className="text-xs text-slate-400"><i className="ri-loader-4-line animate-spin mr-1" />加载分类...</span>
            ) : categories.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {categories.map((cat) => {
                  const id = getTopCategoryId(cat);
                  const name = getTopCategoryName(cat);
                  const selected = id != null && selectedCategoryIds.includes(id);
                  return (
                    <button
                      key={id ?? name}
                      type="button"
                      onClick={() => toggleCategory(id)}
                      className={`text-xs px-2 py-1 rounded-full border cursor-pointer whitespace-nowrap transition-colors ${
                        selected
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Add material button */}
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${
                showAddForm
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}
            >
              <i className={`${showAddForm ? 'ri-subtract-line' : 'ri-add-line'} text-sm`} />
              {showAddForm ? '收起' : '新增货品'}
            </button>
          </div>

          {/* Add material form */}
          {showAddForm && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                <i className="ri-add-circle-line" />新增 DRP 货品
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">货品名称 <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={addForm.materialName}
                    onChange={(e) => { setAddForm((p) => ({ ...p, materialName: e.target.value })); setAddError(''); }}
                    placeholder="如：猪里脊肉"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">类别 ID <span className="text-red-400">*</span></label>
                  <input
                    type="number"
                    value={addForm.categoryId}
                    onChange={(e) => { setAddForm((p) => ({ ...p, categoryId: e.target.value })); setAddError(''); }}
                    placeholder="如：101"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">单位 ID <span className="text-red-400">*</span></label>
                  <input
                    type="number"
                    value={addForm.unitId}
                    onChange={(e) => { setAddForm((p) => ({ ...p, unitId: e.target.value })); setAddError(''); }}
                    placeholder="如：1"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">进价（可选）</label>
                  <input
                    type="number"
                    value={addForm.unitPrice}
                    onChange={(e) => { setAddForm((p) => ({ ...p, unitPrice: e.target.value })); setAddError(''); }}
                    placeholder="0"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">条码（可选）</label>
                  <input
                    type="text"
                    value={addForm.barCode}
                    onChange={(e) => { setAddForm((p) => ({ ...p, barCode: e.target.value })); setAddError(''); }}
                    placeholder="如：6901234567890"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 mb-1 block">货品类型</label>
                    <select
                      value={addMaterialType}
                      onChange={(e) => setAddMaterialType(Number(e.target.value))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none cursor-pointer"
                    >
                      <option value={1}>原料</option>
                      <option value={2}>商品</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 mb-1 block">计量类型</label>
                    <select
                      value={addSalesMode}
                      onChange={(e) => setAddSalesMode(Number(e.target.value))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none cursor-pointer"
                    >
                      <option value={1}>按份</option>
                      <option value={2}>称重</option>
                    </select>
                  </div>
                </div>
              </div>
              {addError && (
                <p className="text-xs text-red-500 flex items-center gap-1"><i className="ri-error-warning-line" />{addError}</p>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAddMaterial}
                  disabled={adding}
                  className="flex items-center gap-1 text-xs bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  {adding ? <><i className="ri-loader-4-line animate-spin" />提交中...</> : <><i className="ri-check-line" />确认新增</>}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 mb-3">
              <i className="ri-error-warning-line" />
              {error}
            </div>
          )}

          {!isConfigured ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-100 mb-3">
                <i className="ri-plug-line text-xl" />
              </div>
              <p className="text-sm">电子秤未配置</p>
              <p className="text-xs mt-1">请先在工具栏「配置」中填写 DRP 连接信息</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <i className="ri-loader-4-line animate-spin text-xl mr-2" />
              <span className="text-sm">搜索中...</span>
            </div>
          ) : results.length === 0 && keyword ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-100 mb-3">
                <i className="ri-file-search-line text-xl" />
              </div>
              <p className="text-sm">未找到匹配的货品</p>
              <p className="text-xs mt-1">试试修改关键词，或点击「新增货品」手动添加</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-100 mb-3">
                <i className="ri-search-line text-xl" />
              </div>
              <p className="text-sm">输入关键词搜索 DRP 货品</p>
              <p className="text-xs mt-1">可按名称、编码、条码、首字母搜索</p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-slate-400 mb-2">共 {total} 条结果，当前第 {page}/{totalPages} 页</p>
              <div className="space-y-1.5">
                {results.map((item, idx) => (
                  <button
                    key={item.materialId ?? idx}
                    type="button"
                    onClick={() => onSelect(item)}
                    className="w-full flex items-center justify-between text-left px-4 py-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 hover:border-slate-200 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 flex-shrink-0">
                        <i className="ri-box-3-line text-slate-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{getMaterialSearchName(item)}</p>
                        <p className="text-xs text-slate-400">
                          {item.materialCode && <span className="mr-3">编码：{item.materialCode}</span>}
                          {item.barCode && <span className="mr-3">条码：{item.barCode}</span>}
                          {item.categoryName && <span>{item.categoryName}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      {item.unitName && (
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {item.unitName}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                        item.materialType === 1
                          ? 'text-amber-600 bg-amber-50'
                          : 'text-sky-600 bg-sky-50'
                      }`}>
                        {item.materialType === 1 ? '原料' : '商品'}
                      </span>
                      <i className="ri-arrow-right-s-line text-slate-300" />
                    </div>
                  </button>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 mt-4 pb-2">
                  <button
                    type="button"
                    onClick={() => doSearch(page - 1)}
                    disabled={page <= 1}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <i className="ri-arrow-left-s-line text-sm" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (page <= 4) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 3) {
                      pageNum = totalPages - 6 + i;
                    } else {
                      pageNum = page - 3 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => doSearch(pageNum)}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs cursor-pointer whitespace-nowrap ${
                          pageNum === page
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => doSearch(page + 1)}
                    disabled={page >= totalPages}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <i className="ri-arrow-right-s-line text-sm" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <p className="text-xs text-slate-400">点击货品即可带入到验收记录</p>
          <button
            type="button"
            onClick={onClose}
            className="text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}