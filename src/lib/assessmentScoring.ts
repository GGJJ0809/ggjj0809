/**
 * 测评计分计算工具
 *
 * 计分逻辑：
 * - 单选/多选：得分 = Σ(选中选项分值 × 题目权重)
 * - 问答题：得分 = 题目基础分值 × 权重
 * - 总分上限由所有题目的最大可能得分决定
 * - 结果匹配：总分落在 [min_score, max_score] 区间内
 */

export interface OptionItem {
  text: string;
  score: number;
}

export interface QuestionInput {
  id?: number;
  question_text: string;
  question_type: "single" | "multiple" | "text";
  options: OptionItem[] | string[];
  score: number;
  weight: number;
  sort_order: number;
}

export interface ResultRuleInput {
  id?: number;
  min_score: number;
  max_score: number;
  title: string;
  description: string;
  sort_order: number;
}

export interface Answer {
  questionIndex: number;
  selectedOptionIndices: number[];
  textAnswer?: string;
}

export interface ScoringResult {
  totalScore: number;
  maxPossibleScore: number;
  details: {
    questionIndex: number;
    questionText: string;
    selectedOptions: string[];
    rawScore: number;
    weight: number;
    weightedScore: number;
  }[];
  matchedResult: ResultRuleInput | null;
}

/** 标准化选项为 OptionItem[]，兼容旧的 string[] 格式 */
export function normalizeOptions(options: OptionItem[] | string[]): OptionItem[] {
  if (!options || !Array.isArray(options)) return [];
  return options.map((opt) => {
    if (typeof opt === "string") return { text: opt, score: 0 };
    return opt;
  });
}

/** 计算单个题目的最大可能得分（用于展示满分参考） */
export function getQuestionMaxScore(q: QuestionInput): number {
  const weight = q.weight || 1;
  if (q.question_type === "text") {
    return (q.score || 0) * weight;
  }
  const opts = normalizeOptions(q.options);
  if (opts.length === 0) return 0;
  if (q.question_type === "single") {
    return Math.max(...opts.map((o) => o.score || 0)) * weight;
  }
  // multiple: sum of all option scores
  return opts.reduce((sum, o) => sum + (o.score || 0), 0) * weight;
}

/** 计算整套题目的最大可能总分 */
export function getMaxPossibleScore(questions: QuestionInput[]): number {
  return questions.reduce((sum, q) => sum + getQuestionMaxScore(q), 0);
}

/** 根据用户答案计算总分 */
export function calculateScore(
  questions: QuestionInput[],
  answers: Answer[]
): Omit<ScoringResult, "matchedResult"> {
  let totalScore = 0;
  const details: ScoringResult["details"] = [];
  const maxPossibleScore = getMaxPossibleScore(questions);

  answers.forEach((answer) => {
    const q = questions[answer.questionIndex];
    if (!q) return;

    let rawScore = 0;

    if (q.question_type === "text") {
      rawScore = q.score || 0;
    } else {
      const opts = normalizeOptions(q.options);
      answer.selectedOptionIndices.forEach((idx) => {
        if (idx >= 0 && idx < opts.length) {
          rawScore += opts[idx].score || 0;
        }
      });
    }

    const weight = q.weight || 1;
    const weightedScore = Math.round(rawScore * weight * 100) / 100;

    totalScore += weightedScore;

    const selectedOptions = q.question_type === "text"
      ? [answer.textAnswer || "(文字回答)"]
      : answer.selectedOptionIndices.map((idx) => {
          const opts = normalizeOptions(q.options);
          return opts[idx]?.text || `选项${idx + 1}`;
        });

    details.push({
      questionIndex: answer.questionIndex,
      questionText: q.question_text,
      selectedOptions,
      rawScore,
      weight,
      weightedScore,
    });
  });

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    maxPossibleScore,
    details,
  };
}

/** 根据总分匹配结果规则 */
export function matchResult(
  totalScore: number,
  results: ResultRuleInput[]
): ResultRuleInput | null {
  if (!results || results.length === 0) return null;
  const sorted = [...results].sort((a, b) => a.min_score - b.min_score);
  for (const rule of sorted) {
    if (totalScore >= rule.min_score && totalScore <= rule.max_score) {
      return rule;
    }
  }
  // 兜底：返回最近的区间
  return sorted[sorted.length - 1] || null;
}

/** 一站式计算：传入题目、答案、结果规则，返回完整结果 */
export function fullScoring(
  questions: QuestionInput[],
  answers: Answer[],
  results: ResultRuleInput[]
): ScoringResult {
  const { totalScore, maxPossibleScore, details } = calculateScore(questions, answers);
  const matchedResult = matchResult(totalScore, results);
  return { totalScore, maxPossibleScore, details, matchedResult };
}