import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

/**
 * 后台登录守卫：校验本地保存的管理员 token 是否有效，
 * 未登录或 token 过期则跳转到后台登录页。
 */
function isTokenValid(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export default function AdminGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const token = localStorage.getItem("admin_token");

  if (!token || !isTokenValid(token)) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}