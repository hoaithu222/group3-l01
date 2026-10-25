import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { csvEnum, objectIdSchema, paginationSchema } from "../../../shared/dto/common-schemas";

const STATUSES = ["SCHEDULED", "LIVE", "ENDED", "CANCELLED"] as const;
const PLATFORMS = ["INTERNAL", "ZOOM", "TEAMS", "GOOGLE_MEET", "OTHER"] as const;

/**
 * `GET /admin/meetings` (p2-07 be.md §3): tìm theo tiêu đề (không dấu) HOẶC mã họp `abc-defg-hij`; lọc workspace/trạng thái/nền tảng/khoảng `startAt`.
 * `.strict()` — trường lạ (đặc biệt `userId`, `hostId`, `attendeeId`) → 400 `VAL_001`: không thể lọc theo người tham dự dù sau này ai đó thêm vào DTO.
 */
export const adminMeetingListQuerySchema = paginationSchema
  .extend({
    limit: z.coerce.number().int().min(1).max(LIMITS.adminMedia.listLimitMax).default(20),
    q: z.string().trim().min(2).max(100).optional(),
    workspaceId: objectIdSchema.optional(),
    status: csvEnum(STATUSES).optional(),
    platform: z.enum(PLATFORMS).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sort: z.enum(["-startAt", "startAt", "-attendeeCount"]).default("-startAt"),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.to >= q.from, { message: "Khoảng thời gian không hợp lệ", path: ["to"] });
export type AdminMeetingListQueryDto = z.infer<typeof adminMeetingListQuerySchema>;

export const meetingIdParamSchema = z.object({ meetingId: objectIdSchema });
