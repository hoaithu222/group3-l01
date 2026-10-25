/**
 * Dựng MỘT lượt thi thử đã nộp đúng như `MockAttemptService.create` + `MockGradingService.finalize` ghi: snapshot câu hỏi (`pickQuestions`), đáp án người thi,
 * chấm bằng `scoreAttempt` (cùng `gradeAnswer` của app) nên `correct/partial`, `correctCount`, `scorePct`, `passed`, `byTag` luôn khớp đáp án thật của từng câu.
 */
import { newObjectId } from "../../../../src/core/utils/object-id";
import type { StudyItem, StudyItemTypeValue, FillMatchModeValue } from "../../../../src/modules/study/entities/study-item.interface";
import { doneKeyOf, type MockQuestion, type MockTagScore } from "../../../../src/modules/study/entities/mock.interface";
import { pickQuestions } from "../../../../src/modules/study/services/mock-question-picker";
import { scoreAttempt } from "../../../../src/modules/study/services/mock-scoring";
import type { MockPlan } from "./study-progress.content";

export interface ItemRow {
  id: string;
  setId: string;
  ownerId: string;
  type: string;
  prompt: string;
  answerText: string | null;
  options: Array<{ id: string; text: string; mediaAssetId: string | null }>;
  correctOptionIds: string[];
  acceptedAnswers: string[];
  matchMode: string;
  explanation: string | null;
  tags: string[];
  order: number;
  createdAt: Date;
}

export const toStudyItem = (r: ItemRow): StudyItem => ({
  id: r.id,
  setId: r.setId,
  ownerId: r.ownerId,
  type: r.type as StudyItemTypeValue,
  prompt: r.prompt,
  answerText: r.answerText,
  options: r.options.map((o) => ({ id: o.id, text: o.text, mediaAssetId: o.mediaAssetId ?? null })),
  correctOptionIds: r.correctOptionIds,
  acceptedAnswers: r.acceptedAnswers,
  matchMode: r.matchMode as FillMatchModeValue,
  explanation: r.explanation,
  frontMediaAssetId: null,
  backMediaAssetId: null,
  audioAssetId: null,
  tags: r.tags,
  order: r.order,
  version: 1,
  createdAt: r.createdAt,
  updatedAt: r.createdAt,
});

export interface BuiltAnswer {
  itemId: string;
  optionIds: string[];
  text: string | null;
  timeMs: number;
  correct: boolean;
  partial: number | null;
  answeredAt: Date;
}

export interface BuiltAttempt {
  id: string;
  questions: MockQuestion[];
  config: { count: number; durationSec: number; shuffle: boolean; passPct: number };
  status: "SUBMITTED" | "EXPIRED";
  submitMode: "MANUAL" | "AUTO";
  startedAt: Date;
  expiresAt: Date;
  submittedAt: Date;
  answeredCount: number;
  correctCount: number;
  scorePct: number;
  passed: boolean;
  byTag: MockTagScore[];
  backgroundCount: number;
  backgroundMs: number;
  eventCount: number;
  answers: BuiltAnswer[];
  wrongItemIds: string[];
  activeKey: string;
}

/**
 * `submittedAt` là mốc nộp mong muốn; thời gian làm bài suy ra từ `plan`. Lượt `auto` hết giờ rồi hệ thống nộp hộ sau vài giây (job `mock-attempt.expire`),
 * phần cuối đề bỏ trống.
 */
export function buildAttempt(plan: MockPlan, items: readonly ItemRow[], submittedAtWanted: Date, rng: () => number): BuiltAttempt | null {
  const entities = items.map(toStudyItem);
  const random = (max: number): number => Math.floor(rng() * max);
  const questions = pickQuestions(entities, { count: plan.count, shuffle: true, random });
  if (questions.length === 0) return null;

  const durationSec = plan.durationMin * 60;
  const usedSec = plan.auto ? durationSec : Math.floor(durationSec * (0.55 + rng() * 0.38));
  const startedAt = new Date(submittedAtWanted.getTime() - (plan.auto ? durationSec + 8 : usedSec) * 1000);
  const expiresAt = new Date(startedAt.getTime() + durationSec * 1000);
  const submittedAt = plan.auto ? new Date(expiresAt.getTime() + (5 + random(8)) * 1000) : submittedAtWanted;

  const fillPool = entities.filter((i) => i.type === "FILL_BLANK").flatMap((i) => i.acceptedAnswers);
  const answers: Array<{ itemId: string; optionIds: string[]; text: string | null; timeMs: number; answeredAt: Date }> = [];
  let clock = startedAt.getTime();
  const answerableUntil = plan.auto ? Math.ceil(questions.length * 0.62) : questions.length;
  questions.forEach((q, i) => {
    if (i >= answerableUntil || rng() < 0.03) return; // bỏ trống
    const knows = rng() < plan.skill;
    const timeMs = (q.type === "FILL_BLANK" ? 12_000 : 6_000) + random(q.type === "FILL_BLANK" ? 40_000 : 30_000);
    clock = Math.min(clock + timeMs, expiresAt.getTime() - 1000);
    if (q.type === "FILL_BLANK") {
      const right = q.acceptedAnswers[0] ?? "";
      const wrong = fillPool.filter((a) => !q.acceptedAnswers.includes(a));
      const text = knows ? (rng() < 0.2 ? right.toUpperCase() : right) : (wrong.length > 0 ? wrong[random(wrong.length)] : "chưa nhớ");
      answers.push({ itemId: q.itemId, optionIds: [], text, timeMs, answeredAt: new Date(clock) });
      return;
    }
    const wrongIds = q.options.map((o) => o.id).filter((id) => !q.correctOptionIds.includes(id));
    const picked = knows || wrongIds.length === 0 ? q.correctOptionIds : [wrongIds[random(wrongIds.length)]];
    answers.push({ itemId: q.itemId, optionIds: [...picked], text: null, timeMs, answeredAt: new Date(clock) });
  });

  const score = scoreAttempt(questions, answers.map((a) => ({ itemId: a.itemId, optionIds: a.optionIds, text: a.text })), plan.passPct);
  const byItem = new Map(score.results.map((r) => [r.itemId, r]));
  const backgrounds = plan.backgrounds ?? 0;
  const id = newObjectId();
  return {
    id,
    questions,
    config: { count: questions.length, durationSec, shuffle: true, passPct: plan.passPct },
    status: plan.auto ? "EXPIRED" : "SUBMITTED",
    submitMode: plan.auto ? "AUTO" : "MANUAL",
    startedAt,
    expiresAt,
    submittedAt,
    answeredCount: score.answeredCount,
    correctCount: score.correctCount,
    scorePct: score.scorePct,
    passed: score.passed,
    byTag: score.byTag,
    backgroundCount: backgrounds,
    backgroundMs: backgrounds * (6_000 + random(30_000)),
    // Mỗi lần rời app ghi 2 sự kiện (rời + quay lại).
    eventCount: backgrounds * 2,
    answers: answers.map((a) => {
      const r = byItem.get(a.itemId);
      return { ...a, correct: r?.correct ?? false, partial: r?.partial ?? null };
    }),
    wrongItemIds: score.results.filter((r) => !r.correct).map((r) => r.itemId),
    activeKey: doneKeyOf(id),
  };
}
