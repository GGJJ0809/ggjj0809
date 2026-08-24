import { useState, useRef, useEffect } from 'react';
import type { KeepUser, CreateKeepUserInput, EditKeepUserInput } from '../hooks/useKeepUsers';

interface Props {
  users: KeepUser[];
  loading: boolean;
  error: string | null;
  onSearch: (keyword: string) => void;
  onCreate: (input: CreateKeepUserInput) => Promise<KeepUser>;
  onUpdate: (id: number, input: EditKeepUserInput) => Promise<KeepUser>;
  onDelete: (id: number) => Promise<void>;
  onUploadImage: (base64: string) => Promise<string>;
  onCheckLoginName: (loginName: string) => Promise<boolean>;
  onClose: () => void;
}

type Tab = 'manage' | 'add';

function resolvePhotoUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/keep-uploads/')) return `http://localhost:8081${url}`;
  return url;
}

export default function KeepStaffModal(props: Props) {
  const { users, loading, error, onSearch, onCreate, onUpdate, onDelete, onUploadImage, onCheckLoginName, onClose } = props;

  const [tab, setTab] = useState<Tab>('manage');
  const [searchKeyword, setSearchKeyword] = useState('');

  // ─── 列表状态 ───
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ─── 编辑表单状态 ───
  const [editNickName, setEditNickName] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editNum, setEditNum] = useState('');
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ─── 录入表单状态 ───
  const [addLoginName, setAddLoginName] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addNickName, setAddNickName] = useState('');
  const [addPosition, setAddPosition] = useState('');
  const [addNum, setAddNum] = useState('');
  const [addIsAdmin, setAddIsAdmin] = useState(false);
  const [addImage, setAddImage] = useState('');
  const [addPhotoPreview, setAddPhotoPreview] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addCheckingName, setAddCheckingName] = useState(false);
  const [addErrors, setAddErrors] = useState<{ loginName?: string; password?: string; nickName?: string; num?: string }>();
  const addFileRef = useRef<HTMLInputElement>(null);

  // ─── 编辑详情 ───
  const [detailUser, setDetailUser] = useState<KeepUser | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSearch = () => {
    onSearch(searchKeyword.trim());
  };

  const handleSearchClear = () => {
    setSearchKeyword('');
    onSearch('');
  };

  const startEdit = (user: KeepUser) => {
    setEditingId(user.id);
    setEditNickName(user.nick_name || '');
    setEditPosition(user.position || '');
    setEditNum(user.num || '');
    setEditIsAdmin(user.is_admin === 1);
    setEditPassword('');
    setEditImage(user.image || '');
    setDetailUser(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const submitEdit = async () => {
    if (editingId === null) return;
    setEditSaving(true);
    try {
      const input: EditKeepUserInput = {};
      input.nick_name = editNickName.trim();
      input.position = editPosition.trim();
      input.num = editNum.trim();
      input.is_admin = editIsAdmin;
      if (editPassword.trim()) input.password = editPassword.trim();
      if (editImage) input.image = editImage;
      await onUpdate(editingId, input);
      showToast('success', '人员信息已更新');
      cancelEdit();
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : '更新失败');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await onDelete(id);
      showToast('success', '人员已删除');
      setDeleteConfirmId(null);
      if (editingId === id) cancelEdit();
      if (detailUser?.id === id) setDetailUser(null);
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleUnbindFace = async (user: KeepUser) => {
    try {
      await onUpdate(user.id, { face_token: '' });
      showToast('success', `已解除「${user.login_name}」的人脸绑定`);
      setDetailUser(null);
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : '解除人脸绑定失败');
    }
  };

  // ─── 图片上传处理 ───
  const handleAddPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setAddPhotoPreview(base64);
      try {
        const url = await onUploadImage(base64);
        setAddImage(url);
        showToast('success', '照片已上传');
      } catch {
        showToast('error', '照片上传失败，将使用 base64 存储');
        setAddImage(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const clearAddError = (field: 'loginName' | 'password' | 'nickName' | 'num') => {
    setAddErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validateAddForm = () => {
    const errs: typeof addErrors = {};
    if (!addLoginName.trim()) errs.loginName = '登录名不能为空';
    if (!addPassword) errs.password = '密码不能为空';
    else if (addPassword.length < 6) errs.password = '密码不能少于6位';
    if (!addNickName.trim()) errs.nickName = '昵称不能为空';
    if (!addNum.trim()) errs.num = '编号不能为空';
    return errs;
  };

  const handleLoginNameBlur = async () => {
    const name = addLoginName.trim();
    if (!name) return;
    setAddCheckingName(true);
    try {
      const exists = await onCheckLoginName(name);
      if (exists) {
        setAddErrors((prev) => ({ ...prev, loginName: `登录名「${name}」已存在` }));
      }
    } catch {
      // 忽略，提交时后端会兜底查重
    } finally {
      setAddCheckingName(false);
    }
  };

  const handleAddSubmit = async () => {
    const errs = validateAddForm();
    setAddErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setAddSaving(true);
    try {
      await onCreate({
        login_name: addLoginName.trim(),
        password: addPassword.trim(),
        nick_name: addNickName.trim(),
        is_admin: addIsAdmin,
        image: addImage || undefined,
        position: addPosition.trim() || undefined,
        num: addNum.trim(),
      });
      showToast('success', `人员「${addLoginName.trim()}」已添加`);
      // 重置表单
      setAddLoginName(''); setAddPassword(''); setAddNickName('');
      setAddPosition(''); setAddNum(''); setAddIsAdmin(false);
      setAddImage(''); setAddPhotoPreview('');
      setAddErrors({});
      if (addFileRef.current) addFileRef.current.value = '';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '添加失败';
      if (msg.includes('已存在')) {
        setAddErrors((prev) => ({ ...prev, loginName: msg }));
      }
      showToast('error', msg);
    } finally {
      setAddSaving(false);
    }
  };

  const editUser = editingId !== null ? users.find((u) => u.id === editingId) : null;

  const inputClass = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white';
  const addFieldClass = (hasError?: string) => `w-full text-sm border rounded-lg px-3 py-2 focus:outline-none bg-white ${hasError ? 'border-red-400 focus:border-red-400' : 'border-slate-200 focus:border-slate-400'}`;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-slate-800">留样柜人员管理</h3>
            <p className="text-xs text-slate-400 mt-0.5">管理留样柜设备的登录人员信息</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-slate-50 flex-shrink-0">
          <button
            type="button"
            onClick={() => { setTab('manage'); setDetailUser(null); cancelEdit(); }}
            className={`text-xs px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${tab === 'manage' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            <i className="ri-team-line mr-1" />人员管理
          </button>
          <button
            type="button"
            onClick={() => { setTab('add'); setDetailUser(null); cancelEdit(); }}
            className={`text-xs px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${tab === 'add' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            <i className="ri-user-add-line mr-1" />人员录入
          </button>
          {users.length > 0 && (
            <span className="ml-auto text-xs text-slate-400">{users.length} 人</span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'manage' ? (
            <div>
              {/* Search bar */}
              <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-50">
                <div className="flex items-center gap-2 flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <i className="ri-search-line text-slate-400 text-xs" />
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                    placeholder="搜索登录名、昵称、职位或编号"
                    className="text-xs bg-transparent focus:outline-none text-slate-700 flex-1"
                  />
                  {searchKeyword && (
                    <button type="button" onClick={handleSearchClear} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                      <i className="ri-close-circle-line text-xs" />
                    </button>
                  )}
                </div>
                <button type="button" onClick={handleSearch} className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                  搜索
                </button>
              </div>

              {/* User list */}
              <div className="overflow-x-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-slate-400">
                    <i className="ri-loader-4-line animate-spin text-xl mr-2" />
                    <span className="text-sm">加载中...</span>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <i className="ri-error-warning-line text-2xl text-red-400" />
                    <p className="text-sm text-red-500">{error}</p>
                    <button type="button" onClick={() => onSearch(searchKeyword.trim())} className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer">重试</button>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-50">
                        {['编号', '登录名', '昵称', '职位', '角色', '人脸', '创建时间', '操作'].map((h) => (
                          <th key={h} className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${editingId === u.id ? 'bg-amber-50' : ''}`}>
                          <td className="px-4 py-3 text-xs font-mono text-slate-500">{u.num || '—'}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-800">{u.login_name}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{u.nick_name || '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{u.position || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_admin === 1 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
                              {u.is_admin === 1 ? '管理员' : '操作员'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {u.face_token ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap">已录脸</span>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                            {new Date(u.created_at).toLocaleDateString('zh-CN')}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => setDetailUser(u)}
                                className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 cursor-pointer" title="详情">
                                <i className="ri-information-line text-slate-500 text-sm" />
                              </button>
                              <button type="button" onClick={() => startEdit(u)}
                                className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 cursor-pointer" title="编辑">
                                <i className="ri-edit-line text-slate-500 text-sm" />
                              </button>
                              <button type="button" onClick={() => setDeleteConfirmId(u.id)}
                                className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 cursor-pointer" title="删除">
                                <i className="ri-delete-bin-line text-red-400 text-sm" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && !loading && !error && (
                        <tr>
                          <td colSpan={8} className="py-16 text-center">
                            <div className="flex flex-col items-center gap-3 text-slate-400">
                              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100">
                                <i className="ri-user-add-line text-2xl" />
                              </div>
                              <p className="text-sm font-medium text-slate-500">暂无人员</p>
                              <p className="text-xs">切换到「人员录入」添加留样柜操作人员</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Edit panel */}
              {editingId !== null && editUser && (
                <div className="px-6 py-4 border-t border-slate-100 bg-amber-50/30">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-700">
                      编辑人员：{editUser.login_name}
                    </h4>
                    <button type="button" onClick={cancelEdit} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer">取消</button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">昵称</label>
                      <input type="text" value={editNickName} onChange={(e) => setEditNickName(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">职位</label>
                      <input type="text" value={editPosition} onChange={(e) => setEditPosition(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">编号</label>
                      <input type="text" value={editNum} onChange={(e) => setEditNum(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">新密码（留空不修改）</label>
                      <input type="text" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className={inputClass} placeholder="留空=不修改" />
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={editIsAdmin} onChange={(e) => setEditIsAdmin(e.target.checked)} className="rounded" />
                        <span className="text-xs text-slate-600">管理员权限</span>
                      </label>
                    </div>
                    <div className="flex items-end pb-2">
                      <button type="button" onClick={submitEdit} disabled={editSaving}
                        className="text-xs bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap disabled:opacity-60">
                        {editSaving ? '保存中...' : '保存修改'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ═══ 人员录入 Tab ═══ */
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100">
                <i className="ri-information-line text-amber-500 text-sm mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  录入后该人员可使用登录名和密码在留样柜设备上登录。默认密码 <strong>123456</strong>，可在此修改。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    登录名 <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={addLoginName}
                    onChange={(e) => { setAddLoginName(e.target.value); clearAddError('loginName'); }}
                    onBlur={handleLoginNameBlur}
                    placeholder="设备端登录账号" className={addFieldClass(addErrors.loginName)} />
                  {addCheckingName && (
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      <i className="ri-loader-4-line animate-spin text-xs" />检查登录名...
                    </p>
                  )}
                  {addErrors.loginName && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <i className="ri-error-warning-line text-xs" />{addErrors.loginName}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    登录密码 <span className="text-red-500">*</span>
                  </label>
                  <input type="password" value={addPassword}
                    onChange={(e) => { setAddPassword(e.target.value); clearAddError('password'); }}
                    placeholder="至少6位" className={addFieldClass(addErrors.password)} />
                  {addErrors.password && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <i className="ri-error-warning-line text-xs" />{addErrors.password}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    昵称 <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={addNickName}
                    onChange={(e) => { setAddNickName(e.target.value); clearAddError('nickName'); }}
                    placeholder="显示名称" className={addFieldClass(addErrors.nickName)} />
                  {addErrors.nickName && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <i className="ri-error-warning-line text-xs" />{addErrors.nickName}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">职位</label>
                  <input type="text" value={addPosition} onChange={(e) => setAddPosition(e.target.value)}
                    placeholder="如：厨师长" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    编号 <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={addNum}
                    onChange={(e) => { setAddNum(e.target.value); clearAddError('num'); }}
                    placeholder="工号" className={addFieldClass(addErrors.num)} />
                  {addErrors.num && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <i className="ri-error-warning-line text-xs" />{addErrors.num}
                    </p>
                  )}
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={addIsAdmin} onChange={(e) => setAddIsAdmin(e.target.checked)} className="rounded" />
                    <span className="text-xs text-slate-600">管理员权限</span>
                  </label>
                </div>
              </div>

              {/* Photo upload */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">头像照片</label>
                <div className="flex items-center gap-3">
                  <input ref={addFileRef} type="file" accept="image/*" onChange={handleAddPhotoChange} className="hidden" />
                  <button type="button" onClick={() => addFileRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs border border-dashed border-slate-300 px-3 py-2 rounded-lg hover:border-slate-400 cursor-pointer whitespace-nowrap">
                    <i className="ri-camera-line" />{addPhotoPreview ? '更换照片' : '拍照/选择照片'}
                  </button>
                  {addPhotoPreview && (
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200">
                      <img src={addPhotoPreview} alt="预览" className="w-full h-full object-cover" />
                      <button type="button"
                        onClick={() => { setAddPhotoPreview(''); setAddImage(''); if (addFileRef.current) addFileRef.current.value = ''; }}
                        className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center bg-red-500 text-white rounded-full text-[9px] cursor-pointer">
                        <i className="ri-close-line" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <button type="button" onClick={handleAddSubmit} disabled={addSaving || addCheckingName}
                className="text-sm bg-slate-800 text-white rounded-lg px-5 py-2.5 hover:bg-slate-700 cursor-pointer whitespace-nowrap disabled:opacity-60">
                {addSaving ? '添加中...' : '确认录入'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex-shrink-0">
          <span className="text-xs text-slate-400">
            共 {users.length} 人
          </span>
          <button type="button" onClick={onClose}
            className="text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-white cursor-pointer whitespace-nowrap">
            关闭
          </button>
        </div>

        {/* ─── 详情 Modal ─── */}
        {detailUser && (
          <div className="absolute inset-0 bg-black/40 z-[60] flex items-center justify-center rounded-2xl">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-slate-800">人员详情</h3>
                <button type="button" onClick={() => setDetailUser(null)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer">
                  <i className="ri-close-line text-slate-500" />
                </button>
              </div>
              {detailUser.image && (
                <div className="flex justify-center mb-3">
                  <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-slate-200">
                    <img src={resolvePhotoUrl(detailUser.image)} alt="" className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {[
                  { label: '登录名', value: detailUser.login_name },
                  { label: '昵称', value: detailUser.nick_name || '—' },
                  { label: '职位', value: detailUser.position || '—' },
                  { label: '编号', value: detailUser.num || '—' },
                  { label: '角色', value: detailUser.is_admin === 1 ? '管理员' : '操作员' },
                  { label: '人脸 Token', value: detailUser.face_token ? '已录入' : '未录入' },
                  { label: '创建时间', value: new Date(detailUser.created_at).toLocaleString('zh-CN') },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between py-1.5 border-b border-slate-50">
                    <span className="text-xs text-slate-400 w-20">{label}</span>
                    <span className="text-sm text-slate-700 text-right">{value}</span>
                  </div>
                ))}
              </div>
              {detailUser.face_token && (
                <button type="button" onClick={() => handleUnbindFace(detailUser)}
                  className="mt-3 w-full text-xs border border-amber-200 text-amber-600 rounded-lg py-2 hover:bg-amber-50 cursor-pointer whitespace-nowrap">
                  <i className="ri-user-unfollow-line mr-1" />解除人脸绑定
                </button>
              )}
              <div className="flex gap-2 mt-4">
                <button type="button" onClick={() => setDetailUser(null)}
                  className="flex-1 text-sm border border-slate-200 rounded-lg py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                  关闭
                </button>
                <button type="button" onClick={() => { setDetailUser(null); startEdit(detailUser); }}
                  className="text-sm bg-slate-800 text-white rounded-lg px-4 py-2 hover:bg-slate-700 cursor-pointer whitespace-nowrap">
                  编辑
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── 删除确认 ─── */}
        {deleteConfirmId !== null && (
          <div className="absolute inset-0 bg-black/40 z-[60] flex items-center justify-center rounded-2xl">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50">
                  <i className="ri-error-warning-line text-red-500 text-lg" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-800">确认删除</h3>
                  <p className="text-xs text-slate-500 mt-0.5">此操作不可恢复，该人员将无法在设备上登录</p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setDeleteConfirmId(null)}
                  className="text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                  取消
                </button>
                <button type="button" onClick={() => handleDelete(deleteConfirmId)}
                  className="text-sm bg-red-500 text-white rounded-lg px-4 py-2 hover:bg-red-600 cursor-pointer whitespace-nowrap">
                  确认删除
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`absolute top-3 right-3 z-[70] flex items-center gap-2 px-4 py-3 rounded-xl text-sm border ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
            <i className={toast.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}