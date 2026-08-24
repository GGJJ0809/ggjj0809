import { useState, useEffect, useRef, useCallback } from 'react';
import { useScaleConfig } from '@/hooks/useScaleConfig';
import AICollectModal from './AICollectModal';
import {
  fetchRegisterMaterials,
  extractRegisterMaterials,
  oneMaterialRegister,
  batchRegister,
  fetchMaterialPics,
  extractMaterialPics,
  deleteMaterialPics,
  cleanRegisterModel,
  fetchThisWaitRegisterMaterials,
  type RegisterMaterialItem,
  type MaterialPicItem,
} from '@/services/scaleApi';

export default function AIMaterialRegisterPanel() {
  const { config, isConfigured } = useScaleConfig();

  // 列表
  const [registerFilter, setRegisterFilter] = useState<number>(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [materials, setMaterials] = useState<RegisterMaterialItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 选中
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // 操作状态
  const [operating, setOperating] = useState(false);
  const [opMsg, setOpMsg] = useState('');
  const [opOk, setOpOk] = useState(true);

  // 图片预览
  const [picMaterial, setPicMaterial] = useState<RegisterMaterialItem | null>(null);
  const [pics, setPics] = useState<MaterialPicItem[]>([]);
  const [picsLoading, setPicsLoading] = useState(false);
  const [picsError, setPicsError] = useState('');

  // 清空模型确认
  const [showCleanConfirm, setShowCleanConfirm] = useState(false);
  const [cleanReqId, setCleanReqId] = useState('');

  // 采集注册弹窗
  const [collectTarget, setCollectTarget] = useState<RegisterMaterialItem | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const pageSize = 15;

  const doSearch = useCallback(async (p: number = 1) => {
    if (!isConfigured) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetchRegisterMaterials(config, {
        current: p,
        size: pageSize,
        ifCount: 1,
        interfaceType: 'WEB',
        ifRegister: registerFilter === 0 ? undefined : registerFilter,
        materialInfo: searchKeyword.trim() || undefined,
      });
      const list = extractRegisterMaterials(resp);
      setMaterials(list);
      const t = (resp?.data as Record<string, unknown>)?.total as number ?? list.length;
      setTotal(t);
      setPage(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }, [config, isConfigured, registerFilter, searchKeyword]);

  useEffect(() => {
    doSearch(1);
  }, [doSearch]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === materials.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(materials.map((m) => m.materialId!).filter(Boolean) as number[]));
    }
  };

  // 单货品注册
  const handleSingleRegister = async (item: RegisterMaterialItem) => {
    if (!item.materialId) return;
    setOperating(true);
    setOpMsg('');
    try {
      const requestId = `reg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const resp = await oneMaterialRegister(config, {
        operation: 'NEW',
        requestId,
        materialList: [{ materialId: item.materialId, materialName: item.materialName }],
      });
      const code = (resp as Record<string, unknown>)?.code ?? (resp as Record<string, unknown>)?.status;
      if (code === 0 || code === 200 || code === '0' || code === '200') {
        setOpOk(true);
        setOpMsg(`「${item.materialName}」注册成功`);
        doSearch(page);
      } else {
        setOpOk(false);
        setOpMsg(String((resp as Record<string, unknown>)?.msg ?? '注册失败'));
      }
    } catch (e: unknown) {
      setOpOk(false);
      setOpMsg(e instanceof Error ? e.message : '注册失败');
    } finally {
      setOperating(false);
      setTimeout(() => setOpMsg(''), 3000);
    }
  };

  // 批量注册
  const handleBatchRegister = async () => {
    if (selectedIds.size === 0) return;
    setOperating(true);
    setOpMsg('');
    try {
      const requestId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const list = materials
        .filter((m) => m.materialId != null && selectedIds.has(m.materialId))
        .map((m) => ({ materialId: m.materialId, materialName: m.materialName }));
      const resp = await batchRegister(config, {
        operation: 'NEW',
        requestId,
        materialList: list,
      });
      const code = (resp as Record<string, unknown>)?.code ?? (resp as Record<string, unknown>)?.status;
      if (code === 0 || code === 200 || code === '0' || code === '200') {
        setOpOk(true);
        setOpMsg(`批量注册成功，共 ${list.length} 个货品`);
        setSelectedIds(new Set());
        doSearch(page);
      } else {
        setOpOk(false);
        setOpMsg(String((resp as Record<string, unknown>)?.msg ?? '批量注册失败'));
      }
    } catch (e: unknown) {
      setOpOk(false);
      setOpMsg(e instanceof Error ? e.message : '批量注册失败');
    } finally {
      setOperating(false);
      setTimeout(() => setOpMsg(''), 3000);
    }
  };

  // 查看货品图片
  const handleViewPics = async (item: RegisterMaterialItem) => {
    if (!item.materialId) return;
    setPicMaterial(item);
    setPicsLoading(true);
    setPics([]);
    setPicsError('');
    try {
      const resp = await fetchMaterialPics(config, item.materialId);
      const list = extractMaterialPics(resp);
      setPics(list);
      if (list.length === 0) {
        setPicsError('该货品暂无照片，请先在电子秤端拍照上传后再查看');
      }
    } catch (e: unknown) {
      setPics([]);
      setPicsError(e instanceof Error ? e.message : '查询货品图片失败');
    } finally {
      setPicsLoading(false);
    }
  };

  // 删除指定图片
  const handleDeletePic = async (pic: MaterialPicItem) => {
    if (!picMaterial?.materialId) return;
    const url = pic.imageUrl ?? pic.url;
    if (!url) return;
    setOperating(true);
    try {
      await deleteMaterialPics(config, picMaterial.materialId, {
        imageUrlList: [url],
      });
      setPics((prev) => prev.filter((p) => (p.imageUrl ?? p.url) !== url));
      setOpOk(true);
      setOpMsg('图片已删除');
    } catch (e: unknown) {
      setOpOk(false);
      setOpMsg(e instanceof Error ? e.message : '删除失败');
    } finally {
      setOperating(false);
      setTimeout(() => setOpMsg(''), 3000);
    }
  };

  // 删除全部图片
  const handleDeleteAllPics = async () => {
    if (!picMaterial?.materialId) return;
    if (!window.confirm(`确认删除「${picMaterial.materialName}」的全部图片？`)) return;
    setOperating(true);
    try {
      await deleteMaterialPics(config, picMaterial.materialId, { ifAllDelete: 1, ifDeleteModel: 2 });
      setPics([]);
      setOpOk(true);
      setOpMsg('全部图片已删除');
    } catch (e: unknown) {
      setOpOk(false);
      setOpMsg(e instanceof Error ? e.message : '删除失败');
    } finally {
      setOperating(false);
      setTimeout(() => setOpMsg(''), 3000);
    }
  };

  // 清空注册模型
  const handleCleanModel = async () => {
    if (!cleanReqId.trim()) return;
    setOperating(true);
    setOpMsg('');
    try {
      const resp = await cleanRegisterModel(config, { requestId: cleanReqId.trim() });
      const code = (resp as Record<string, unknown>)?.code ?? (resp as Record<string, unknown>)?.status;
      if (code === 0 || code === 200 || code === '0' || code === '200') {
        setOpOk(true);
        setOpMsg('注册模型已清空');
        setShowCleanConfirm(false);
        setCleanReqId('');
      } else {
        setOpOk(false);
        setOpMsg(String((resp as Record<string, unknown>)?.msg ?? '清空失败'));
      }
    } catch (e: unknown) {
      setOpOk(false);
      setOpMsg(e instanceof Error ? e.message : '清空失败');
    } finally {
      setOperating(false);
      setTimeout(() => setOpMsg(''), 3000);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const getRegLabel = (v: number | undefined) => {
    if (v === 1) return { label: '已注册', cls: 'text-emerald-600 bg-emerald-50', icon: 'ri-checkbox-circle-fill' };
    if (v === 2) return { label: '未注册', cls: 'text-amber-600 bg-amber-50', icon: 'ri-time-line' };
    return { label: '未知', cls: 'text-slate-400 bg-slate-100', icon: 'ri-question-line' };
  };

  return (
    <div className="bg-white rounded-2xl w-full flex flex-col max-h-[92vh]">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-50">
            <i className="ri-brain-line text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">AI 菜品注册管理</h3>
            <p className="text-xs text-slate-400">管理电子秤 AI 识别模型的货品注册状态</p>
          </div>
        </div>
      </div>

      {/* Operation message */}
      {opMsg && (
        <div className={`mx-6 mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
          opOk ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' : 'text-red-600 bg-red-50 border border-red-100'
        }`}>
          <i className={opOk ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
          {opMsg}
        </div>
      )}

      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-slate-50 flex-shrink-0 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-[200px] relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input
              ref={searchRef}
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch(1)}
              placeholder="搜索货品名称..."
              disabled={!isConfigured}
              className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {[
              { value: 0, label: '全部' },
              { value: 1, label: '已注册' },
              { value: 2, label: '未注册' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setRegisterFilter(opt.value); setSelectedIds(new Set()); }}
                className={`text-xs px-3 py-2 cursor-pointer whitespace-nowrap transition-colors ${
                  registerFilter === opt.value
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          {registerFilter === 2 && selectedIds.size > 0 && (
            <button
              type="button"
              onClick={handleBatchRegister}
              disabled={operating}
              className="flex items-center gap-1 text-xs bg-amber-500 text-white px-3 py-2 rounded-lg hover:bg-amber-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {operating ? <><i className="ri-loader-4-line animate-spin" /></> : <><i className="ri-upload-cloud-line" />批量注册（{selectedIds.size}）</>}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowCleanConfirm(true)}
            className="flex items-center gap-1 text-xs border border-red-200 text-red-500 px-2.5 py-2 rounded-lg hover:bg-red-50 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-delete-bin-line text-sm" />清空模型
          </button>
        </div>
      </div>

      {/* Clean model confirm dialog */}
      {showCleanConfirm && (
        <div className="mx-6 mt-3 bg-red-50 border border-red-100 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <i className="ri-error-warning-fill text-red-500" />
            <p className="text-sm font-semibold text-red-700">确认清空注册模型？</p>
          </div>
          <p className="text-xs text-red-600">此操作将清空所有 AI 识别模型的注册数据，清空后需重新注册货品。</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={cleanReqId}
              onChange={(e) => setCleanReqId(e.target.value)}
              placeholder="请输入 requestId（必填）"
              className="flex-1 text-sm border border-red-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-red-400"
            />
            <button
              type="button"
              onClick={handleCleanModel}
              disabled={operating || !cleanReqId.trim()}
              className="text-xs bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {operating ? '执行中...' : '确认清空'}
            </button>
            <button
              type="button"
              onClick={() => { setShowCleanConfirm(false); setCleanReqId(''); }}
              className="text-xs border border-red-200 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 cursor-pointer whitespace-nowrap"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Body: table + pic panel */}
      <div className="flex-1 overflow-hidden flex">
        {/* Material list */}
        <div className={`flex-1 overflow-y-auto px-6 py-3 ${picMaterial ? 'border-r border-slate-100' : ''}`}>
          {!isConfigured ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <p className="text-sm">电子秤未配置</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <i className="ri-loader-4-line animate-spin text-xl mr-2" />
              <span className="text-sm">加载中...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
              <i className="ri-error-warning-line" />{error}
            </div>
          ) : materials.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <p className="text-sm">暂无数据</p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-slate-400 mb-2">共 {total} 条，第 {page}/{totalPages} 页</p>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-50">
                    <th className="px-2 py-2 w-8">
                      <input type="checkbox" checked={materials.length > 0 && selectedIds.size === materials.length} onChange={toggleSelectAll} className="cursor-pointer" />
                    </th>
                    <th className="text-left text-xs text-slate-400 py-2">货品名称</th>
                    <th className="text-left text-xs text-slate-400 py-2">编码</th>
                    <th className="text-left text-xs text-slate-400 py-2">注册状态</th>
                    <th className="text-left text-xs text-slate-400 py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((item) => {
                    const reg = getRegLabel(item.ifRegister);
                    const mid = item.materialId ?? 0;
                    return (
                      <tr key={mid} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-2 py-2.5">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(mid)}
                            onChange={() => toggleSelect(mid)}
                            className="cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 text-sm text-slate-800">{item.materialName ?? '—'}</td>
                        <td className="py-2.5 text-xs text-slate-500 font-mono">{item.materialCode ?? item.barCode ?? '—'}</td>
                        <td className="py-2.5">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${reg.cls}`}>
                            <i className={`${reg.icon} text-xs`} />{reg.label}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-1">
                            {item.ifRegister !== 1 && (
                              <button
                                type="button"
                                onClick={() => setCollectTarget(item)}
                                disabled={operating}
                                className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg hover:bg-indigo-100 cursor-pointer whitespace-nowrap disabled:opacity-50"
                              >
                                <i className="ri-camera-line mr-1" />采集注册
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleViewPics(item)}
                              className="text-xs text-slate-500 border border-slate-200 px-2 py-1 rounded-lg hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                            >
                              <i className="ri-image-line mr-1" />图片
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 mt-4 pb-2">
                  <button type="button" onClick={() => doSearch(page - 1)} disabled={page <= 1}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                    <i className="ri-arrow-left-s-line text-sm" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 7) p = i + 1;
                    else if (page <= 4) p = i + 1;
                    else if (page >= totalPages - 3) p = totalPages - 6 + i;
                    else p = page - 3 + i;
                    return (
                      <button key={p} type="button" onClick={() => doSearch(p)}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs cursor-pointer whitespace-nowrap ${
                          p === page ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
                        }`}>{p}</button>
                    );
                  })}
                  <button type="button" onClick={() => doSearch(page + 1)} disabled={page >= totalPages}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                    <i className="ri-arrow-right-s-line text-sm" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pic panel */}
        {picMaterial && (
          <div className="w-80 flex-shrink-0 overflow-y-auto px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-slate-800 truncate">{picMaterial.materialName}</p>
                <p className="text-xs text-slate-400">货品图片</p>
              </div>
              <button
                type="button"
                onClick={() => { setPicMaterial(null); setPicsError(''); }}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <i className="ri-close-line text-slate-400" />
              </button>
            </div>

            {picsLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <i className="ri-loader-4-line animate-spin mr-2" />加载中...
              </div>
            ) : picsError ? (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                <i className="ri-error-warning-line" />{picsError}
              </div>
            ) : pics.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <i className="ri-image-line text-2xl mb-2" />
                <p className="text-xs">暂无图片</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pics.map((pic, idx) => {
                  const url = pic.imageUrl ?? pic.url ?? '';
                  return (
                    <div key={idx} className="relative group rounded-lg overflow-hidden border border-slate-100">
                      {url ? (
                        <img src={url} alt={`图片 ${idx + 1}`} className="w-full h-32 object-cover" />
                      ) : (
                        <div className="w-full h-32 bg-slate-100 flex items-center justify-center">
                          <i className="ri-image-line text-slate-300 text-2xl" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeletePic(pic)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="删除此图片"
                      >
                        <i className="ri-close-line text-xs" />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={handleDeleteAllPics}
                  className="w-full text-xs text-red-500 border border-red-200 rounded-lg py-1.5 hover:bg-red-50 cursor-pointer"
                >
                  <i className="ri-delete-bin-line mr-1" />删除全部图片
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI 采集注册弹窗 */}
      {collectTarget && collectTarget.materialId && (
        <AICollectModal
          materialId={collectTarget.materialId}
          materialName={collectTarget.materialName ?? ''}
          materialCode={collectTarget.materialCode}
          onClose={() => setCollectTarget(null)}
          onRegistered={() => {
            setCollectTarget(null);
            doSearch(page);
          }}
        />
      )}
    </div>
  );
}