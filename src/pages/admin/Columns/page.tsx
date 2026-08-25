import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import ImageUploader from "@/components/feature/ImageUploader";

interface ColumnRow {
  id: number;
  title: string;
  subtitle: string;
  cover_image: string;
  description: string;
  price: number;
  member_price: number | null;
  member_level_required: number;
  is_published: boolean;
  sort_order: number;
  view_count: number;
  sold_count: number;
  course_count?: number;
}

interface CourseBrief {
  id: number;
  title: string;
  price: number;
  is_published: boolean;
}

const EMPTY_FORM = {
  title: "",
  subtitle: "",
  cover_image: "",
  description: "",
  price: 0,
  member_price: null as number | null,
  member_level_required: 0,
  sort_order: 0,
};

export default function ColumnsAdmin() {
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  /* modal */
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saveLoading, setSaveLoading] = useState(false);

  /* course picker */
  const [showCoursePicker, setShowCoursePicker] = useState(false);
  const [allCourses, setAllCourses] = useState<CourseBrief[]>([]);
  const [linkedCourseIds, setLinkedCourseIds] = useState<number[]>([]);
  const [linkedCoursesLoading, setLinkedCoursesLoading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const { data, error: dbErr } = await supabase
        .from("columns")
        .select("*")
        .order("sort_order");
      if (dbErr) throw dbErr;

      /* count courses per column */
      const cols: ColumnRow[] = [];
      for (const col of data || []) {
        const { count } = await supabase
          .from("column_courses")
          .select("*", { count: "exact", head: true })
          .eq("column_id", col.id);
        cols.push({ ...col, course_count: count || 0 });
      }
      setColumns(cols);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setLinkedCourseIds([]);
    setShowModal(true);
  };

  const openEdit = async (col: ColumnRow) => {
    setEditingId(col.id);
    setForm({
      title: col.title,
      subtitle: col.subtitle || "",
      cover_image: col.cover_image || "",
      description: col.description || "",
      price: col.price,
      member_price: col.member_price,
      member_level_required: col.member_level_required || 0,
      sort_order: col.sort_order || 0,
    });

    /* load linked courses */
    const { data: links } = await supabase
      .from("column_courses")
      .select("course_id")
      .eq("column_id", col.id)
      .order("sort_order");
    setLinkedCourseIds((links || []).map((l: any) => l.course_id));

    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    try {
      setSaveLoading(true);
      const now = new Date().toISOString();

      const payload = {
        title: form.title,
        subtitle: form.subtitle || null,
        cover_image: form.cover_image || null,
        description: form.description || null,
        price: form.price,
        member_price: form.member_price,
        member_level_required: form.member_level_required,
        sort_order: form.sort_order,
        updated_at: now,
      };

      let colId: number;
      if (editingId) {
        const { error: updErr } = await supabase.from("columns").update(payload).eq("id", editingId);
        if (updErr) throw updErr;
        colId = editingId;

        /* update course-column links */
        await supabase.from("column_courses").delete().eq("column_id", colId);
        /* also clear column_id on old courses */
        await supabase.from("courses").update({ column_id: null }).eq("column_id", colId);
      } else {
        const { data: newCol, error: insErr } = await supabase
          .from("columns")
          .insert({ ...payload, created_at: now })
          .select("id")
          .single();
        if (insErr) throw insErr;
        colId = newCol!.id;
      }

      /* insert new links */
      if (linkedCourseIds.length > 0) {
        await supabase.from("column_courses").insert(
          linkedCourseIds.map((cid, i) => ({
            column_id: colId,
            course_id: cid,
            sort_order: i + 1,
            created_at: now,
          }))
        );
        /* update courses to point to this column */
        await supabase
          .from("courses")
          .update({ column_id: colId })
          .in("id", linkedCourseIds);
      }

      setShowModal(false);
      await loadData();
      showToast(editingId ? "专栏已更新" : "专栏已创建");
    } catch (err: any) {
      showToast("保存失败：" + (err?.message || ""));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async (col: ColumnRow) => {
    if (!confirm(`确定要删除专栏「${col.title}」吗？（软删除）`)) return;
    await supabase
      .from("columns")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", col.id);
    /* unlink courses */
    await supabase.from("courses").update({ column_id: null }).eq("column_id", col.id);
    await loadData();
    showToast("专栏已删除");
  };

  const handleTogglePublish = async (col: ColumnRow) => {
    await supabase
      .from("columns")
      .update({ is_published: !col.is_published, updated_at: new Date().toISOString() })
      .eq("id", col.id);
    await loadData();
    showToast(col.is_published ? "已下架" : "已发布");
  };

  const openCoursePicker = async () => {
    setLinkedCoursesLoading(true);
    setShowCoursePicker(true);
    const { data } = await supabase
      .from("courses")
      .select("id, title, price, is_published")
      .is("deleted_at", null)
      .order("sort_order");
    setAllCourses(data || []);
    setLinkedCoursesLoading(false);
  };

  const toggleCourse = (courseId: number) => {
    setLinkedCourseIds((prev) =>
      prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId]
    );
  };

  const TYPE_LABEL: Record<string, string> = {
    single_text: "图文",
    single_audio: "音频",
    single_video: "视频",
    mixed: "混合",
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center h-full">
        <i className="ri-loader-4-line animate-spin text-2xl text-primary-500"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex flex-col items-center py-12">
          <p className="text-sm text-foreground-500 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium whitespace-nowrap"
          >
            重试
          </button>
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

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-black text-foreground-900">专栏管理</h1>
          <p className="mt-1 text-sm text-foreground-500">共 {columns.length} 个专栏</p>
        </div>
        <button
          onClick={openCreate}
          className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap"
        >
          <i className="ri-add-line mr-1.5"></i>新建专栏
        </button>
      </div>

      {/* Columns Grid */}
      {columns.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-background-200/70">
          <div className="w-14 h-14 rounded-2xl bg-background-100 flex items-center justify-center mx-auto mb-4">
            <i className="ri-stack-line text-2xl text-foreground-300"></i>
          </div>
          <p className="text-sm text-foreground-500">还没有专栏，点击上方按钮创建</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {columns.map((col) => (
            <div
              key={col.id}
              className="bg-white rounded-xl border border-background-200/70 overflow-hidden hover:border-primary-200 transition-all hover:shadow-md"
            >
              {/* Cover */}
              <div className="aspect-[2/1] bg-background-100">
                {col.cover_image ? (
                  <img src={col.cover_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <i className="ri-stack-line text-3xl text-foreground-200"></i>
                  </div>
                )}
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-foreground-900 text-sm truncate">{col.title}</h3>
                    {col.subtitle && (
                      <p className="text-xs text-foreground-400 mt-0.5 truncate">{col.subtitle}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleTogglePublish(col)}
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
                      col.is_published
                        ? "bg-primary-100 text-primary-700"
                        : "bg-background-200 text-foreground-500"
                    }`}
                  >
                    {col.is_published ? "已发布" : "草稿"}
                  </button>
                </div>

                <div className="flex items-center gap-3 mt-3 text-xs text-foreground-500">
                  <span>
                    <i className="ri-graduation-cap-line mr-0.5"></i>
                    {col.course_count || 0} 门课程
                  </span>
                  <span>
                    <i className="ri-eye-line mr-0.5"></i>
                    {col.view_count}
                  </span>
                  <span>
                    <i className="ri-shopping-cart-line mr-0.5"></i>
                    {col.sold_count}
                  </span>
                </div>

                <div className="flex items-center gap-1 mt-3 text-xs">
                  <span className="font-semibold text-foreground-800">
                    {col.price === 0 ? "免费" : `¥${col.price}`}
                  </span>
                  {col.member_price && col.member_price < col.price && (
                    <span className="text-foreground-400">
                      会员 ¥{col.member_price}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-background-200/70">
                  <button
                    onClick={() => openEdit(col)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium text-foreground-600 hover:bg-background-100 transition-all whitespace-nowrap"
                  >
                    <i className="ri-edit-line mr-1"></i>编辑
                  </button>
                  <button
                    onClick={() => handleDelete(col)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-all whitespace-nowrap"
                  >
                    <i className="ri-delete-bin-line mr-1"></i>删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ============ Modal ============ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-lg max-h-[85vh] overflow-y-auto mx-4">
            <div className="sticky top-0 bg-background-50 border-b border-background-200/70 px-5 py-4 flex items-center justify-between">
              <h2 className="font-heading font-semibold text-foreground-950">
                {editingId ? "编辑专栏" : "新建专栏"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">
                  专栏名称 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                  placeholder="例如：个人IP打造专栏"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">副标题</label>
                <input
                  type="text"
                  value={form.subtitle}
                  onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                  placeholder="一句话描述专栏特色"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">封面图片</label>
                <ImageUploader
                  value={form.cover_image}
                  onChange={(url) => setForm((f) => ({ ...f, cover_image: url }))}
                  label=""
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">专栏简介</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm h-20 resize-none"
                  placeholder="描述专栏内容..."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">
                    定价 (¥)
                  </label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">会员价 (¥)</label>
                  <input
                    type="number"
                    value={form.member_price ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        member_price: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                    min="0"
                    step="0.01"
                    placeholder="留空等于原价"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">最低会员等级</label>
                  <select
                    value={form.member_level_required}
                    onChange={(e) => setForm((f) => ({ ...f, member_level_required: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                  >
                    <option value={0}>无限制</option>
                    <option value={1}>会员</option>
                    <option value={2}>黄金会员</option>
                    <option value={3}>VIP会员</option>
                    <option value={4}>SVIP会员</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">排序</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                  min="0"
                />
              </div>

              {/* Linked Courses */}
              <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-foreground-500">
                    关联课程 ({linkedCourseIds.length})
                  </label>
                  <button
                    onClick={openCoursePicker}
                    className="px-3 py-1 rounded-full bg-primary-100 text-primary-700 text-[11px] font-medium hover:bg-accent-200 transition-all whitespace-nowrap"
                  >
                    <i className="ri-add-line mr-1"></i>选择课程
                  </button>
                </div>
                {linkedCourseIds.length === 0 ? (
                  <p className="text-[11px] text-foreground-400">尚未关联课程</p>
                ) : (
                  <div className="space-y-1">
                    {linkedCourseIds.map((cid) => {
                      const c = allCourses.find((a) => a.id === cid);
                      return (
                        <div key={cid} className="flex items-center justify-between text-xs bg-background-100 rounded px-2 py-1">
                          <span className="text-foreground-700 truncate">
                            {c?.title || `课程 #${cid}`}
                          </span>
                          <button
                            onClick={() => setLinkedCourseIds((prev) => prev.filter((id) => id !== cid))}
                            className="text-foreground-400 hover:text-red-500 ml-2 shrink-0"
                          >
                            <i className="ri-close-line"></i>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 bg-background-50 border-t border-background-200/70 px-5 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saveLoading || !form.title.trim()}
                className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap"
              >
                {saveLoading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ Course Picker Modal ============ */}
      {showCoursePicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCoursePicker(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-md max-h-[70vh] mx-4 flex flex-col">
            <div className="px-5 py-4 border-b border-background-200/70 flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-foreground-950 text-sm">选择关联课程</h3>
              <button
                onClick={() => setShowCoursePicker(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-1.5">
              {linkedCoursesLoading ? (
                <div className="flex justify-center py-8">
                  <i className="ri-loader-4-line animate-spin text-foreground-400"></i>
                </div>
              ) : allCourses.length === 0 ? (
                <p className="text-sm text-foreground-400 text-center py-8">暂无可选课程</p>
              ) : (
                allCourses.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-background-100 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={linkedCourseIds.includes(c.id)}
                      onChange={() => toggleCourse(c.id)}
                      className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-400"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground-800 truncate">{c.title}</p>
                      <p className="text-[11px] text-foreground-400">
                        {c.price === 0 ? "免费" : `¥${c.price}`}
                        {!c.is_published && " · 草稿"}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="px-5 py-3 border-t border-background-200/70 shrink-0 flex justify-end">
              <button
                onClick={() => setShowCoursePicker(false)}
                className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-all whitespace-nowrap"
              >
                确定 ({linkedCourseIds.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}