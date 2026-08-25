import { useState, useEffect, type KeyboardEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { generateReferralCode, getStoredRefCode } from "@/lib/referral";

type Mode = "password" | "phone" | "register";

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const modeParam = searchParams.get("mode");
  const [mode, setMode] = useState<Mode>(modeParam === "register" ? "register" : "password");

  const [enabledModes, setEnabledModes] = useState<Record<Mode, boolean>>({
    password: true,
    phone: true,
    register: true,
  });

  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [countdown, setCountdown] = useState(0);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = searchParams.get("redirect") || "/member";

  useEffect(() => {
    if (user) navigate(redirectTo, { replace: true });
  }, [user, navigate, redirectTo]);

  // 读取后台「登录方式」开关，控制前台可用的登录方式
  useEffect(() => {
    supabase
      .from("site_settings")
      .select("key, value")
      .in("key", [
        "auth_email_login_enabled",
        "auth_email_signup_enabled",
        "auth_phone_login_enabled",
      ])
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const map: Record<Mode, boolean> = { password: true, phone: true, register: true };
        data.forEach((row: { key: string; value: string }) => {
          if (row.key === "auth_email_login_enabled") map.password = row.value !== "false";
          if (row.key === "auth_email_signup_enabled") map.register = row.value !== "false";
          if (row.key === "auth_phone_login_enabled") map.phone = row.value !== "false";
        });
        setEnabledModes(map);
      });
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    setInfo("");
    setPassword("");
    setConfirmPassword("");
    setPhone("");
    setSmsCode("");
    setCountdown(0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, action: () => void) => {
    if (e.key === "Enter") action();
  };

  const handleLogin = async () => {
    setError("");
    setInfo("");
    if (!email.trim() || !password) {
      setError("请输入邮箱和密码");
      return;
    }
    setSubmitting(true);
    try {
      const { error: e } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (e) throw e;
      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "登录失败";
      setError(msg === "Invalid login credentials" ? "邮箱或密码错误" : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendSms = async () => {
    setError("");
    setInfo("");
    const cleanPhone = phone.trim().replace(/\D/g, "");
    if (cleanPhone.length !== 11) {
      setError("请输入 11 位手机号");
      return;
    }
    setSubmitting(true);
    try {
      const { error: e } = await supabase.auth.signInWithOtp({
        phone: "+86" + cleanPhone,
      });
      if (e) throw e;
      setInfo("验证码已发送，请注意查收");
      setCountdown(60);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "发送失败";
      setError(
        msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("rate")
          ? "发送太频繁，请稍后再试"
          : msg,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhoneLogin = async () => {
    setError("");
    setInfo("");
    const cleanPhone = phone.trim().replace(/\D/g, "");
    if (cleanPhone.length !== 11 || !smsCode.trim()) {
      setError("请输入正确的手机号和验证码");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: e } = await supabase.auth.verifyOtp({
        phone: "+86" + cleanPhone,
        token: smsCode.trim(),
        type: "sms",
      });
      if (e) throw e;

      const uid = data.user?.id;
      if (uid) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("user_id")
          .eq("user_id", uid)
          .maybeSingle();
        if (!profile) {
          const myCode = generateReferralCode();
          const storedRef = getStoredRefCode();
          let referredBy: string | null = null;
          if (storedRef) {
            const { data: inviter } = await supabase
              .from("user_profiles")
              .select("user_id")
              .eq("referral_code", storedRef)
              .maybeSingle();
            if (inviter?.user_id && inviter.user_id !== uid) {
              referredBy = inviter.user_id;
            }
          }
          await supabase.from("user_profiles").upsert(
            {
              user_id: uid,
              nickname: "用户" + cleanPhone.slice(-4),
              referral_code: myCode,
              referred_by: referredBy,
            },
            { onConflict: "user_id" },
          );
        }
      }
      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "登录失败";
      setError(
        msg.toLowerCase().includes("token") || msg.toLowerCase().includes("otp")
          ? "验证码错误或已过期"
          : msg,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async () => {
    setError("");
    setInfo("");
    if (!nickname.trim()) {
      setError("请输入昵称");
      return;
    }
    if (!email.trim() || !password) {
      setError("请输入邮箱和密码");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 位");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: e } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { nickname: nickname.trim() } },
      });
      if (e) throw e;

      if (!data.session) {
        setInfo("注册成功，请查收邮件完成验证后再登录");
        setMode("password");
        return;
      }

      const uid = data.user?.id;
      if (uid) {
        const myCode = generateReferralCode();
        const storedRef = getStoredRefCode();
        let referredBy: string | null = null;
        if (storedRef) {
          const { data: inviter } = await supabase
            .from("user_profiles")
            .select("user_id")
            .eq("referral_code", storedRef)
            .maybeSingle();
          if (inviter?.user_id && inviter.user_id !== uid) {
            referredBy = inviter.user_id;
          }
        }
        await supabase.from("user_profiles").upsert(
          {
            user_id: uid,
            nickname: nickname.trim(),
            referral_code: myCode,
            referred_by: referredBy,
          },
          { onConflict: "user_id" },
        );
      }
      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "注册失败";
      setError(msg.includes("already registered") ? "该邮箱已注册，请直接登录" : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const modeLabels: Record<Mode, string> = {
    password: "密码登录",
    phone: "验证码登录",
    register: "注册",
  };

  return (
    <main className="min-h-screen pt-16 pb-16 md:pb-8 bg-background-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center">
            <i className="ri-rocket-2-line text-white text-lg"></i>
          </div>
          <div className="text-left leading-none">
            <span className="font-display font-black text-lg text-foreground-900 tracking-wide">
              Nuclechain
            </span>
            <span className="block text-[11px] text-foreground-500 tracking-widest mt-0.5">
              引力场
            </span>
          </div>
        </Link>

        <div className="bg-white rounded-2xl border border-background-200/70 p-6 md:p-8">
          {/* 切换 */}
          <div className="flex bg-background-100 rounded-full p-1 mb-6">
            {(["password", "phone", "register"] as Mode[])
              .filter((m) => enabledModes[m])
              .map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap ${
                    mode === m ? "bg-white text-foreground-950 shadow-sm" : "text-foreground-500"
                  }`}
                >
                  {modeLabels[m]}
                </button>
              ))}
          </div>

          <h1 className="text-xl font-bold text-foreground-950 mb-1">
            {mode === "password"
              ? "欢迎回来"
              : mode === "phone"
                ? "手机快捷登录"
                : "创建账号"}
          </h1>
          <p className="text-sm text-foreground-500 mb-6">
            {mode === "password"
              ? "登录后即可下单购买"
              : mode === "phone"
                ? "验证码登录，无需密码，首次自动注册"
                : "注册解锁课程、商城与会员权益"}
          </p>

          <div className="space-y-4">
            {/* 密码登录 */}
            {mode === "password" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground-800">邮箱</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    onKeyDown={(e) => handleKeyDown(e, handleLogin)}
                    className="w-full h-11 px-4 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground-800">密码</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入密码"
                    onKeyDown={(e) => handleKeyDown(e, handleLogin)}
                    className="w-full h-11 px-4 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
              </>
            )}

            {/* 验证码登录 */}
            {mode === "phone" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground-800">手机号</label>
                  <div className="flex gap-2">
                    <span className="h-11 px-3 rounded-lg bg-background-100 border border-background-200/70 text-sm text-foreground-700 flex items-center shrink-0">
                      +86
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="13800138000"
                      maxLength={11}
                      onKeyDown={(e) => handleKeyDown(e, handlePhoneLogin)}
                      className="w-full h-11 px-4 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground-800">验证码</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={smsCode}
                      onChange={(e) => setSmsCode(e.target.value)}
                      placeholder="6 位验证码"
                      maxLength={6}
                      onKeyDown={(e) => handleKeyDown(e, handlePhoneLogin)}
                      className="w-full h-11 px-4 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                    <button
                      onClick={handleSendSms}
                      disabled={submitting || countdown > 0}
                      className="h-11 px-4 rounded-lg bg-secondary-500 text-white text-sm font-semibold hover:bg-secondary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap shrink-0"
                    >
                      {countdown > 0 ? `${countdown}s` : "获取验证码"}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* 注册 */}
            {mode === "register" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground-800">昵称</label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="你的昵称"
                    onKeyDown={(e) => handleKeyDown(e, handleRegister)}
                    className="w-full h-11 px-4 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground-800">邮箱</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    onKeyDown={(e) => handleKeyDown(e, handleRegister)}
                    className="w-full h-11 px-4 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground-800">密码</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少 6 位"
                    onKeyDown={(e) => handleKeyDown(e, handleRegister)}
                    className="w-full h-11 px-4 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground-800">确认密码</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入密码"
                    onKeyDown={(e) => handleKeyDown(e, handleRegister)}
                    className="w-full h-11 px-4 rounded-lg bg-background-50 border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <i className="ri-error-warning-line mt-0.5"></i>
                <span>{error}</span>
              </div>
            )}
            {info && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                <i className="ri-checkbox-circle-line mt-0.5"></i>
                <span>{info}</span>
              </div>
            )}

            <button
              onClick={
                mode === "password"
                  ? handleLogin
                  : mode === "phone"
                    ? handlePhoneLogin
                    : handleRegister
              }
              disabled={submitting}
              className="w-full h-11 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap flex items-center justify-center gap-2"
            >
              {submitting && <i className="ri-loader-4-line animate-spin"></i>}
              {mode === "password"
                ? "登录"
                : mode === "phone"
                  ? "登录"
                  : "注册并登录"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-foreground-400 mt-4">
          登录即表示你同意平台的用户协议与隐私政策
        </p>
      </div>
    </main>
  );
}