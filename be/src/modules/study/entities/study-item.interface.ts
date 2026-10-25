/**
 * Khai ĐỘC LẬP với Prisma enum/model (cùng giá trị) — tầng domain không import kiểu Prisma
 * (`.claude/rules/architecture.md`), giống `modules/moderation/entities`.
 */
export const STUDY_ITEM_TYPES = ["FLASHCARD", "MULTIPLE_CHOICE", "MULTI_SELECT", "TRUE_FALSE", "FILL_BLANK"] as const;
export type StudyItemTypeValue = (typeof STUDY_ITEM_TYPES)[number];

export const FILL_MATCH_MODES = ["EXACT", "IGNORE_CASE", "IGNORE_ACCENTS"] as const;
export type FillMatchModeValue = (typeof FILL_MATCH_MODES)[number];

/** Loại mục chấm được (có đáp án đúng/sai) — mock test p4-02 và live quiz p5-01 chỉ lấy các loại này. */
export const GRADABLE_ITEM_TYPES: readonly StudyItemTypeValue[] = ["MULTIPLE_CHOICE", "MULTI_SELECT", "TRUE_FALSE", "FILL_BLANK"];

/** Bit của từng loại trong `StudySet.itemTypesMask`. */
export const ITEM_TYPE_BIT: Readonly<Record<StudyItemTypeValue, number>> = {
  FLASHCARD: 1,
  MULTIPLE_CHOICE: 2,
  MULTI_SELECT: 4,
  TRUE_FALSE: 8,
  FILL_BLANK: 16,
};

/** Mặt nạ của mọi loại chấm được — `mask & GRADABLE_MASK !== 0` ⇔ bộ có câu hỏi chấm điểm. */
export const GRADABLE_MASK = GRADABLE_ITEM_TYPES.reduce((m, t) => m | ITEM_TYPE_BIT[t], 0);

export function typesMask(types: Iterable<StudyItemTypeValue>): number {
  let mask = 0;
  for (const t of types) mask |= ITEM_TYPE_BIT[t];
  return mask;
}

export function isGradableType(type: StudyItemTypeValue): boolean {
  return type !== "FLASHCARD";
}

/** TRUE_FALSE dùng 2 lựa chọn cố định (be.md §2) — id không sinh ngẫu nhiên. */
export const TRUE_OPTION_ID = "o_true";
export const FALSE_OPTION_ID = "o_false";
/** `"o_" + nanoid(6)`; TRUE_FALSE cố định `o_true`/`o_false` nên chấp nhận 4–6 ký tự (p4-02 dùng lại hằng này khi kiểm đáp án). */
export const STUDY_OPTION_ID_REGEX = /^o_[A-Za-z0-9]{4,6}$/;

export interface StudyOption {
  id: string;
  text: string;
  mediaAssetId: string | null;
}

/** Entity domain — khớp model Prisma `StudyItem`. */
export interface StudyItem {
  id: string;
  setId: string;
  ownerId: string;
  type: StudyItemTypeValue;
  prompt: string;
  answerText: string | null;
  options: StudyOption[];
  correctOptionIds: string[];
  acceptedAnswers: string[];
  matchMode: FillMatchModeValue;
  explanation: string | null;
  frontMediaAssetId: string | null;
  backMediaAssetId: string | null;
  audioAssetId: string | null;
  tags: string[];
  order: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Nội dung mục sau khi validator chuyển từ DTO (index đáp án → id lựa chọn) — CHƯA có id/order/version. */
export type StudyItemContent = Omit<StudyItem, "id" | "setId" | "ownerId" | "order" | "version" | "createdAt" | "updatedAt">;

export type StudyItemCreateInput = StudyItemContent & { id: string; setId: string; ownerId: string; order: number };

/** Sửa mục = ghi ĐÈ toàn bộ nội dung (PUT), có thể kèm `order` mới. */
export type StudyItemUpdateInput = StudyItemContent & { order?: number };

/** Mọi asset mà mục tham chiếu (mặt trước/sau, âm thanh, ảnh từng lựa chọn) — khử trùng lặp. */
export function mediaAssetIdsOf(item: Pick<StudyItemContent, "frontMediaAssetId" | "backMediaAssetId" | "audioAssetId" | "options">): string[] {
  const ids = [item.frontMediaAssetId, item.backMediaAssetId, item.audioAssetId, ...item.options.map((o) => o.mediaAssetId)];
  return Array.from(new Set(ids.filter((id): id is string => id !== null && id !== undefined)));
}
