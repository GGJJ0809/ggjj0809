import { useState, useEffect, useCallback } from 'react';

export interface KeepUser {
  id: number;
  login_name: string;
  nick_name: string | null;
  is_admin: number;
  image: string | null;
  position: string | null;
  num: string | null;
  face_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateKeepUserInput {
  login_name: string;
  password?: string;
  nick_name?: string;
  is_admin?: boolean;
  image?: string;
  position?: string;
  num?: string;
}

export interface EditKeepUserInput {
  login_name?: string;
  password?: string;
  nick_name?: string;
  is_admin?: boolean;
  image?: string;
  position?: string;
  num?: string;
  face_token?: string;
}

const BASE = '';

function getApiUrl(path: string): string {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return `http://localhost:8081${path}`;
  }
  return path;
}

export function useKeepUsers() {
  const [users, setUsers] = useState<KeepUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async (keyword?: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = keyword ? `?keyword=${encodeURIComponent(keyword)}` : '';
      const res = await fetch(getApiUrl(`/api/keep/users${query}`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.msg || '获取人员列表失败');
      setUsers((json.data ?? []) as KeepUser[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '获取人员列表失败';
      setError(msg);
      if (users.length === 0) setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const createUser = useCallback(async (input: CreateKeepUserInput): Promise<KeepUser> => {
    const res = await fetch(getApiUrl('/api/keep/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.msg || '新增人员失败');
    const created = json.data as KeepUser;
    setUsers((prev) => [created, ...prev]);
    return created;
  }, []);

  const updateUser = useCallback(async (id: number, input: EditKeepUserInput): Promise<KeepUser> => {
    const res = await fetch(getApiUrl(`/api/keep/users/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.msg || '编辑人员失败');
    const updated = json.data as KeepUser;
    setUsers((prev) => prev.map((u) => u.id === id ? updated : u));
    return updated;
  }, []);

  const deleteUser = useCallback(async (id: number) => {
    const res = await fetch(getApiUrl(`/api/keep/users/${id}`), { method: 'DELETE' });
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.msg || '删除人员失败');
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const uploadImage = useCallback(async (base64: string): Promise<string> => {
    const res = await fetch(getApiUrl('/api/keep/users/upload-image'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64 }),
    });
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.msg || '上传图片失败');
    return (json.data?.url || '') as string;
  }, []);

  const checkLoginNameExists = useCallback(async (loginName: string): Promise<boolean> => {
    try {
      const res = await fetch(getApiUrl(`/api/keep/users/check-exists?login_name=${encodeURIComponent(loginName)}`));
      if (!res.ok) return false;
      const json = await res.json();
      if (json.code !== 0) return false;
      return !!(json.data?.exists ?? false);
    } catch {
      return false;
    }
  }, []);

  return { users, loading, error, fetchUsers, createUser, updateUser, deleteUser, uploadImage, checkLoginNameExists };
}