import { statsData } from '@/mocks/dashboard';

export default function StatsCards() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {statsData.map((stat) => (
        <div key={stat.id} className="bg-white rounded-xl p-5 border border-slate-100">
          <div className="flex items-start justify-between mb-4">
            <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${stat.bg}`}>
              <i className={`${stat.icon} ${stat.color} text-xl`} />
            </div>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                stat.changeType === 'up'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-red-50 text-red-500'
              }`}
            >
              {stat.changeType === 'up' ? (
                <span className="flex items-center gap-0.5">
                  <i className="ri-arrow-up-s-line" />
                  {stat.change}
                </span>
              ) : (
                <span className="flex items-center gap-0.5">
                  <i className="ri-arrow-down-s-line" />
                  {stat.change.replace('-', '')}
                </span>
              )}
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {stat.value}
            <span className="text-sm font-normal text-slate-400 ml-1">{stat.unit}</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}