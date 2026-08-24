interface StaffMember {
  name: string;
  title: string;
  photoUrl: string;
}

interface StaffPanelProps {
  staffList: StaffMember[];
}

export default function StaffPanel({ staffList }: StaffPanelProps) {
  if (staffList.length === 0) return null;

  return (
    <div className="px-4 py-3 border-b border-slate-800/60">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-500/20">
          <i className="ri-user-star-line text-amber-400 text-lg" />
        </div>
        <div>
          <span className="text-amber-400 text-sm font-bold tracking-wide">今日炊事人员</span>
          <span className="text-slate-500 text-xs ml-2">{staffList.length} 人</span>
        </div>
      </div>
      <div className="flex items-start gap-4 overflow-x-auto no-scrollbar">
        {staffList.map((staff, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0 w-[72px]">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-800 border-2 border-amber-500/40 flex-shrink-0">
              {staff.photoUrl ? (
                <img src={staff.photoUrl} alt={staff.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-700">
                  <i className="ri-user-3-line text-slate-400 text-xl" />
                </div>
              )}
            </div>
            <p className="text-white text-xs font-semibold text-center leading-tight whitespace-nowrap">{staff.name}</p>
            <p className="text-amber-200 text-[10px] text-center leading-tight whitespace-nowrap">{staff.title || '—'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}