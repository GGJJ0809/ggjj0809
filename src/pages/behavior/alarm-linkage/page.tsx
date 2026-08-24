import { useState } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { linkedAlarms, cameras } from '@/mocks/behavior';

const levelBadge = {
  high: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500', label: '高' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-400', label: '中' },
  low: { bg: 'bg-slate-50', text: 'text-slate-500', dot: 'bg-slate-300', label: '低' },
};

const statusCfg = {
  active: { label: '活跃', bg: 'bg-red-50', text: 'text-red-600' },
  confirmed: { label: '已确认', bg: 'bg-amber-50', text: 'text-amber-600' },
  resolved: { label: '已解决', bg: 'bg-emerald-50', text: 'text-emerald-600' },
};

export default function AlarmLinkagePage() {
  const [selected, setSelected] = useState(linkedAlarms[0].id);
  const selectedAlarm = linkedAlarms.find((a) => a.id === selected)!;
  const linkedCamera = cameras.find((c) => c.id === selectedAlarm.camera);

  return (
    <AppLayout title="报警联动" breadcrumb={['行为分析', '报警联动']}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Alarm list */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-sm font-semibold text-slate-800">联动报警事件</p>
            <p className="text-xs text-slate-400 mt-0.5">点击查看关联视频</p>
          </div>
          <div className="divide-y divide-slate-50">
            {linkedAlarms.map((alarm) => {
              const lvl = levelBadge[alarm.level as keyof typeof levelBadge];
              const sts = statusCfg[alarm.status as keyof typeof statusCfg];
              return (
                <button
                  key={alarm.id}
                  type="button"
                  onClick={() => setSelected(alarm.id)}
                  className={`w-full p-4 text-left cursor-pointer transition-colors hover:bg-slate-50 ${selected === alarm.id ? 'bg-slate-50 border-l-2 border-emerald-400' : ''}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${lvl.dot}`} />
                      <span className="text-sm font-medium text-slate-800">{alarm.type}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${sts.bg} ${sts.text}`}>{sts.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-1">{alarm.cameraName}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{alarm.time}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${lvl.bg} ${lvl.text}`}>
                      {lvl.label}级
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Linked video player + detail */}
        <div className="lg:col-span-2 space-y-4">
          {/* Video playback */}
          <div className="bg-slate-900 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-black/40">
              <div className="flex items-center gap-2">
                <i className="ri-vidicon-line text-red-400" />
                <span className="text-white text-sm font-medium">{selectedAlarm.cameraName}</span>
                <span className="text-white/50 text-xs">· 报警回放</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/50 text-xs">时段：{selectedAlarm.playbackTime}</span>
                <span className="text-white/50 text-xs">时长：{selectedAlarm.duration}</span>
              </div>
            </div>
            <div className="relative" style={{ paddingTop: '56.25%' }}>
              {linkedCamera && linkedCamera.status !== 'offline' ? (
                <img
                  src={linkedCamera.img}
                  alt={linkedCamera.name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                  <i className="ri-camera-off-line text-4xl" />
                </div>
              )}
              {/* Play overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="w-14 h-14 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 cursor-pointer transition-colors">
                  <i className="ri-play-fill text-white text-2xl" />
                </div>
              </div>
              {/* AI annotation overlay */}
              <div className="absolute top-3 left-3">
                <div className="bg-red-500/80 text-white text-xs px-2 py-1 rounded font-medium">
                  AI识别：{selectedAlarm.type}
                </div>
              </div>
              {/* Recording indicator */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded">
                <span className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="text-white text-xs">REC</span>
              </div>
            </div>
            {/* Video controls */}
            <div className="px-4 py-3 bg-black/40">
              <div className="flex items-center gap-3 mb-2">
                <button type="button" className="text-white/70 hover:text-white cursor-pointer w-6 h-6 flex items-center justify-center">
                  <i className="ri-skip-back-line text-sm" />
                </button>
                <button type="button" className="text-white hover:text-white/80 cursor-pointer w-6 h-6 flex items-center justify-center">
                  <i className="ri-play-fill" />
                </button>
                <button type="button" className="text-white/70 hover:text-white cursor-pointer w-6 h-6 flex items-center justify-center">
                  <i className="ri-skip-forward-line text-sm" />
                </button>
                <div className="flex-1 h-1 bg-white/20 rounded-full">
                  <div className="h-full w-2/5 bg-emerald-400 rounded-full" />
                </div>
                <span className="text-white/50 text-xs">{selectedAlarm.playbackTime}</span>
              </div>
            </div>
          </div>

          {/* Alarm detail */}
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">报警事件详情</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: '报警编号', value: selectedAlarm.id, icon: 'ri-hashtag' },
                { label: '事件类型', value: selectedAlarm.type, icon: 'ri-alert-line' },
                { label: '触发时间', value: selectedAlarm.time, icon: 'ri-time-line' },
                { label: '关联摄像头', value: selectedAlarm.cameraName, icon: 'ri-camera-line' },
                { label: '回放起始时间', value: selectedAlarm.playbackTime, icon: 'ri-play-line' },
                { label: '录像时长', value: selectedAlarm.duration, icon: 'ri-movie-line' },
              ].map((info) => (
                <div key={info.label} className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <i className={`${info.icon} text-slate-400 text-sm`} />
                    <span className="text-xs text-slate-400">{info.label}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-700">{info.value}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" className="flex-1 text-sm border border-slate-200 text-slate-600 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">下载录像</button>
              <button type="button" className="flex-1 text-sm bg-amber-500 text-white py-2 rounded-lg hover:bg-amber-600 cursor-pointer whitespace-nowrap">确认报警</button>
              <button type="button" className="flex-1 text-sm bg-slate-800 text-white py-2 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap">上报处理</button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}