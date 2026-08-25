import type { BookingRecord } from "@/mocks/valueAdded";

interface BookingRecordsProps {
  records: BookingRecord[];
}

const statusMeta: Record<string, { label: string; className: string }> = {
  pending: { label: "待确认", className: "bg-accent-100 text-accent-900" },
  confirmed: { label: "已确认", className: "bg-primary-100 text-primary-700" },
  completed: { label: "已完成", className: "bg-secondary-100 text-secondary-900" },
  cancelled: { label: "已取消", className: "bg-background-200 text-foreground-500" },
};

const categoryMeta: Record<string, { icon: string; className: string }> = {
  教育: { icon: "ri-graduation-cap-line", className: "bg-secondary-100 text-secondary-900" },
  医疗: { icon: "ri-heart-pulse-line", className: "bg-accent-100 text-accent-900" },
  财富: { icon: "ri-briefcase-4-line", className: "bg-primary-100 text-primary-700" },
  商旅: { icon: "ri-plane-line", className: "bg-secondary-100 text-secondary-900" },
};

export default function BookingRecords({ records }: BookingRecordsProps) {
  return (
    <div className="rounded-lg border border-background-200 bg-background-50">
      <div className="flex items-center justify-between border-b border-background-200 px-5 py-4">
        <div>
          <h3 className="font-heading text-base font-bold">预约记录</h3>
          <p className="text-xs text-foreground-500">增值服务预约流转记录</p>
        </div>
        <span className="rounded-full bg-background-100 px-2.5 py-1 text-xs text-foreground-600">
          共 {records.length} 条
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-background-100 text-left text-xs text-foreground-500">
              <th className="px-5 py-3 font-medium">预约编号</th>
              <th className="px-5 py-3 font-medium">服务</th>
              <th className="px-5 py-3 font-medium">类别</th>
              <th className="px-5 py-3 font-medium">预约人</th>
              <th className="px-5 py-3 font-medium">状态</th>
              <th className="px-5 py-3 font-medium">日期</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const status = statusMeta[record.status];
              const cat = categoryMeta[record.category];
              return (
                <tr key={record.id} className="border-b border-background-100 last:border-0 hover:bg-background-100/50">
                  <td className="px-5 py-3 font-mono text-xs text-foreground-600">{record.id}</td>
                  <td className="px-5 py-3 text-foreground-800">{record.service}</td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1.5 text-foreground-700">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-md ${cat.className}`}>
                        <i className={`${cat.icon} text-xs`} />
                      </span>
                      {record.category}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-foreground-700">{record.applicant}</td>
                  <td className="px-5 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-foreground-500">{record.date}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}