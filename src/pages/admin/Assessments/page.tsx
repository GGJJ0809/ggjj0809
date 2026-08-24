import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  type OptionItem,
  type QuestionInput,
  type ResultRuleInput,
  normalizeOptions,
  getQuestionMaxScore,
  getMaxPossibleScore,
} from "@/lib/assessmentScoring";

interface Assessment {
  id: number;
  title: string;
  description: string;
  cover_image: string;
  status: string;
  ai_enabled: boolean;
}

interface Question {
  id: number;
  assessment_id: number;
  question_text: string;
  question_type: string;
  options: OptionItem[] | string[];
  score: number;
  weight: number;
  sort_order: number;
}

interface ResultRule {
  id: number;
  assessment_id: number;
  min_score: number;
  max_score: number;
  title: string;
  description: string;
  sort_order: number;
}

const emptyAssessment = { title: "", description: "", cover_image: "", status: "draft", ai_enabled: false };
const emptyQuestion = { question_text: "", question_type: "single", options: [] as OptionItem[], score: 5, weight: 1.0, sort_order: 0 };
const emptyResult = { min_score: 0, max_score: 100, title: "", description: "", sort_order: 0 };

type QFormData = {
  question_text: string;
  question_type: string;
  options: OptionItem[];
  score: number;
  weight: number;
  sort_order: number;
};

