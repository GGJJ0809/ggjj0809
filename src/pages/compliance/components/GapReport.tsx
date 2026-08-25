import { useMemo } from "react";
import type { ComplianceQuestion } from "@/mocks/compliance";
import type { AnswerValue } from "./Questionnaire";

interface GapReportProps {
  questions: ComplianceQuestion[];
  answers: Record<number, AnswerValue>;
}

const scoreMap: Record<AnswerValue, number> = {
  符合: 1,
  部分符合: 0.5,
  不符合: 0,
};

export default function GapReport({ questions, answers }: GapReportProps) {
  const report = useMemo(() => {
    const answered = questions.filter((q) => answers[q.id]);
    const totalWeight = answered.reduce((sum, q) => sum + q.weight, 0);
    const score =
      totalWeight === 0
        ? 0
        : Math.round(
            (answered.reduce((sum, q) => sum + q.weight * scoreMap[answers[q.id]], 0) / totalWeight) * 100
          );

    const gaps = questions
      .filter((q) => answers[q.id] && answers[q.id] !== "符合")
      .map((q) => ({ ...q, answer: answers[q.id] }));

    const byCategory: Record<string, { total: number; score: number }> = {};
    questions.forEach((q) => {
      if (!answers[q.id]) return;
      const cat = byCategory[q.category] ?? { total: 0, score: 0 };
      cat.total += q.weight;
      cat.score += q.weight * scoreMap[answers[q.id]];
      byCategory[q.category] = cat;
    });

    return { score, gaps, answeredCount: answered.length, byCategory };
  }, [questions, answers]);

  const level =
    report.score >= 80
      ? { label: "合规良好", className: "bg-secondary-100 text-secondary-900" }
      : report.score >= 50
        ? { label: "存在差距", className: "bg-primary-100 text-primary-700" }
        : { label: "风险较高", className: "bg-accent-100 text-accent-900" };

  return (
    <div className="flex h-full flex-col rounded-lg border border-background-200 bg-background-50">
      <div className="border-b border-background-200 px-5 py-4">
        <h3 className="font-heading text-base font-bold">合规差距报告</h3>
        <p className="text-xs text-foreground-500">基于问卷作答实时生成</p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className="flex items-center gap-4">
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
            <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
              <circle cx="18" cy="18" r="16" fill="none" strokeWidth="3" className="stroke-background-100" />
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                className="stroke-primary-500 transition-all"
                strokeDasharray={`${(report.score / 100) * 100.5} 100.5`}
              />
            </svg>
            <span className="absolute font-heading text-xl font-bold text-foreground-900">{report.score}</span>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground-900">综合合规评分</p>
            <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${level.className}`}>
              {level.label}
            </span>
            <p className="mt-1 text-xs text-foreground-500">已作答 {report.answeredCount} / {questions.length} 项</p>
          </div>
        </div>

        {Object.keys(report.byCategory).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground-600">分类评分</p>
            {Object.entries(report.byCategory).map(([cat, val]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs text-foreground-600">{cat}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background-100">
                  <div
                    className="h-full rounded-full bg-primary-500"
                    style={{ width: `${Math.round((val.score / val.total) * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-medium text-foreground-700">
                  {Math.round((val.score / val.total) * 100)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium text-foreground-600">
            待改进差距项（{report.gaps.length}）
          </p>
          {report.gaps.length === 0 ? (
            <div className="rounded-lg bg-background-100/60 px-4 py-6 text-center text-xs text-foreground-500">
              暂未发现差距项，请先完成问卷作答
            </div>
          ) : (
            <div className="space-y-2">
              {report.gaps.map((g) => (
                <div key={g.id} className="flex items-start gap-2 rounded-lg border border-background-200 bg-background-50 p-3">
                  <i
                    className={`ri-alert-line mt-0.5 text-sm ${
                      g.answer === "不符合" ? "text-accent-500" : "text-primary-500"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-xs leading-relaxed text-foreground-800">{g.question}</p>
                    <span className="mt-1 inline-block rounded-full bg-background-100 px-2 py-0.5 text-[10px] text-foreground-500">
                      当前：{g.answer}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}