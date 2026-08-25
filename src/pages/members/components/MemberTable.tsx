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
  level_key: string;
  name: string;
  annual_fee: number;
}

interface MemberTableProps {
  members: Member[];
  levelMap: Record<string, Level>;
  onRenew: (member: Member) => void;
}

const levelBadge: Record<string, string> = {
  standard: "bg-foreground-100 text-foreground-700",
  gold: "bg-secondary-100 text-secondary-900",
  platinum: "bg-accent-100 text-accent-900",
  black: "bg-foreground-950 text-background-50",
};

const statusMap: Record<string, { label: string; style: string }> = {
  active: { label: "正常", style: "bg-primary-100 text-primary-900" },
  expiring: { label: "即将到期", style: "bg-accent-100 text-accent-900" },
  expired: { label: "已过期", style: "bg-secondary-100 text-secondary-900" },
  suspended: { label: "已暂停", style: "bg-foreground-100 text-foreground-700" },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function MemberTable({
  members,
  levelMap,
  onRenew,
}: MemberTableProps) {
  if (members.length === 0) {
    return (
      <div className="bg-background-50 border border-background-200 rounded-lg py-16 text-center text-foreground-600 text-sm">
        暂无符合条件的会员
      </div>
    );
  }

  return (
    <div className="bg-background-50 border border-background-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-background-200 text-xs text-foreground-600">
              <th className="px-5 py-4 font-medium">会员</th>
              <th className="px-5 py-4 font-medium">等级</th>
              <th className="px-5 py-4 font-medium">状态</th>
              <th className="px-5 py-4 font-medium">所在地区</th>
              <th className="px-5 py-4 font-medium">到期时间</th>
              <th className="px-5 py-4 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const level = levelMap[member.level_key];
              const status = statusMap[member.status] ?? {
                label: member.status,
                style: "bg-foreground-100 text-foreground-700",
              };
              const initial = member.name?.charAt(0) ?? "?";
              return (
                <tr
                  key={member.id}
                  className="border-b border-background-200 last:border-b-0 hover:bg-background-100/60 transition-colors"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 flex items-center justify-center rounded-full bg-primary-100 text-primary-900 font-semibold text-sm">
                        {initial}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground-950">
                          {member.name}
                        </p>
                        <p className="text-xs text-foreground-600">
                          {member.email ?? "—"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${
                        levelBadge[member.level_key] ??
                        "bg-foreground-100 text-foreground-700"
                      }`}
                    >
                      {level?.name ?? member.level_key}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${status.style}`}
                    >
                      {status.label}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-foreground-700">
                    {member.location ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-sm text-foreground-700 whitespace-nowrap">
                    {formatDate(member.expires_at)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => onRenew(member)}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 whitespace-nowrap cursor-pointer"
                    >
                      <i className="ri-refresh-line"></i>
                      续费
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}