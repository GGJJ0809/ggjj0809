import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface LiveSession {
  id: number;
  title: string;
  description: string;
  cover_image: string;
  start_time: string;
  end_time: string;
  stream_url: string;
  replay_url: string;
  status: string;
  is_public: boolean;
  sort_order: number;
}

const emptySession = {
  title: "",
  description: "",
  cover_image: "",
  start_time: "",
  end_time: "",
  stream_url: "",
  replay_url: "",
  status: "upcoming",
  is_public: true,
  sort_order: 0,
};

const statusLabels: Record<string, string> = {
  upcoming: "即将开始",
  live: "直播中",
  ended: "已结束",
};

export default function LiveAdmin() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptySession);
  const [saveLoading, setSaveLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error: dbErr } = await supabase.from("live_sessions").select("*").order("sort_order");
      if (dbErr) throw dbErr;
      setSessions(data || []);
    } catch (err: any) {
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const openCreate = () => { setEditingId(null); setForm(emptySession); setShowModal(true); };

  const openEdit = (s: LiveSession) => {
    setEditingId(s.id);
    setForm({
      title: s.title,
      description: s.description || "",
      cover_image: s.cover_image || "",
      start_time: s.start_time ? new Date(s.start_time).toISOString().slice(0, 16) : "",
      end_time: s.end_time ? new Date(s.end_time).toISOString().slice(0, 16) : "",
      stream_url: s.stream_url || "",
      replay_url: s.replay_url || "",
      status: s.status,
      is_public: s.is_public,
      sort_order: s.sort_order,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    try {
      setSaveLoading(true);
      const payload = {
        ...form,
        start_time: form.start_time ? new Date(form.start_time).toISOString() : null,
        end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      if (editingId) await supabase.from("live_sessions").update(payload).eq("id", editingId);
      else await supabase.from("live_sessions").insert(payload);
      setShowModal(false);
      await loadData();
      showToast(editingId ? "直播已更新" : "直播已创建");
    } catch (err: any) { showToast("保存失败: " + (err?.message || "")); }
    finally { setSaveLoading(false); }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    await supabase.from("live_sessions").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", id);
    await loadData();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除该直播吗？")) return;
    await supabase.from("live_sessions").delete().eq("id", id);
    await loadData();
    showToast("直播已删除");
  };

  const updateField = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  if (loading) return <div className="p-6 md:p-8 flex items-center justify-center h-full"><i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i></div>;
  if (error) return <div className="p-6 md:p-8"><div className="flex flex-col items-center py-12"><p className="text-sm text-foreground-500 mb-4">{error}</p><button onClick={loadData} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium whitespace-nowrap">重试</button></div></div>;

  return (
    <div className="p-6 md:p-8">
      {toast && <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm shadow-lg">{toast}</div>}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground-950">直播管理</h1>
          <p className="mt-1 text-sm text-foreground-500">共 {sessions.length} 场直播</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-all whitespace-nowrap">
          <i className="ri-add-line mr-1.5"></i>创建直播
        </button>
      </div>

      <div className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">排序</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">直播标题</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">时间</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">权限</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">状态</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors">
                  <td className="px-4 py-3 text-foreground-500 text-xs">{s.sort_order}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground-900 text-sm">{s.title}</p>
                    <p className="text-[11px] text-foreground-400 line-clamp-1">{s.description}</p>
                  </td>
                  <td className="px-4 py-3 text-foreground-500 text-xs whitespace-nowrap">
                    {s.start_time ? new Date(s.start_time).toLocaleString("zh-CN") : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {s.is_public ? <span className="text-primary-500 text-xs">公开</span> : <span className="text-xs px-1.5 py-0.5 rounded bg-background-100 text-foreground-500">会员专享</span>}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={s.status}
                      onChange={(e) => handleStatusChange(s.id, e.target.value)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border-0 outline-none cursor-pointer ${
                        s.status === "live" ? "bg-red-100 text-red-700" :
                        s.status === "upcoming" ? "bg-primary-100 text-primary-700" :
                        "bg-background-200 text-foreground-500"
                      }`}
                    >
                      <option value="upcoming">{statusLabels.upcoming}</option>
                      <option value="live">{statusLabels.live}</option>
                      <option value="ended">{statusLabels.ended}</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {s.replay_url && (
                        <a href={s.replay_url} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all" title="回放">
                          <i className="ri-play-circle-line"></i>
                        </a>
                      )}
                      <button onClick={() => openEdit(s)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"><i className="ri-edit-line"></i></button>
                      <button onClick={() => handleDelete(s.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all"><i className="ri-delete-bin-line"></i></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-lg max-h-[85vh] overflow-y-auto mx-4">
            <div className="sticky top-0 bg-background-50 border-b border-background-200/70 px-5 py-4 flex items-center justify-between">
              <h2 className="font-heading font-semibold text-foreground-950">{editingId ? "编辑直播" : "创建直播"}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"><i className="ri-close-line"></i></button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="block text-xs font-medium text-foreground-500 mb-1">直播标题 <span className="text-red-400">*</span></label><input type="text" value={form.title} onChange={(e) => updateField("title", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" /></div>
              <div><label className="block text-xs font-medium text-foreground-500 mb-1">描述</label><textarea value={form.description} onChange={(e) => updateField("description", e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm resize-none" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-foreground-500 mb-1">开始时间</label><input type="datetime-local" value={form.start_time} onChange={(e) => updateField("start_time", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" /></div>
                <div><label className="block text-xs font-medium text-foreground-500 mb-1">结束时间</label><input type="datetime-local" value={form.end_time} onChange={(e) => updateField("end_time", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-foreground-500 mb-1">直播流 URL</label><input type="text" value={form.stream_url} onChange={(e) => updateField("stream_url", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="rtmp://..." /></div>
                <div><label className="block text-xs font-medium text-foreground-500 mb-1">回放 URL</label><input type="text" value={form.replay_url} onChange={(e) => updateField("replay_url", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="https://..." /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-foreground-500 mb-1">排序</label><input type="number" value={form.sort_order} onChange={(e) => updateField("sort_order", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" /></div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_public} onChange={(e) => updateField("is_public", e.target.checked)} className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-400" />
                    <span className="text-xs text-foreground-600">公开</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-background-50 border-t border-background-200/70 px-5 py-4 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">取消</button>
              <button onClick={handleSave} disabled={saveLoading || !form.title.trim()} className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap">{saveLoading ? "保存中..." : "保存"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}