import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import MemberStats from "./components/MemberStats";
import MemberTable from "./components/MemberTable";
import LevelBenefits from "./components/LevelBenefits";
import RenewModal from "./components/RenewModal";

interface Member {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  level_key: string;
  status: string;
  location: string | null;
  joined_at: string;
  expires_at: string | null;
}

interface Level {
  id: number;
  level_key: string;
  name: string;
  annual_fee: number;
  benefits: string[];
  sort_order: number;
}

const statusOptions = [
  { value: "all", label: "全部状态" },
  { value: "active", label: "正常" },
  { value: "expiring", label: "即将到期" },
  { value: "expired", label: "已过期" },
  { value: "suspended", label: "已暂停" },
];

export default function Members() {
  const [members, setMembers] = useState<Member[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [renewMember, setRenewMember] = useState<Member | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, levelsRes] = await Promise.all([
        supabase
          .from("members")
          .select("*")
          .order("joined_at", { ascending: false }),
        supabase.from("member_levels").select("*").order("sort_order"),
      ]);
      if (membersRes.error) throw membersRes.error;
      if (levelsRes.error) throw levelsRes.error;
      setMembers(membersRes.data ?? []);
      setLevels(levelsRes.data ?? []);
    } catch (e) {
      console.error("会员数据加载失败:", e);
      const err = e as
        | { message?: string; code?: string; details?: string; hint?: string }
        | null;
      const parts: string[] = [];
      if (err?.message) parts.push(err.message);
      if (err?.code) parts.push(`[${err.code}]`);
      if (err?.details) parts.push(err.details);
      if (err?.hint) parts.push(err.hint);
      setError(parts.length ? parts.join(" ") : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const levelMap = useMemo(() => {
    const map: Record<string, Level> = {};
    levels.forEach((level) => {
      map[level.level_key] = level;
    });
    return map;
  }, [levels]);

  const filteredMembers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return members.filter((member) => {
      const matchSearch =
        !keyword ||
        member.name.toLowerCase().includes(keyword) ||
        (member.email ?? "").toLowerCase().includes(keyword) ||
        (member.location ?? "").toLowerCase().includes(keyword);
      const matchLevel =
        levelFilter === "all" || member.level_key === levelFilter;
      const matchStatus =
        statusFilter === "all" || member.status === statusFilter;
      return matchSearch && matchLevel && matchStatus;
    });
  }, [members, search, levelFilter, statusFilter]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleRenewConfirm = async () => {
    if (!renewMember) return;
    const level = levelMap[renewMember.level_key];
    const fee = Number(level?.annual_fee ?? 0);
    const base = renewMember.expires_at
      ? new Date(renewMember.expires_at)
      : new Date();
    const newExpires = new Date(base);
    newExpires.setFullYear(newExpires.getFullYear() + 1);

    setRenewing(true);
    try {
      const { error: renewalError } = await supabase.from("renewals").insert({
        member_id: renewMember.id,
        amount: fee,
        method: "card",
        new_expires_at: newExpires.toISOString(),
      });
      if (renewalError) throw renewalError;

      const { error: memberError } = await supabase
        .from("members")
        .update({ status: "active", expires_at: newExpires.toISOString() })
        .eq("id", renewMember.id);
      if (memberError) throw memberError;

      showToast("续费成功，会员有效期已延长一年");
      setRenewMember(null);
      await loadData();
    } catch (e) {
      showToast(`续费失败：${e instanceof Error ? e.message : "未知错误"}`);
    } finally {
      setRenewing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-foreground-600">
        <i className="ri-loader-4-line text-3xl animate-spin"></i>
        <p className="text-sm">会员数据加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <i className="ri-error-warning-line text-4xl text-foreground-400"></i>
        <p className="text-sm text-foreground-700">加载失败：{error}</p>
        <button
          type="button"
          onClick={loadData}
          className="px-4 py-2 rounded-md bg-primary-500 text-background-50 text-sm font-medium hover:bg-primary-600 whitespace-nowrap cursor-pointer"
        >
          重试
        </button>
      </div>
    );
  }

  const renewLevel = renewMember ? levelMap[renewMember.level_key] ?? null : null;

  return (
    <div className="space-y-4">
      <MemberStats members={members} />

      {/* 筛选工具栏 */}
      <div className="flex flex-col gap-3 rounded-lg border border-background-200 bg-background-50 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名 / 邮箱 / 地区..."
            className="h-10 w-full rounded-md border border-background-200 bg-background-50 pl-9 pr-3 text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="h-10 rounded-md border border-background-200 bg-background-50 px-3 text-sm outline-none focus:border-primary-300 cursor-pointer"
          >
            <option value="all">全部等级</option>
            {levels.map((level) => (
              <option key={level.level_key} value={level.level_key}>
                {level.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-md border border-background-200 bg-background-50 px-3 text-sm outline-none focus:border-primary-300 cursor-pointer"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <MemberTable
        members={filteredMembers}
        levelMap={levelMap}
        onRenew={setRenewMember}
      />

      {/* 等级权益 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-heading text-base font-bold text-foreground-950">
            会员等级权益
          </h4>
          <span className="text-xs text-foreground-500">
            共 {levels.length} 个等级
          </span>
        </div>
        <LevelBenefits levels={levels} />
      </div>

      <RenewModal
        member={renewMember}
        level={renewLevel}
        loading={renewing}
        onConfirm={handleRenewConfirm}
        onClose={() => setRenewMember(null)}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-foreground-950 px-4 py-3 text-sm text-background-50 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}