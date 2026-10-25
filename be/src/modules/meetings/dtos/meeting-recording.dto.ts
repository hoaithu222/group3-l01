import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

/** `POST /meetings/:id/recordings/consent-request` — không nhận gì (chủ trì hỏi ý kiến cả phòng). */
export const consentRequestSchema = z.object({}).strict();

/** `requestId` bỏ trống = người vào SAU khi bản ghi đã chạy (không có yêu cầu để khớp). */
export const consentResponseSchema = z.object({ requestId: z.string().uuid().optional(), accept: z.boolean() });
export type ConsentResponseDto = z.infer<typeof consentResponseSchema>;

export const startRecordingSchema = z.object({ requestId: z.string().uuid(), layout: z.enum(["GRID", "SPEAKER"]).default("GRID") });
export type StartRecordingDto = z.infer<typeof startRecordingSchema>;

export const recordingUrlQuerySchema = z.object({ purpose: z.enum(["STREAM", "DOWNLOAD"]).default("STREAM") });
export type RecordingUrlQueryDto = z.infer<typeof recordingUrlQuerySchema>;

/** Lý do BẮT BUỘC (≥ 10 ký tự) khi OWNER workspace không phải chủ trì xoá — service kiểm; chủ trì xoá bản của mình không cần. */
export const deleteRecordingQuerySchema = z.object({ reason: z.string().trim().min(10).max(500).optional() });
export type DeleteRecordingQueryDto = z.infer<typeof deleteRecordingQuerySchema>;

export const recordingIdParamSchema = z.object({ recordingId: objectIdSchema });

/** `GET /admin/recordings` — phân trang server, lọc trạng thái (CSV/lặp), workspace, khoảng ngày bắt đầu ghi, sắp xếp. */
const STATUSES = ["STARTING", "RECORDING", "STOPPING", "PROCESSING", "READY", "FAILED"] as const;
const statusFilter = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : [v]).flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(z.enum(STATUSES)).max(STATUSES.length))
  .optional();
const boolQuery = z.enum(["true", "false"]).transform((v) => v === "true");

export const adminRecordingListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: statusFilter,
    workspaceId: objectIdSchema.optional(),
    /** Chỉ bản ghi của MỘT cuộc họp (drawer cuộc họp ở admin) — id sai định dạng → 400. */
    meetingId: objectIdSchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    expiringWithinDays: z.coerce.number().int().min(1).max(365).optional(),
    includeDeleted: boolQuery.optional(),
    sort: z.enum(["startedAt", "-startedAt", "durationSec", "-durationSec", "fileSizeBytes", "-fileSizeBytes", "retentionExpiresAt", "-retentionExpiresAt"]).default("-startedAt"),
  })
  .refine((q) => !q.from || !q.to || q.to >= q.from, { message: "Khoảng thời gian không hợp lệ", path: ["to"] });
export type AdminRecordingListQueryDto = z.infer<typeof adminRecordingListQuerySchema>;

/** `DELETE /admin/recordings/:id?reason=` — lý do 10–500 ký tự BẮT BUỘC (thao tác quản trị, có audit). */
export const adminDeleteRecordingQuerySchema = z.object({ reason: z.string().trim().min(10).max(500) });
export type AdminDeleteRecordingQueryDto = z.infer<typeof adminDeleteRecordingQuerySchema>;
