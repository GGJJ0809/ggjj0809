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

interface MemberStatsProps {
  members: Member[];
}

export default function MemberStats({ members }: MemberStatsProps) {
  const total = members.length;
  const active = members.filter((m) => m.status === "active").length;
  const expiring = members.filter((m) => m.status === "expiring").length;
  const expired = members.filter((m) => m.status === "expired").length;

  const stats = [
    {
      label: "会员总数",
      value: total,
      icon: "ri-user-star-line",
      color: "bg-accent-100 text-accent-900",
    },
    {
      label: "活跃会员",
      value: active,
      icon: "ri-user-follow-line",
      color: "bg-primary-100 text-primary-900",
    },
    {
      label: "即将到期",
      value: expiring,
      icon: "ri-time-line",
      color: "bg-secondary-100 text-secondary-900",
    },
    {
      label: "已过期",
      value: expired,
      icon: "ri-user-unfollow-line",
      color: "bg-foreground-100 text-foreground-700",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-background-50 border border-background-200 rounded-lg p-5 flex items-center gap-4 transition-transform duration-200 hover:-translate-y-0.5"
        >
          <div className={`w-12 h-12 flex items-center justify-center rounded-lg ${s.color}`}>
            <i className={`${s.icon} text-xl`}></i>
          </div>
          <div>
            <p className="text-2xl font-semibold text-foreground-950 leading-none">
              {s.value}
            </p>
            <p className="text-sm text-foreground-600 mt-1.5">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}