export default function AssessmentsAdmin() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyAssessment);
  const [saveLoading, setSaveLoading] = useState(false);

  // Question/Result management view
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [results, setResults] = useState<ResultRule[]>([]);
  const [allQuestionCounts, setAllQuestionCounts] = useState<Record<number, number>>({});
  const [showQModal, setShowQModal] = useState(false);
  const [editingQId, setEditingQId] = useState<number | null>(null);
  const [qForm, setQForm] = useState<QFormData>(emptyQuestion);
  const [optionInput, setOptionInput] = useState("");
  const [optionScoreInput, setOptionScoreInput] = useState(5);
  const [showRModal, setShowRModal] = useState(false);
  const [editingRId, setEditingRId] = useState<number | null>(null);
  const [rForm, setRForm] = useState(emptyResult);

  const loadAssessments = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error: dbErr } = await supabase.from("assessments").select("*").order("created_at", { ascending: false });
      if (dbErr) throw dbErr;
      setAssessments(data || []);

      const { data: qCounts } = await supabase.from("assessment_questions").select("assessment_id");
      const counts: Record<number, number> = {};
      (qCounts || []).forEach((q: { assessment_id: number }) => {
        counts[q.assessment_id] = (counts[q.assessment_id] || 0) + 1;
      });
      setAllQuestionCounts(counts);
    } catch (err: any) {
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAssessments(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const openCreate = () => { setEditingId(null); setForm(emptyAssessment); setShowModal(true); };
  const openEdit = (a: Assessment) => {
    setEditingId(a.id);
    setForm({ title: a.title, description: a.description || "", cover_image: a.cover_image || "", status: a.status, ai_enabled: a.ai_enabled });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    try {
      setSaveLoading(true);
      const payload = { ...form, updated_at: new Date().toISOString() };
      if (editingId) await supabase.from("assessments").update(payload).eq("id", editingId);
      else await supabase.from("assessments").insert(payload);
      setShowModal(false);
      await loadAssessments();
      showToast(editingId ? "测评已更新" : "测评已创建");
    } catch (err: any) {
      showToast("保存失败: " + (err?.message || ""));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggleStatus = async (a: Assessment) => {
    const newStatus = a.status === "active" ? "draft" : "active";
    await supabase.from("assessments").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", a.id);
    await loadAssessments();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除该测评吗？")) return;
    await supabase.from("assessments").delete().eq("id", id);
    await loadAssessments();
    showToast("测评已删除");
  };

  const openConfig = async (a: Assessment) => {
    setEditingAssessment(a);
    const { data: qData } = await supabase.from("assessment_questions").select("*").eq("assessment_id", a.id).order("sort_order");
    const { data: rData } = await supabase.from("assessment_results").select("*").eq("assessment_id", a.id).order("sort_order");
    setQuestions(qData || []);
    setResults(rData || []);
    setEditingQId(null);
    setEditingRId(null);
    setQForm(emptyQuestion);
    setRForm(emptyResult);
    setOptionInput("");
    setOptionScoreInput(5);
  };

  const openQCreate = () => {
    setEditingQId(null);
    setQForm({ ...emptyQuestion, sort_order: questions.length + 1 });
    setOptionInput("");
    setOptionScoreInput(5);
    setShowQModal(true);
  };

  const openQEdit = (q: Question) => {
    setEditingQId(q.id);
    const normalizedOpts = normalizeOptions(q.options || []);
    setQForm({
      question_text: q.question_text,
      question_type: q.question_type,
      options: normalizedOpts,
      score: q.score,
      weight: q.weight,
      sort_order: q.sort_order,
    });
    setOptionInput("");
    setOptionScoreInput(5);
    setShowQModal(true);
  };

  const handleQSave = async () => {
    if (!qForm.question_text.trim() || !editingAssessment) return;
    const payload = { ...qForm, assessment_id: editingAssessment.id };
    if (editingQId) await supabase.from("assessment_questions").update(payload).eq("id", editingQId);
    else await supabase.from("assessment_questions").insert(payload);
    setShowQModal(false);
    await openConfig(editingAssessment!);
    showToast(editingQId ? "题目已更新" : "题目已创建");
  };

  const handleQDelete = async (id: number) => {
    await supabase.from("assessment_questions").delete().eq("id", id);
    await openConfig(editingAssessment!);
    showToast("题目已删除");
  };

  const addOption = () => {
    const text = optionInput.trim();
    if (!text) return;
    setQForm((prev) => ({
      ...prev,
      options: [...prev.options, { text, score: optionScoreInput }],
    }));
    setOptionInput("");
    setOptionScoreInput(5);
  };

  const updateOptionScore = (idx: number, newScore: number) => {
    setQForm((prev) => ({
      ...prev,
      options: prev.options.map((o, i) => (i === idx ? { ...o, score: newScore } : o)),
    }));
  };

  const removeOption = (idx: number) => {
    setQForm((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== idx),
    }));
  };

  // Result CRUD
  const openRCreate = () => {
    setEditingRId(null);
    setRForm({ ...emptyResult, sort_order: results.length + 1 });
    setShowRModal(true);
  };

  const openREdit = (r: ResultRule) => {
    setEditingRId(r.id);
    setRForm({ min_score: r.min_score, max_score: r.max_score, title: r.title, description: r.description || "", sort_order: r.sort_order });
    setShowRModal(true);
  };

  const handleRSave = async () => {
    if (!rForm.title.trim() || !editingAssessment) return;
    const payload = { ...rForm, assessment_id: editingAssessment.id };
    if (editingRId) await supabase.from("assessment_results").update(payload).eq("id", editingRId);
    else await supabase.from("assessment_results").insert(payload);
    setShowRModal(false);
    await openConfig(editingAssessment!);
    showToast(editingRId ? "结果规则已更新" : "结果规则已创建");
  };

  const handleRDelete = async (id: number) => {
    await supabase.from("assessment_results").delete().eq("id", id);
    await openConfig(editingAssessment!);
    showToast("结果规则已删除");
  };

  const updateField = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));
  const updateQField = (key: string, value: any) => setQForm((prev) => ({ ...prev, [key]: value }));
  const updateRField = (key: string, value: any) => setRForm((prev) => ({ ...prev, [key]: value }));

  if (loading) return <div className="p-6 md:p-8 flex items-center justify-center h-full"><i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i></div>;
  if (error) return <div className="p-6 md:p-8"><div className="flex flex-col items-center py-12"><p className="text-sm text-foreground-500 mb-4">{error}</p><button onClick={loadAssessments} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium whitespace-nowrap">重试</button></div></div>;

  // Config view for a specific assessment
  if (editingAssessment) {
    const maxScore = getMaxPossibleScore(questions as unknown as QuestionInput[]);

    return (
      <div className="p-6 md:p-8">
        {toast && <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm shadow-lg">{toast}</div>}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { setEditingAssessment(null); loadAssessments(); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all">
            <i className="ri-arrow-left-line"></i>
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-heading font-bold text-foreground-950">题库与结果配置</h1>
            <p className="text-sm text-foreground-500 mt-0.5">{editingAssessment.title}</p>
          </div>
        </div>

        {/* Scoring Overview */}
        <div className="bg-background-50 rounded-xl border border-background-200/70 p-5 mb-8">
          <h3 className="text-sm font-semibold text-foreground-950 mb-3 flex items-center gap-2">
            <i className="ri-bar-chart-2-line text-primary-500"></i>
            计分概览
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-background-100/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-foreground-950">{questions.length}</div>
              <div className="text-xs text-foreground-500 mt-0.5">题目总数</div>
            </div>
            <div className="bg-background-100/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-primary-500">{maxScore}</div>
              <div className="text-xs text-foreground-500 mt-0.5">满分上限</div>
            </div>
            <div className="bg-background-100/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-accent-500">{results.length}</div>
              <div className="text-xs text-foreground-500 mt-0.5">结果区间数</div>
            </div>
            <div className="bg-background-100/50 rounded-lg p-3 text-center">
              <div className={`text-2xl font-bold ${results.length > 0 ? "text-green-600" : "text-foreground-400"}`}>
                {results.length > 0 ? "就绪" : "待配"}
              </div>
              <div className="text-xs text-foreground-500 mt-0.5">匹配状态</div>
            </div>
          </div>
          {/* Score distribution visualization */}
          {results.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-foreground-500 mb-1.5">分数区间分布</div>
              <div className="relative h-8 rounded-lg bg-background-100 overflow-hidden flex">
                {(() => {
                  const sorted = [...results].sort((a, b) => a.min_score - b.min_score);
                  const totalRange = maxScore || 1;
                  return sorted.map((r, i) => {
                    const rangeWidth = ((r.max_score - r.min_score) / totalRange) * 100;
                    const colors = ["bg-primary-400", "bg-accent-400", "bg-green-400", "bg-orange-400", "bg-pink-400"];
                    return (
                      <div
                        key={r.id}
                        className={`${colors[i % colors.length]} h-full flex items-center justify-center text-[10px] text-white font-medium overflow-hidden whitespace-nowrap transition-all`}
                        style={{ width: `${Math.max(rangeWidth, 6)}%` }}
                        title={`${r.min_score}-${r.max_score}分: ${r.title}`}
                      >
                        {rangeWidth > 10 ? `${r.min_score}-${r.max_score}` : ""}
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {results.sort((a, b) => a.min_score - b.min_score).map((r, i) => {
                  const colors = ["bg-primary-100 text-primary-700", "bg-accent-100 text-accent-700", "bg-green-100 text-green-700", "bg-orange-100 text-orange-700", "bg-pink-100 text-pink-700"];
                  return (
                    <span key={r.id} className={`px-2 py-0.5 rounded text-[10px] font-medium ${colors[i % colors.length]}`}>
                      {r.min_score}-{r.max_score}分: {r.title}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Questions Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground-950">题目列表（{questions.length} 题）</h2>
            <button onClick={openQCreate} className="px-3 py-1.5 rounded-full bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 transition-all whitespace-nowrap">
              <i className="ri-add-line mr-1"></i>添加题目
            </button>
          </div>
          {questions.length === 0 ? (
            <div className="bg-background-50 rounded-xl border border-background-200/70 p-8 text-center text-sm text-foreground-400">还没有题目，点击上方按钮添加</div>
          ) : (
            <div className="space-y-2">
              {questions.map((q) => {
                const opts = normalizeOptions(q.options || []);
                const qMax = getQuestionMaxScore({ ...q, options: opts } as QuestionInput);
                return (
                  <div key={q.id} className="bg-background-50 rounded-xl border border-background-200/70 p-4 flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-medium text-foreground-400">#{q.sort_order}</span>
                        <span className="text-sm text-foreground-800">{q.question_text}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-background-100 text-foreground-500">
                          {q.question_type === "single" ? "单选" : q.question_type === "multiple" ? "多选" : "问答"}
                        </span>
                        <span className="text-[11px] text-primary-500 font-medium">
                          满分 {qMax}
                        </span>
                      </div>
                      {q.question_type === "text" ? (
                        <div className="text-xs text-foreground-400 mt-1">
                          基础分 {q.score} × 权重 {q.weight} = {qMax}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {opts.map((opt, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background-100 text-xs text-foreground-600">
                              {opt.text}
                              <span className="text-primary-500 font-semibold">{opt.score}分</span>
                            </span>
                          ))}
                          <span className="text-[11px] text-foreground-400 whitespace-nowrap">
                            × 权重 {q.weight}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-3 shrink-0">
                      <button onClick={() => openQEdit(q)} className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"><i className="ri-edit-line text-sm"></i></button>
                      <button onClick={() => handleQDelete(q.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all"><i className="ri-delete-bin-line text-sm"></i></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Results Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground-950">结果匹配规则（{results.length} 条）</h2>
            <button onClick={openRCreate} className="px-3 py-1.5 rounded-full bg-accent-500 text-white text-xs font-medium hover:bg-accent-600 transition-all whitespace-nowrap">
              <i className="ri-add-line mr-1"></i>添加规则
            </button>
          </div>
          {results.length === 0 ? (
            <div className="bg-background-50 rounded-xl border border-background-200/70 p-8 text-center text-sm text-foreground-400">还没有结果规则</div>
          ) : (
            <div className="space-y-2">
              {results.map((r) => (
                <div key={r.id} className="bg-background-50 rounded-xl border border-background-200/70 p-4 flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded bg-secondary-100 text-secondary-700 text-[11px] font-medium">{r.min_score}-{r.max_score} 分</span>
                      <span className="font-medium text-foreground-800 text-sm">{r.title}</span>
                    </div>
                    <p className="text-xs text-foreground-500">{r.description}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-3 shrink-0">
                    <button onClick={() => openREdit(r)} className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"><i className="ri-edit-line text-sm"></i></button>
                    <button onClick={() => handleRDelete(r.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all"><i className="ri-delete-bin-line text-sm"></i></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Question Modal */}
        {showQModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowQModal(false)}></div>
            <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-lg max-h-[85vh] overflow-y-auto mx-4">
              <div className="sticky top-0 bg-background-50 border-b border-background-200/70 px-5 py-4 flex items-center justify-between z-10">
                <h3 className="font-semibold text-foreground-950">{editingQId ? "编辑题目" : "添加题目"}</h3>
                <button onClick={() => setShowQModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"><i className="ri-close-line"></i></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">题目内容 <span className="text-red-400">*</span></label>
                  <textarea value={qForm.question_text} onChange={(e) => updateQField("question_text", e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">题型</label>
                    <select value={qForm.question_type} onChange={(e) => { updateQField("question_type", e.target.value); if (e.target.value === "text") setQForm((prev) => ({ ...prev, options: [] })); }} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm">
                      <option value="single">单选（选一个选项得分）</option>
                      <option value="multiple">多选（累加所有选中选项得分）</option>
                      <option value="text">问答（使用基础分）</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">排序</label>
                    <input type="number" value={qForm.sort_order} onChange={(e) => updateQField("sort_order", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
                  </div>
                </div>

                {qForm.question_type === "text" ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground-500 mb-1">基础分值</label>
                      <input type="number" value={qForm.score} onChange={(e) => updateQField("score", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-500 mb-1">权重</label>
                      <input type="number" value={qForm.weight} onChange={(e) => updateQField("weight", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" step="0.1" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-foreground-500 mb-1">权重（所有选项得分 × 此系数）</label>
                      <input type="number" value={qForm.weight} onChange={(e) => updateQField("weight", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" step="0.1" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-500 mb-1">选项（带分值）</label>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={optionInput}
                          onChange={(e) => setOptionInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
                          className="flex-1 px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                          placeholder="选项文本"
                        />
                        <input
                          type="number"
                          value={optionScoreInput}
                          onChange={(e) => setOptionScoreInput(Number(e.target.value))}
                          className="w-20 px-2 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm text-center"
                          min="0"
                          title="分值"
                        />
                        <button onClick={addOption} className="px-3 py-2 rounded-lg bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 transition-all whitespace-nowrap">添加</button>
                      </div>
                      {qForm.options.length > 0 ? (
                        <div className="space-y-1.5">
                          {qForm.options.map((opt, i) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background-100">
                              <span className="flex-1 text-xs text-foreground-700 truncate">{opt.text}</span>
                              <input
                                type="number"
                                value={opt.score}
                                onChange={(e) => updateOptionScore(i, Number(e.target.value))}
                                className="w-16 px-2 py-1 rounded border border-background-200 bg-background-50 text-xs text-center"
                                min="0"
                              />
                              <span className="text-[10px] text-foreground-400">分</span>
                              <button onClick={() => removeOption(i)} className="w-6 h-6 rounded flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"><i className="ri-close-line text-sm"></i></button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-foreground-400 mt-2">至少添加一个选项，并设置每个选项的分值</p>
                      )}
                      {qForm.options.length > 0 && (
                        <p className="text-[11px] text-foreground-500 mt-2">
                          {qForm.question_type === "single"
                            ? `单选：用户选中某个选项得对应分 × 权重${qForm.weight}`
                            : `多选：用户选中的所有选项得分累加 × 权重${qForm.weight}`}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="sticky bottom-0 bg-background-50 border-t border-background-200/70 px-5 py-4 flex justify-end gap-3">
                <button onClick={() => setShowQModal(false)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">取消</button>
                <button onClick={handleQSave} disabled={!qForm.question_text.trim()} className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap">保存</button>
              </div>
            </div>
          </div>
        )}

        {/* Result Modal */}
        {showRModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowRModal(false)}></div>
            <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-md mx-4">
              <div className="px-5 py-4 border-b border-background-200/70 flex items-center justify-between">
                <h3 className="font-semibold text-foreground-950">{editingRId ? "编辑结果规则" : "添加结果规则"}</h3>
                <button onClick={() => setShowRModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"><i className="ri-close-line"></i></button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs text-foreground-400">当前满分上限为 <span className="font-semibold text-primary-500">{maxScore}</span> 分，区间应覆盖 0 ~ {maxScore}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">最低分</label>
                    <input type="number" value={rForm.min_score} onChange={(e) => updateRField("min_score", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">最高分</label>
                    <input type="number" value={rForm.max_score} onChange={(e) => updateRField("max_score", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">结果标题 <span className="text-red-400">*</span></label>
                  <input type="text" value={rForm.title} onChange={(e) => updateRField("title", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="影响力新手" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">结果描述</label>
                  <textarea value={rForm.description} onChange={(e) => updateRField("description", e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">排序</label>
                  <input type="number" value={rForm.sort_order} onChange={(e) => updateRField("sort_order", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
                </div>
              </div>
              <div className="px-5 py-4 border-t border-background-200/70 flex justify-end gap-3">
                <button onClick={() => setShowRModal(false)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">取消</button>
                <button onClick={handleRSave} disabled={!rForm.title.trim()} className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap">保存</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {toast && <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm shadow-lg">{toast}</div>}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground-950">Q库评管理</h1>
          <p className="mt-1 text-sm text-foreground-500">管理测评题库、匹配规则和结果模板</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-all whitespace-nowrap">
          <i className="ri-add-line mr-1.5"></i>新建测评
        </button>
      </div>

      <div className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500">问答名称</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500">题目数</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500">AI分析</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500">状态</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((a) => (
                <tr key={a.id} className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground-900 text-sm">{a.title}</p>
                    <p className="text-[11px] text-foreground-400 line-clamp-1">{a.description}</p>
                  </td>
                  <td className="px-4 py-3 text-foreground-500 text-sm">
                    {allQuestionCounts[a.id] ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    {a.ai_enabled ? <span className="text-primary-500 text-xs font-medium">已开启</span> : <span className="text-foreground-400 text-xs">关闭</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggleStatus(a)} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${a.status === "active" ? "bg-primary-100 text-primary-700 hover:bg-primary-200" : "bg-background-200 text-foreground-500 hover:bg-background-300"}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${a.status === "active" ? "bg-primary-500" : "bg-foreground-300"}`}></div>
                      {a.status === "active" ? "已发布" : "草稿"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openConfig(a)} className="px-3 py-1.5 rounded-full bg-secondary-100 text-secondary-700 text-xs font-medium hover:bg-secondary-200 transition-all whitespace-nowrap">题库配置</button>
                      <button onClick={() => openEdit(a)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"><i className="ri-edit-line"></i></button>
                      <button onClick={() => handleDelete(a.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all"><i className="ri-delete-bin-line"></i></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assessment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-background-200/70 flex items-center justify-between">
              <h3 className="font-semibold text-foreground-950">{editingId ? "编辑测评" : "新建测评"}</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"><i className="ri-close-line"></i></button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="block text-xs font-medium text-foreground-500 mb-1">测评名称 <span className="text-red-400">*</span></label><input type="text" value={form.title} onChange={(e) => updateField("title", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" /></div>
              <div><label className="block text-xs font-medium text-foreground-500 mb-1">描述</label><textarea value={form.description} onChange={(e) => updateField("description", e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm resize-none" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-foreground-500 mb-1">状态</label><select value={form.status} onChange={(e) => updateField("status", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"><option value="draft">草稿</option><option value="active">已发布</option></select></div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.ai_enabled} onChange={(e) => updateField("ai_enabled", e.target.checked)} className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-400" />
                    <span className="text-xs text-foreground-600">启用 AI 分析</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-background-200/70 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">取消</button>
              <button onClick={handleSave} disabled={saveLoading || !form.title.trim()} className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap">{saveLoading ? "保存中..." : "保存"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}