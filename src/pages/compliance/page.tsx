import { useState } from "react";
import { complianceQuestions } from "@/mocks/compliance";
import ComplianceStats from "./components/ComplianceStats";
import RegulationSearch from "./components/RegulationSearch";
import Questionnaire from "./components/Questionnaire";
import type { AnswerValue } from "./components/Questionnaire";
import GapReport from "./components/GapReport";

export default function Compliance() {
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});

  const handleAnswer = (id: number, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  return (
    <div className="space-y-4">
      <ComplianceStats />

      <RegulationSearch />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="h-[520px]">
          <Questionnaire questions={complianceQuestions} answers={answers} onAnswer={handleAnswer} />
        </div>
        <div className="h-[520px]">
          <GapReport questions={complianceQuestions} answers={answers} />
        </div>
      </div>
    </div>
  );
}