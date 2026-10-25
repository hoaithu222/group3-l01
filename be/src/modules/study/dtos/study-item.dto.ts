import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { FILL_MATCH_MODES, STUDY_OPTION_ID_REGEX } from "../entities/study-item.interface";

const media = objectIdSchema.nullish();

const optionSchema = z.object({
  /** Có = giữ id cũ khi sửa mục; thiếu = server cấp `o_` + 6 ký tự. */
  id: z.string().regex(STUDY_OPTION_ID_REGEX).optional(),
  text: z.string().trim().min(1).max(LIMITS.study.optionTextMax),
  mediaAssetId: media,
});

const itemBase = z.object({
  /** Có = sửa mục đã có (phải thuộc bộ); thiếu = mục mới. */
  id: objectIdSchema.optional(),
  /** Khoá do client đặt — báo lỗi theo mục, ghép `id` mới vào `idMap`, và làm neo cho `afterClientItemKey`. */
  clientItemKey: z.string().min(1).max(64),
  prompt: z.string().trim().min(1).max(LIMITS.study.promptMax),
  explanation: z.string().max(LIMITS.study.explanationMax).nullish(),
  frontMediaAssetId: media,
  backMediaAssetId: media,
  audioAssetId: media,
  tags: z.array(z.string().trim().min(1).max(LIMITS.study.tagMax)).max(LIMITS.study.itemTagsMax).default([]),
  /** `null` = đầu danh sách; chuỗi = ngay sau mục có `clientItemKey` đó (hoặc `id` của mục đã có); thiếu = mục mới xuống cuối / mục cũ giữ chỗ. */
  afterClientItemKey: z.string().min(1).max(64).nullable().optional(),
});

const options = z.array(optionSchema).min(LIMITS.study.optionsMin).max(LIMITS.study.optionsMax);

/**
 * Một mục học (đầu vào ghi ĐÈ toàn bộ nội dung mục). Client gửi INDEX đáp án (dễ với form) — server chuyển thành
 * `correctOptionIds` sau khi gán id lựa chọn. Schema này chỉ dùng trong `study-item.validator` (từng mục, để gom lỗi theo
 * index) — KHÔNG gắn vào middleware body vì lỗi Zod cấp body không chỉ ra được mục nào.
 */
export const studyItemSchema = z.discriminatedUnion("type", [
  itemBase.extend({ type: z.literal("FLASHCARD"), answerText: z.string().trim().min(1).max(LIMITS.study.promptMax) }),
  itemBase.extend({ type: z.literal("MULTIPLE_CHOICE"), options, correctOptionIndex: z.number().int().min(0) }),
  itemBase.extend({ type: z.literal("MULTI_SELECT"), options, correctOptionIndexes: z.array(z.number().int().min(0)).min(1) }),
  itemBase.extend({ type: z.literal("TRUE_FALSE"), correct: z.boolean() }),
  itemBase.extend({
    type: z.literal("FILL_BLANK"),
    acceptedAnswers: z.array(z.string().trim().min(1).max(LIMITS.study.acceptedAnswerMax)).min(1).max(LIMITS.study.acceptedAnswersMax),
    matchMode: z.enum(FILL_MATCH_MODES).default("IGNORE_CASE"),
  }),
]);
export type StudyItemInput = z.infer<typeof studyItemSchema>;

/**
 * `PUT /study-sets/:id/items` — chỉ kiểm phong bì (`expectedVersion`, số phần tử ≤ `bulkOpsMax`); nội dung từng mục do
 * `study-item.validator` kiểm và gom MỌI lỗi có index → `400 STUDY_001`.
 */
export const putItemsSchema = z.object({
  expectedVersion: z.number().int().min(1),
  upsert: z.array(z.unknown()).max(LIMITS.study.bulkOpsMax).default([]),
  delete: z.array(objectIdSchema).max(LIMITS.study.bulkOpsMax).default([]),
});
export type PutItemsDto = z.infer<typeof putItemsSchema>;

/** `GET /study-sets/:id/items` — mặc định trả toàn bộ (≤ 500); có `cursor` để phân trang khi cần. */
export const listItemsQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.study.itemsPerSetMax).default(LIMITS.study.itemsPerSetMax),
});
export type ListItemsQueryDto = z.infer<typeof listItemsQuerySchema>;
