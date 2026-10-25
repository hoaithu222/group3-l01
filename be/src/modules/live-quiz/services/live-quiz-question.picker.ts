import { LIMITS } from "../../../core/constants/limits";
import type { StudyItem } from "../../study/public";
import type { StoredQuestion } from "../entities/live-quiz.interface";

/** Câu hỏi đủ điều kiện làm câu live: trắc nghiệm MỘT đáp án đúng (P0 bỏ FILL_BLANK/MULTI_SELECT/TRUE_FALSE — README §1). */
export interface EligibleQuestion {
  item: StudyItem;
  correctIndex: number;
}

export function eligibleQuestions(items: readonly StudyItem[]): EligibleQuestion[] {
  const out: EligibleQuestion[] = [];
  for (const item of items) {
    if (item.type !== "MULTIPLE_CHOICE" || item.prompt.trim() === "") continue;
    if (item.options.length < LIMITS.study.optionsMin || item.options.length > LIMITS.study.optionsMax) continue;
    if (item.correctOptionIds.length !== 1) continue;
    const correctIndex = item.options.findIndex((o) => o.id === item.correctOptionIds[0]);
    if (correctIndex < 0) continue;
    out.push({ item, correctIndex });
  }
  return out;
}

/** Chọn `count` câu (Fisher–Yates khi `shuffle`, còn không giữ thứ tự bộ). `rng` tiêm được để test tất định. */
export function pickQuestions(pool: readonly EligibleQuestion[], count: number, shuffle: boolean, rng: () => number = Math.random): EligibleQuestion[] {
  const arr = [...pool];
  if (shuffle) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  return arr.slice(0, Math.max(0, count));
}

export function toStoredQuestion(q: EligibleQuestion): StoredQuestion {
  return {
    itemId: q.item.id,
    prompt: q.item.prompt,
    options: q.item.options.map((o) => ({ text: o.text, mediaAssetId: o.mediaAssetId })),
    explanation: q.item.explanation,
  };
}

/** Giá trị trong hash `correct`: `<chỉ số đáp án đúng>:<số lựa chọn>` — `answer.lua` kiểm `choice` trong khoảng mà không cần đọc câu hỏi. */
export function encodeCorrect(correctIndex: number, optionCount: number): string {
  return `${correctIndex}:${optionCount}`;
}

export function decodeCorrect(raw: string): { correctIndex: number; optionCount: number } | null {
  const [c, n] = raw.split(":");
  const correctIndex = Number(c);
  const optionCount = Number(n);
  return Number.isInteger(correctIndex) && Number.isInteger(optionCount) ? { correctIndex, optionCount } : null;
}
