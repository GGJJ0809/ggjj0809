import { useState } from "react";
import type { ComplianceQuestion } from "@/mocks/compliance";

export type AnswerValue = "符合" | "部分符合" | "不符合";

interface QuestionnaireProps {
  questions: ComplianceQuestion[];
  answers: Record<number, AnswerValue>;
  onAnswer: (id: number, value: AnswerValue) => void;
}

const options: { value: AnswerValue; className: string }[] = [
  { value: "符合", className: "bg-secondary-100 text-secondary-900 border-secondary-300" },
  { value: "部分符合", className: "bg-primary-100 text-primary-700 border-primary-300" },
  { value: "不符合", className: "bg-accent-100 text-accent-900 border-accent-300" },
];

export default function Questionnaire({ questions, answers, onAnswer }: QuestionnaireProps) {
  const [current, setCurrent] = useState(0);

  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const question = questions[current];

  return (
    <div className="flex h-full flex-col rounded-lg border border-background-200 bg-background-50">
      <div className="border-b border-background-200 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-heading text-base font-bold">合规自检问卷</h3>
            <p className="text-xs text-foreground-500">逐项作答，生成差距报告</p>
          </div>
          <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700">
            {answeredCount} / {questions.length}
          </span>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background-100">
          <div
            className="h-full rounded-full bg-primary-500 transition-all"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-md bg-background-100 px-2 py-1 text-[11px] font-medium text-foreground-600">
            {question.category}
          </span>
          <span className="text-xs text-foreground-400">
            第 {current + 1} 题 / 共 {questions.length} 题
          </span>
        </div>

        <p className="text-sm font-medium leading-relaxed text-foreground-900">{question.question}</p>

        <div className="mt-6 space-y-2">
          {options.map((opt) => {
            const isActive = answers[question.id] === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onAnswer(question.id, opt.value)}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors ${
                  isActive ? opt.className : "border-background-200 bg-background-50 text-foreground-700 hover:bg-background-100"
                }`}
              >
                <span>{opt.value}</span>
                {isActive && <i className="ri-check-line" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-background-200 px-5 py-4">
        <button
          type="button"
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-foreground-600 hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <i className="ri-arrow-left-line mr-1" />
          上一题
        </button>
        {current < questions.length - 1 ? (
          <button
            type="button"
            onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
            className="whitespace-nowrap rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-background-50 hover:bg-primary-600"
          >
            下一题
            <i className="ri-arrow-right-line ml-1" />
          </button>
        ) : (
          <span className="whitespace-nowrap rounded-md bg-secondary-100 px-4 py-2 text-sm font-medium text-secondary-900">
            已到最后一项
          </span>
        )}
      </div>
    </div>
  );
}