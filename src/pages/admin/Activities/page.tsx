import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Activity {
  id: number;
  title: string;
  description: string;
  cover_image: string;
  activity_type: string;
  location: string;
  start_time: string;
  end_time: string;
  price: number;
  status: string;
  max_participants: number;
  registered_count: number;
  sort_order: number;
}

interface Registration {
  id: number;
  activity_id: number;
  name: string;
  phone: string;
  email: string;
  status: string;
  created_at: string;
}

const emptyActivity = {
  title: "",
  description: "",
  cover_image: "",
  activity_type: "offline",
  location: "",
  start_time: "",
  end_time: "",
  price: 0,
  status: "draft",
  max_participants: 100,
  sort_order: 0,
};

const typeLabels: Record<string, string> = {
  offline: "线下活动",
  online: "线上直播",
  hybrid: "线上线下",
};

export default function ActivitiesAdmin() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyActivity);
  const [saveLoading, setSaveLoading] = useState(false);

  // Registrations
  const [showRegistrations, setShowRegistrations] = useState(false);
  const [regActivityId, setRegActivityId] = useState<number | null>(null);
  const [regActivityTitle, setRegActivityTitle] = useState("");
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [regLoading, setRegLoading] = useState(false);

  // Checkin
  const [checkinRegId, setCheckinRegId] = useState<number | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error: dbErr } = await supabase
        .from("activities")
        .select("*")
        .order("sort_order");
      if (dbErr) throw dbErr;
      setActivities(data || []);
    } catch (err: any) {
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyActivity);
    setShowModal(true);
  };

  const openEdit = (a: Activity) => {
    setEditingId(a.id);
    setForm({
      title: a.title,
      description: a.description || "",
      cover_image: a.cover_image || "",
      activity_type: a.activity_type,
      location: a.location || "",
      start_time: a.start_time ? new Date(a.start_time).toISOString().slice(0, 16) : "",
      end_time: a.end_time ? new Date(a.end_time).toISOString().slice(0, 16) : "",
      price: a.price || 0,
      status: a.status,
      max_participants: a.max_participants || 100,
      sort_order: a.sort_order,
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
      if (editingId) {
        await supabase.from("activities").update(payload).eq("id", editingId);
      } else {
        await supabase.from("activities").insert(payload);
      }
      setShowModal(false);
      await loadData();
      showToast(editingId ? "活动已更新" : "活动已创建");
    } catch (err: any) {
      showToast("保存失败: " + (err?.message || ""));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggleStatus = async (a: Activity) => {
    const newStatus = a.status === "active" ? "draft" : "active";
    await supabase.from("activities").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", a.id);
    await loadData();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除该活动吗？")) return;
    await supabase.from("activities").delete().eq("id", id);
    await loadData();
    showToast("活动已删除");
  };

  const handleDuplicate = async (a: Activity) => {
    const { id, created_at, updated_at, deleted_at, ...rest } = a as any;
    await supabase.from("activities").insert({
      ...rest,
      title: a.title + "（副本）",
      status: "draft",
      registered_count: 0,
      updated_at: new Date().toISOString(),
    });
    await loadData();
    showToast("已复制");
  };

  const openRegistrations = async (activity: Activity) => {
    setRegActivityId(activity.id);
    setRegActivityTitle(activity.title);
    setShowRegistrations(true);
    setRegLoading(true);
    const { data } = await supabase
      .from("activity_registrations")
      .select("*")
      .eq("activity_id", activity.id)
      .order("created_at", { ascending: false });
    setRegistrations(data || []);
    setRegLoading(false);
  };

  const handleCheckin = async (regId: number, activityId: number) => {
    try {
      setCheckinRegId(regId);
      const { data: existing } = await supabase
        .from("activity_checkins")
        .select("id")
        .eq("registration_id", regId)
        .maybeSingle();

      if (existing) {
        await supabase.from("activity_checkins").delete().eq("id", existing.id);
        showToast("已取消签到");
      } else {
        await supabase.from("activity_checkins").insert({
          registration_id: regId,
          activity_id: activityId,
        });
        showToast("签到成功");
      }
      // Refresh registrations
      if (regActivityId) {
        const { data } = await supabase
          .from("activity_registrations")
          .select("*")
          .eq("activity_id", regActivityId)
          .order("created_at", { ascending: false });
        setRegistrations(data || []);
      }
    } catch (err: any) {
      showToast("操作失败: " + (err?.message || ""));
    } finally {
      setCheckinRegId(null);
    }
  };

  const updateField = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center h-full">
        <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex flex-col items-center py-12">
          <p className="text-sm text-foreground-500 mb-4">{error}</p>
          <button onClick={loadData} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium whitespace-nowrap">重试</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {toast && (
        <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground-950">活动管理</h1>
          <p className="mt-1 text-sm text-foreground-500">共 {activities.length} 个活动</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-all whitespace-nowrap">
          <i className="ri-add-line mr-1.5"></i>新建活动
        </button>
      </div>

      <div className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">排序</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">活动名称</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">类型</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">时间</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">价格</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">报名</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">状态</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.id} className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors">
                  <td className="px-4 py-3 text-foreground-500 text-xs">{a.sort_order}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-7 rounded overflow-hidden shrink-0 bg-background-100">
                        {a.cover_image ? (
                          <img src={a.cover_image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <i className="ri-image-line text-xs text-foreground-300"></i>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-foreground-900 text-sm line-clamp-1">{a.title}</p>
                        <p className="text-[11px] text-foreground-400">{a.location || "线上"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-background-100 text-xs text-foreground-600">
                      {typeLabels[a.activity_type] || a.activity_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground-500 text-xs whitespace-nowrap">
                    {a.start_time ? new Date(a.start_time).toLocaleDateString("zh-CN") : "-"}
                  </td>
                  <td className="px-4 py-3 text-foreground-800 text-sm">
                    {a.price > 0 ? `¥${a.price}` : <span className="text-primary-500 font-medium">免费</span>}
                  </td>
                  <td className="px-4 py-3 text-foreground-500 text-sm">
                    {a.registered_count || 0}/{a.max_participants || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleStatus(a)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        a.status === "active" ? "bg-primary-100 text-primary-700 hover:bg-primary-200" : "bg-background-200 text-foreground-500 hover:bg-background-300"
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${a.status === "active" ? "bg-primary-500" : "bg-foreground-300"}`}></div>
                      {a.status === "active" ? "已发布" : "草稿"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openRegistrations(a)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-background-100 transition-all" title="报名名单">
                        <i className="ri-contacts-line"></i>
                      </button>
                      <button onClick={() => openEdit(a)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all">
                        <i className="ri-edit-line"></i>
                      </button>
                      <button onClick={() => handleDuplicate(a)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all" title="复制">
                        <i className="ri-file-copy-line"></i>
                      </button>
                      <button onClick={() => handleDelete(a.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all">
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-xl max-h-[85vh] overflow-y-auto mx-4">
            <div className="sticky top-0 bg-background-50 border-b border-background-200/70 px-5 py-4 flex items-center justify-between">
              <h2 className="font-heading font-semibold text-foreground-950">{editingId ? "编辑活动" : "新建活动"}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all">
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">活动名称 <span className="text-red-400">*</span></label>
                <input type="text" value={form.title} onChange={(e) => updateField("title", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="影响力五力模型训练营" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">描述</label>
                <textarea value={form.description} onChange={(e) => updateField("description", e.target.value)} rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">活动类型</label>
                  <select value={form.activity_type} onChange={(e) => updateField("activity_type", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm">
                    <option value="offline">线下活动</option>
                    <option value="online">线上直播</option>
                    <option value="hybrid">线上线下</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">地点</label>
                  <input type="text" value={form.location} onChange={(e) => updateField("location", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="上海浦东新区..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">开始时间</label>
                  <input type="datetime-local" value={form.start_time} onChange={(e) => updateField("start_time", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">结束时间</label>
                  <input type="datetime-local" value={form.end_time} onChange={(e) => updateField("end_time", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">价格 (¥)</label>
                  <input type="number" value={form.price} onChange={(e) => updateField("price", Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" step="0.01" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">人数上限</label>
                  <input type="number" value={form.max_participants} onChange={(e) => updateField("max_participants", Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">排序</label>
                  <input type="number" value={form.sort_order} onChange={(e) => updateField("sort_order", Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">状态</label>
                  <select value={form.status} onChange={(e) => updateField("status", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm">
                    <option value="draft">草稿</option>
                    <option value="active">已发布</option>
                    <option value="ended">已结束</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">封面图片 URL</label>
                  <input type="text" value={form.cover_image} onChange={(e) => updateField("cover_image", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="https://..." />
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-background-50 border-t border-background-200/70 px-5 py-4 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">取消</button>
              <button onClick={handleSave} disabled={saveLoading || !form.title.trim()}
                className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap">
                {saveLoading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Registrations Modal */}
      {showRegistrations && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowRegistrations(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-2xl max-h-[80vh] overflow-y-auto mx-4">
            <div className="sticky top-0 bg-background-50 border-b border-background-200/70 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-heading font-semibold text-foreground-950">报名名单</h2>
                <p className="text-xs text-foreground-400">{regActivityTitle}</p>
              </div>
              <button onClick={() => setShowRegistrations(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all">
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="p-5">
              {regLoading ? (
                <div className="flex items-center justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-foreground-400"></i></div>
              ) : registrations.length === 0 ? (
                <p className="text-center text-sm text-foreground-400 py-8">暂无报名记录</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-background-200/70">
                      <th className="text-left py-2 px-2 text-xs text-foreground-500">姓名</th>
                      <th className="text-left py-2 px-2 text-xs text-foreground-500">手机</th>
                      <th className="text-left py-2 px-2 text-xs text-foreground-500">邮箱</th>
                      <th className="text-left py-2 px-2 text-xs text-foreground-500">报名时间</th>
                      <th className="text-center py-2 px-2 text-xs text-foreground-500">签到</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((reg) => (
                      <tr key={reg.id} className="border-b border-background-100 last:border-0">
                        <td className="py-2 px-2 text-sm text-foreground-800">{reg.name}</td>
                        <td className="py-2 px-2 text-xs text-foreground-500">{reg.phone || "-"}</td>
                        <td className="py-2 px-2 text-xs text-foreground-500">{reg.email || "-"}</td>
                        <td className="py-2 px-2 text-xs text-foreground-500 whitespace-nowrap">{new Date(reg.created_at).toLocaleString("zh-CN")}</td>
                        <td className="py-2 px-2 text-center">
                          <button
                            onClick={() => handleCheckin(reg.id, reg.activity_id)}
                            disabled={checkinRegId === reg.id}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                              checkinRegId === reg.id ? "opacity-50" : ""
                            } bg-accent-500 text-white hover:bg-accent-600`}
                          >
                            {checkinRegId === reg.id ? "..." : "签到/取消"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}