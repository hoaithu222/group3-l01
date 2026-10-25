import { randomInt } from "crypto";
import { GRADABLE_ITEM_TYPES, type StudyItem } from "../entities/study-item.interface";
import type { MockQuestion } from "../entities/mock.interface";
import { normalizeTags } from "./study-tags";

/**
 * Chọn + chụp snapshot câu hỏi cho MỘT lượt thi — HÀM THUẦN (nguồn ngẫu nhiên tiêm vào để test tất định).
 * Lọc loại chấm được (FLASHCARD bị loại), lọc `tags` (chỉ lấy câu có ÍT NHẤT một thẻ), xáo câu và lựa chọn (TRUE_FALSE giữ
 * thứ tự Đúng/Sai) bằng `crypto.randomInt`, cắt về `count`.
 */
export type RandomInt = (maxExclusive: number) => number;

export interface PickOptions {
  count: number;
  shuffle: boolean;
  /** Thẻ (chưa chuẩn hoá) — chỉ lấy câu có ít nhất một thẻ trùng. */
  tags?: readonly string[];
  random?: RandomInt;
}

const defaultRandom: RandomInt = (max) => randomInt(max);

/** Fisher–Yates trên BẢN SAO. */
export function shuffled<T>(list: readonly T[], random: RandomInt = defaultRandom): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function snapshotQuestion(item: StudyItem, shuffleOptions: boolean, random: RandomInt): MockQuestion {
  const canShuffle = shuffleOptions && (item.type === "MULTIPLE_CHOICE" || item.type === "MULTI_SELECT");
  const options = item.options.map((o) => ({ id: o.id, text: o.text, mediaAssetId: o.mediaAssetId }));
  return {
    itemId: item.id,
    type: item.type,
    prompt: item.prompt,
    options: canShuffle ? shuffled(options, random) : options,
    correctOptionIds: [...item.correctOptionIds],
    acceptedAnswers: [...item.acceptedAnswers],
    matchMode: item.matchMode,
    explanation: item.explanation,
    frontMediaAssetId: item.frontMediaAssetId,
    tags: [...item.tags],
  };
}

/** Câu chấm được thoả bộ lọc thẻ, theo thứ tự gốc của bộ. */
export function eligibleItems(items: readonly StudyItem[], tags?: readonly string[]): StudyItem[] {
  const wanted = tags && tags.length > 0 ? new Set(normalizeTags(tags)) : null;
  return items.filter((i) => GRADABLE_ITEM_TYPES.includes(i.type) && (!wanted || i.tags.some((t) => wanted.has(t))));
}

export function pickQuestions(items: readonly StudyItem[], opts: PickOptions): MockQuestion[] {
  const random = opts.random ?? defaultRandom;
  const pool = eligibleItems(items, opts.tags);
  const ordered = opts.shuffle ? shuffled(pool, random) : pool;
  return ordered.slice(0, Math.max(0, opts.count)).map((item) => snapshotQuestion(item, opts.shuffle, random));
}

/** Câu hỏi công khai (KHÔNG đáp án/giải thích) — whitelist từng trường, không spread snapshot. */
export interface MockQuestionPublic {
  index: number;
  itemId: string;
  type: MockQuestion["type"];
  prompt: string;
  options: Array<{ id: string; text: string; mediaAssetId: string | null }>;
  frontMediaAssetId: string | null;
}

export function toPublicQuestion(q: MockQuestion, index: number): MockQuestionPublic {
  return {
    index,
    itemId: q.itemId,
    type: q.type,
    prompt: q.prompt,
    options: q.options.map((o) => ({ id: o.id, text: o.text, mediaAssetId: o.mediaAssetId })),
    frontMediaAssetId: q.frontMediaAssetId,
  };
}
