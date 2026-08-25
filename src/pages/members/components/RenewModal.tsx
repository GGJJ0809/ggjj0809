interface Member {
  id: string;
  name: string;
  email: string | null;
  level_key: string;
  status: string;
  expires_at: string | null;
}

interface Level {
  level_key: string;
  name: string;
  annual_fee: number;
}

interface RenewModalProps {
  member: Member | null;
  level: Level | null;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

function calcNewExpires(expiresAt: string | null): Date {
  const base = expiresAt ? new Date(expiresAt) : new Date();
  const next = new Date(base);
  next.setFullYear(next.getFullYear() + 1);
  return next;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function RenewModal({
  member,
  level,
  loading,
  onConfirm,
  onClose,
}: RenewModalProps) {
  if (!member) return null;

  const fee = Number(level?.annual_fee ?? 0);
  const currentExpires = member.expires_at
    ? new Date(member.expires_at)
    : null;
  const newExpires = calcNewExpires(member.expires_at);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-background-50 rounded-lg w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <h3 className="text-lg font-semibold text-foreground-950">会员续费</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-600 hover:bg-background-100 cursor-pointer"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 flex items-center justify-center rounded-full bg-primary-100 text-primary-900 font-semibold text-sm">
              {member.name?.charAt(0) ?? "?"}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground-950">
                {member.name}
              </p>
              <p className="text-xs text-foreground-600">
                {level?.name ?? member.level_key}
              </p>
            </div>
          </div>

          <div className="bg-background-100 rounded-md p-4 space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-foreground-600">续费时长</span>
              <span className="text-foreground-950">1 年</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-foreground-600">续费金额</span>
              <span className="text-foreground-950 font-semibold">
                {fee > 0 ? `¥${fee.toLocaleString()}` : "免费"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-foreground-600">当前到期</span>
              <span className="text-foreground-950">
                {currentExpires ? formatDate(currentExpires) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-foreground-600">续费后到期</span>
              <span className="text-primary-600 font-medium">
                {formatDate(newExpires)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-md border border-background-300 text-sm font-medium text-foreground-700 hover:bg-background-100 whitespace-nowrap cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-md bg-primary-500 text-background-50 text-sm font-medium hover:bg-primary-600 disabled:opacity-60 whitespace-nowrap cursor-pointer"
          >
            {loading ? "处理中..." : "确认续费"}
          </button>
        </div>
      </div>
    </div>
  );
}