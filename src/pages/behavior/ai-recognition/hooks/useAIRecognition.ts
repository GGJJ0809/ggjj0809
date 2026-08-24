import { todayBeijing } from '@/lib/dateUtils';
import { supabase } from '@/lib/supabase';
import { syncUpdate } from '@/lib/dbSync';

function isElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

export interface AIEvent {
  id: number;
  event_code: string;
  camera_id: string;
  camera_name: string;
  camera_location: string;
  event_type: string;
  level: 'high' | 'medium' | 'low';
  confidence: number;
  description: string;
  snapshot_url: string | null;
  status: 'unread' | 'read' | 'handled' | 'ignored';
  handled_at: string | null;
  handled_note: string | null;
  event_time: string;
}

const EVENT_TYPES = ['全部类型', '未佩戴口罩', '疑似吸烟', '未穿工服', '区域闯入', '行为异常', '打架/冲突'];
const STATUS_FILTERS = ['全部', '未读', '已读', '已处理', '已忽略'];

export function useAIRecognition() {
  const [events, setEvents] = useState<AIEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('全部类型');
  const [statusFilter, setStatusFilter] = useState('全部');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [handleModalOpen, setHandleModalOpen] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('ai_recognition_events')
        .select('*')
        .order('event_time', { ascending: false })
        .limit(100);

      if (typeFilter !== '全部类型') {
        query = query.eq('event_type', typeFilter);
      }
      if (statusFilter === '未读') query = query.eq('status', 'unread');
      else if (statusFilter === '已读') query = query.eq('status', 'read');
      else if (statusFilter === '已处理') query = query.eq('status', 'handled');
      else if (statusFilter === '已忽略') query = query.eq('status', 'ignored');

      const { data } = await query;
      const list = (data || []) as AIEvent[];
      setEvents(list);
      if (list.length > 0 && selectedId === null) {
        setSelectedId(list[0].id);
        if (list[0].status === 'unread') {
          markRead(list[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const markRead = useCallback(async (id: number) => {
    await supabase
      .from('ai_recognition_events')
      .update({ status: 'read' })
      .eq('id', id)
      .eq('status', 'unread');
    if (!isElectron()) {
      await syncUpdate('ai_recognition_events', { status: 'read' }, id);
    }
    setEvents((prev) => prev.map((e) => e.id === id && e.status === 'unread' ? { ...e, status: 'read' } : e));
  }, []);

  const handleEvent = useCallback(async (id: number, action: 'handled' | 'ignored', note?: string) => {
    const updateData = {
      status: action,
      handled_at: new Date().toISOString(),
      handled_note: note || null,
    };
    await supabase
      .from('ai_recognition_events')
      .update(updateData)
      .eq('id', id);
    if (!isElectron()) {
      await syncUpdate('ai_recognition_events', updateData, id);
    }
    setEvents((prev) => prev.map((e) => e.id === id ? { ...e, status: action, handled_note: note || null } : e));
  }, []);

  const selectEvent = useCallback((id: number) => {
    setSelectedId(id);
    markRead(id);
  }, [markRead]);

  const selectedEvent = events.find((e) => e.id === selectedId) || null;
  const unreadCount = events.filter((e) => e.status === 'unread').length;

  const today = todayBeijing();
  const todayEvents = events.filter((e) => e.event_time.slice(0, 10) === today);
  const highCount = todayEvents.filter((e) => e.level === 'high').length;
  const mediumCount = todayEvents.filter((e) => e.level === 'medium').length;
  const handledCount = todayEvents.filter((e) => e.status === 'handled').length;

  return {
    events,
    loading,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    selectedId,
    selectedEvent,
    selectEvent,
    unreadCount,
    handleEvent,
    handleModalOpen,
    setHandleModalOpen,
    refetch: fetchEvents,
    todayTotal: todayEvents.length,
    highCount,
    mediumCount,
    handledCount,
    EVENT_TYPES,
    STATUS_FILTERS,
  };
}