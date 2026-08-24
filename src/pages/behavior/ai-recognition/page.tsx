import AppLayout from '@/components/feature/AppLayout';
import { useAIRecognition } from './hooks/useAIRecognition';
import AIEventList, { TYPE_CONFIG, LEVEL_BADGE, LEVEL_LABEL } from './components/AIEventList';
import HandleEventModal from './components/HandleEventModal';
import CameraLivePanel from './components/CameraLivePanel';

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AIRecognitionPage() {
  const {
    events,
    loading,
    typeFilter, setTypeFilter,
    statusFilter, setStatusFilter,
    selectedId, selectedEvent,
    selectEvent,
    unreadCount,
    handleEvent,
    handleModalOpen, setHandleModalOpen,
    refetch,
    todayTotal, highCount, mediumCount, handledCount,
    EVENT_TYPES, STATUS_FILTERS,
  } = useAIRecognition();

  return (
    <AppLayout title="AI 行为识别" breadcrumb={['行为分析', 'AI 行为识别']}>
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {[
          { label: '今日识别事件', value: todayTotal, unit: '条', icon: 'ri-brain-line', color: 'text-slate-700', bg: 'bg-slate-100' },
          { label: '高风险事件', value: highCount, unit: '条', icon: 'ri-alarm-warning-line', color: 'text-red-600', bg: 'bg-red-50' },
          { label: '中风险事件', value: mediumCount, unit: '条', icon: 'ri-error-warning-line', color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: '已处理', value: handledCount, unit: '条', icon: 'ri-checkbox-circle-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3">
            <div className={`w-9 h-9 flex items-center justify-center rounded-lg ${s.bg}`}>
              <i className={`${s.icon} ${s.color} text-lg`} />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">
                {s.value}
                <span className="text-xs text-slate-400 font-normal ml-1">{s.unit}</span>
              </p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main 3-column layout */}
      <div className="flex gap-4 min-h-[580px]">

        {/* Left: real-time camera */}
        <CameraLivePanel />

        {/* Middle: event list */}
        <AIEventList
          events={events}
          loading={loading}
          selectedId={selectedId}
          unreadCount={unreadCount}
          typeFilter={typeFilter}
          statusFilter={statusFilter}
          eventTypes={EVENT_TYPES}
          statusFilters={STATUS_FILTERS}
          onSelect={selectEvent}
          onTypeChange={setTypeFilter}
          onStatusChange={setStatusFilter}
        />

        {/* Right: event detail */}
        <div className="w-72 flex-shrink-0">
          {selectedEvent ? (
            <div className="bg-white rounded-xl border border-slate-100 p-4 h-full flex flex-col">
              {/* Event header */}
              <div className="mb-4">
                {(() => {
                  const cfg = TYPE_CONFIG[selectedEvent.event_type] || TYPE_CONFIG['行为异常'];
                  return (
                    <div className={`flex items-center gap-2 p-3 rounded-xl ${cfg.bg} mb-3`}>
                      <div className={`w-8 h-8 flex items-center justify-center rounded-lg bg-white`}>
                        <i className={`${cfg.icon} ${cfg.color} text-base`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-semibold ${cfg.color}`}>{selectedEvent.event_type}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${LEVEL_BADGE[selectedEvent.level]}`}>
                            {LEVEL_LABEL[selectedEvent.level]}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{selectedEvent.event_code}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Info rows */}
                <div className="space-y-2">
                  {[
                    { label: '摄像头', value: selectedEvent.camera_name, icon: 'ri-camera-line' },
                    { label: '位置', value: selectedEvent.camera_location || '—', icon: 'ri-map-pin-line' },
                    { label: '事件时间', value: formatTime(selectedEvent.event_time), icon: 'ri-time-line' },
                    { label: '置信度', value: `${selectedEvent.confidence}%`, icon: 'ri-percent-line' },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-2 py-1.5 border-b border-slate-50">
                      <i className={`${row.icon} text-slate-400 text-sm w-4 h-4 flex items-center justify-center`} />
                      <span className="text-xs text-slate-400 w-14 flex-shrink-0">{row.label}</span>
                      <span className="text-xs font-medium text-slate-700 flex-1 text-right truncate">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="bg-slate-50 rounded-xl p-3 mb-4">
                <p className="text-xs font-medium text-slate-500 mb-1">事件描述</p>
                <p className="text-xs text-slate-700 leading-relaxed">{selectedEvent.description}</p>
              </div>

              {/* Confidence bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">AI 置信度</span>
                  <span className="text-xs font-bold text-slate-700">{selectedEvent.confidence}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${selectedEvent.confidence >= 90 ? 'bg-red-400' : selectedEvent.confidence >= 75 ? 'bg-amber-400' : 'bg-slate-400'}`}
                    style={{ width: `${selectedEvent.confidence}%` }}
                  />
                </div>
              </div>

              {/* Status */}
              {(selectedEvent.status === 'handled' || selectedEvent.status === 'ignored') ? (
                <div className={`rounded-xl p-3 mb-4 ${selectedEvent.status === 'handled' ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <i className={`${selectedEvent.status === 'handled' ? 'ri-checkbox-circle-line text-emerald-500' : 'ri-eye-off-line text-slate-400'} text-sm`} />
                    <span className={`text-xs font-medium ${selectedEvent.status === 'handled' ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {selectedEvent.status === 'handled' ? '已处理' : '已忽略'}
                    </span>
                  </div>
                  {selectedEvent.handled_note && (
                    <p className="text-xs text-slate-500">{selectedEvent.handled_note}</p>
                  )}
                </div>
              ) : null}

              {/* Actions */}
              <div className="mt-auto flex flex-col gap-2">
                {selectedEvent.status !== 'handled' && selectedEvent.status !== 'ignored' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setHandleModalOpen(true)}
                      className="w-full text-sm bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap"
                    >
                      处理事件
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEvent(selectedEvent.id, 'ignored')}
                      className="w-full text-sm border border-slate-200 text-slate-500 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                    >
                      忽略
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={refetch}
                  className="w-full text-xs text-slate-400 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-refresh-line mr-1" />
                  刷新列表
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-100 h-full flex items-center justify-center text-slate-400">
              <div className="text-center">
                <i className="ri-eye-line text-3xl mb-2 block" />
                <p className="text-sm">选择左侧事件查看详情</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Handle modal */}
      {handleModalOpen && selectedEvent && (
        <HandleEventModal
          event={selectedEvent}
          onClose={() => setHandleModalOpen(false)}
          onSubmit={async (action, note) => {
            await handleEvent(selectedEvent.id, action, note);
            setHandleModalOpen(false);
          }}
        />
      )}
    </AppLayout>
  );
}