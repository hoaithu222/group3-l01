import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { graphemeLength } from "../../../core/utils/normalize";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

const R = LIMITS.meetingRecap;
const version = z.number().int().min(1);

/**
 * `PUT /meetings/:id/recap` (be.md §3). Lỗi độ dài mang `message = MEET_023` để `validateMeetingBody` trả ĐÚNG mã đó (HTTP 400). Nội dung RỖNG vẫn được LƯU
 * nháp (xoá hết chữ); chỉ CÔNG BỐ mới đòi có nội dung/tệp (`MEET_023`, kiểm ở service). `expectedVersion` bỏ trống chỉ hợp lệ khi CHƯA có bản ghi (lần lưu đầu).
 */
export const upsertRecapSchema = z
  .object({
    content: z.string().refine((s) => graphemeLength(s) <= R.contentMax, "MEET_023"),
    startedAt: z.coerce.date().optional(),
    endedAt: z.coerce.date().optional(),
    expectedVersion: version.optional(),
  })
  .refine((v) => !v.startedAt || !v.endedAt || v.endedAt >= v.startedAt, { message: "Giờ kết thúc phải sau giờ bắt đầu", path: ["endedAt"] });
export type UpsertRecapDto = z.infer<typeof upsertRecapSchema>;

export const publishRecapSchema = z.object({ expectedVersion: version });
export type PublishRecapDto = z.infer<typeof publishRecapSchema>;

export const attachRecapAssetSchema = z.object({ assetId: objectIdSchema });
export type AttachRecapAssetDto = z.infer<typeof attachRecapAssetSchema>;

/** `DELETE /meetings/:meetingId/recap/attachments/:assetId`. */
export const recapAttachmentParamsSchema = z.object({ meetingId: objectIdSchema, assetId: objectIdSchema });
