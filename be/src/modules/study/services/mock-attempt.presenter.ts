import type { MockAnswer, MockAttempt, MockQuestion, MockTagScore } from "../entities/mock.interface";
import { toPublicQuestion, type MockQuestionPublic } from "./mock-question-picker";

/**
 * DTO thi thử — whitelist từng trường (không spread snapshot). Đề CHƯA nộp chỉ đi qua `toPublicQuestion` (không đáp án/giải thích);
 * chỉ `MockResultDto` (lượt đã kết thúc, của chính chủ) mới có `correctOptionIds`, `acceptedAnswers`, `explanation`.
 */
export interface MockAttemptDto {
  id: string;
  setId: string;
  setTitle: string;
  status: MockAttempt["status"];
  submitMode: MockAttempt["submitMode"];
  durationSec: number;
  passPct: number;
  shuffle: boolean;
  total: number;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  answeredCount: number;
  /** Chỉ có sau khi kết thúc. */
  correctCount: number | null;
  scorePct: number | null;
  passed: boolean | null;
  byTag: MockTagScore[];
  backgroundCount: number;
  backgroundMs: number;
}

export function toAttemptDto(a: MockAttempt): MockAttemptDto {
  const finished = a.status !== "IN_PROGRESS";
  return {
    id: a.id,
    setId: a.setId,
    setTitle: a.setTitle,
    status: a.status,
    submitMode: a.submitMode,
    durationSec: a.config.durationSec,
    passPct: a.config.passPct,
    shuffle: a.config.shuffle,
    total: a.questions.length,
    startedAt: a.startedAt.toISOString(),
    expiresAt: a.expiresAt.toISOString(),
    submittedAt: a.submittedAt ? a.submittedAt.toISOString() : null,
    answeredCount: a.answeredCount,
    correctCount: finished ? a.correctCount : null,
    scorePct: finished ? a.scorePct : null,
    passed: finished ? a.passed : null,
    byTag: finished ? a.byTag : [],
    backgroundCount: a.backgroundCount,
    backgroundMs: a.backgroundMs,
  };
}

export interface MockAttemptSummaryDto {
  id: string;
  setId: string;
  setTitle: string;
  status: MockAttempt["status"];
  submitMode: MockAttempt["submitMode"];
  scorePct: number | null;
  passed: boolean | null;
  correctCount: number | null;
  total: number;
  startedAt: string;
  submittedAt: string | null;
}

export function toSummaryDto(a: MockAttempt): MockAttemptSummaryDto {
  const finished = a.status !== "IN_PROGRESS";
  return {
    id: a.id,
    setId: a.setId,
    setTitle: a.setTitle,
    status: a.status,
    submitMode: a.submitMode,
    scorePct: finished ? a.scorePct : null,
    passed: finished ? a.passed : null,
    correctCount: finished ? a.correctCount : null,
    total: a.questions.length,
    startedAt: a.startedAt.toISOString(),
    submittedAt: a.submittedAt ? a.submittedAt.toISOString() : null,
  };
}

export interface MockMyAnswerDto {
  itemId: string;
  optionIds: string[];
  text: string | null;
}

export const toMyAnswerDto = (a: MockAnswer): MockMyAnswerDto => ({ itemId: a.itemId, optionIds: a.optionIds, text: a.text });

export interface MockInProgressDto {
  attempt: MockAttemptDto;
  questions: MockQuestionPublic[];
  myAnswers: MockMyAnswerDto[];
  serverNow: string;
}

export function toInProgressDto(a: MockAttempt, answers: readonly MockAnswer[], now: Date): MockInProgressDto {
  return {
    attempt: toAttemptDto(a),
    questions: a.questions.map((q, i) => toPublicQuestion(q, i)),
    myAnswers: answers.map(toMyAnswerDto),
    serverNow: now.toISOString(),
  };
}

export interface MockResultQuestionDto {
  index: number;
  itemId: string;
  type: MockQuestion["type"];
  prompt: string;
  options: Array<{ id: string; text: string; mediaAssetId: string | null }>;
  frontMediaAssetId: string | null;
  correctOptionIds: string[];
  acceptedAnswers: string[];
  explanation: string | null;
  tags: string[];
  myAnswer: MockMyAnswerDto | null;
  correct: boolean;
  partial: number | null;
}

export interface MockResultDto {
  attempt: MockAttemptDto;
  questions: MockResultQuestionDto[];
  serverNow: string;
  /** `true` khi lúc nộp có gửi kèm đáp án nhưng đã quá hạn nhận — chỉ chấm phần đã lưu. */
  lateAnswersIgnored?: boolean;
}

/** Kết quả đầy đủ (kèm đáp án đúng + giải thích) — CHỈ cho lượt ĐÃ kết thúc của chính chủ. `correct` lấy từ kết quả chấm đã lưu. */
export function toResultDto(a: MockAttempt, answers: readonly MockAnswer[], now: Date): MockResultDto {
  const byItem = new Map(answers.map((x) => [x.itemId, x]));
  return {
    attempt: toAttemptDto(a),
    questions: a.questions.map((q, index) => {
      const mine = byItem.get(q.itemId);
      return {
        index,
        itemId: q.itemId,
        type: q.type,
        prompt: q.prompt,
        options: q.options.map((o) => ({ id: o.id, text: o.text, mediaAssetId: o.mediaAssetId })),
        frontMediaAssetId: q.frontMediaAssetId,
        correctOptionIds: q.correctOptionIds,
        acceptedAnswers: q.acceptedAnswers,
        explanation: q.explanation,
        tags: q.tags,
        myAnswer: mine ? toMyAnswerDto(mine) : null,
        correct: mine?.correct === true,
        partial: mine?.partial ?? null,
      };
    }),
    serverNow: now.toISOString(),
  };
}
