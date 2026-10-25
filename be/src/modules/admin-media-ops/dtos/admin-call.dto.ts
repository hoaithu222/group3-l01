import type { CallEndReason } from "@prisma/client";
import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { csvEnum, objectIdSchema, paginationSchema } from "../../../shared/dto/common-schemas";

export const CALL_END_REASONS = [
  "COMPLETED", "CANCELLED", "NO_ANSWER", "DECLINED", "BUSY", "FAILED", "REVOKED", "ARCHIVED", "HOST_ENDED", "FORCE_ENDED", "EMPTY", "MAX_DURATION",
] as const satisfies readonly CallEndReason[];
/** Thêm giá trị vào enum Prisma mà quên ở đây → lỗi biên dịch (`never` không gán được `true`). */
const _allEndReasonsListed: Exclude<CallEndReason, (typeof CALL_END_REASONS)[number]> extends never ? true : never = true;
void _allEndReasonsListed;

const STATUSES = ["RINGING", "ACTIVE", "ENDED"] as const;

/**
 * `GET /admin/calls` — KHÔNG nhận `userId`/`conversationId`/`scopeId` (OPC-05, rủi ro §10 README: lọc theo người = lộ ai gọi ai ở cuộc gọi 1-1). `meetingId` chỉ ánh xạ
 * `scopeType=MEETING` + `scopeId=meetingId` (cuộc họp là dữ liệu vận hành, không phải người). `.strict()` biến mọi trường lạ thành 400 `VAL_001`.
 */
export const adminCallListQuerySchema = paginationSchema
  .extend({
    limit: z.coerce.number().int().min(1).max(LIMITS.adminMedia.listLimitMax).default(20),
    workspaceId: objectIdSchema.optional(),
    meetingId: objectIdSchema.optional(),
    scopeType: z.enum(["CONVERSATION", "CHANNEL", "MEETING"]).optional(),
    mode: z.enum(["RING", "ROOM"]).optional(),
    mediaKind: z.enum(["AUDIO", "VIDEO"]).optional(),
    status: csvEnum(STATUSES).optional(),
    endReason: csvEnum(CALL_END_REASONS).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sort: z.enum(["-startedAt", "startedAt", "-durationSec", "-peakParticipants"]).default("-startedAt"),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.to >= q.from, { message: "Khoảng thời gian không hợp lệ", path: ["to"] })
  .refine((q) => !q.meetingId || !q.scopeType || q.scopeType === "MEETING", { message: "meetingId chỉ đi với scopeType=MEETING", path: ["scopeType"] });
export type AdminCallListQueryDto = z.infer<typeof adminCallListQuerySchema>;

export const callIdParamSchema = z.object({ callId: objectIdSchema });
