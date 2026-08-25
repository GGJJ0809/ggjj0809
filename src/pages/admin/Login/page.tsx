import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("请输入账号和密码");
      return;
    }
    setLoading(true);
    try {
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: username.trim(),
        password: password,
      });
      
      if (signInErr) throw signInErr;
      
      if (!data.user) {
        setError("账号或密码错误");
        return;
      }
      
      localStorage.setItem("admin_token", data.session?.access_token || "");
      localStorage.setItem("admin_username", data.user.email || "");
      navigate("/admin", { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "登录失败，请稍后重试";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* 品牌 */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center">
            <i className="ri-rocket-2-line text-white text-xl"></i>
          </div>
          <div className="text-left leading-none">
            <span className="font-display font-black text-xl text-foreground-900 tracking-wide">
              Nuclechain
            </span>
            <span className="block text-[11px] text-foreground-500 tracking-widest mt-0.5">
              引力场 · 管理后台
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-background-200/70 p-8">
          <h1 className="text-lg font-bold text-foreground-950 mb-1">后台登录</h1>
          <p className="text-sm text-foreground-500 mb-6">请输入管理员账号登录管理后台</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground-800">账号</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入管理员账号"
                autoComplete="username"
                className="w-full h-11 px-4 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground-800">密码</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  className="w-full h-11 px-4 pr-12 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-400 hover:text-foreground-600 transition-colors"
                >
                  <i className={`${showPassword ? "ri-eye-off-line" : "ri-eye-line"} text-base`}></i>
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <i className="ri-error-warning-line mt-0.5"></i>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap flex items-center justify-center gap-2"
            >
              {loading && <i className="ri-loader-4-line animate-spin"></i>}
              {loading ? "登录中..." : "登录"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-foreground-400 mt-6">
          <Link to="/" className="hover:text-foreground-600 transition-colors">
            <i className="ri-arrow-left-line mr-1"></i>返回前台首页
          </Link>
        </p>
      </div>
    </main>
  );
}