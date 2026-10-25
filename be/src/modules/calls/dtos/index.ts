import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";

const deviceId = z.string().min(8).max(128);

/** `POST /calls` — MEETING không đi qua đây (`CALL_013`, phòng họp tạo bằng `POST /meetings/:id/join`, p2-05). */
export const createCallSchema = z.object({
  scopeType: z.enum(["CONVERSATION", "CHANNEL"]),
  scopeId: objectIdSchema,
  mediaKind: z.enum(["AUDIO", "VIDEO"]),
  clientCallId: z.string().uuid(),
  deviceId,
  /** p2-03: chuyển cuộc gọi khác/thiết bị khác sang phòng này. */
  force: z.boolean().optional(),
});
export type CreateCallDto = z.infer<typeof createCallSchema>;

export const callIdParamSchema = z.object({ id: objectIdSchema });

export const deviceActionSchema = z.object({ deviceId });
export type DeviceActionDto = z.infer<typeof deviceActionSchema>;

/** `POST /calls/:id/join` — `force` dùng ở p2-03 (chuyển thiết bị/cuộc gọi). */
export const joinCallSchema = z.object({ deviceId, force: z.boolean().optional() });
export type JoinCallDto = z.infer<typeof joinCallSchema>;

export const inviteSchema = z.object({
  userIds: z.array(objectIdSchema).min(1).max(LIMITS.call.ringMaxInvitees),
});
export type InviteDto = z.infer<typeof inviteSchema>;

/** `POST /calls/:id/ack` (p2-02) — thiết bị xác nhận cuộc gọi tới đã hiện/đang đổ chuông; `via` cho biết push hay socket tới trước (chỉ để đo). */
export const ringAckSchema = z.object({ deviceId, via: z.enum(["PUSH", "SOCKET"]) });
export type RingAckDto = z.infer<typeof ringAckSchema>;

export const endCallSchema = z.object({ forEveryone: z.boolean().default(false) });
export type EndCallDto = z.infer<typeof endCallSchema>;

export const listCallsQuerySchema = cursorQuerySchema.extend({
  filter: z.enum(["all", "missed"]).default("all"),
  scopeType: z.enum(["CONVERSATION", "CHANNEL", "MEETING"]).optional(),
  scopeId: objectIdSchema.optional(),
});
export type ListCallsQueryDto = z.infer<typeof listCallsQuerySchema>;

export const activeCallQuerySchema = z.object({
  scopeType: z.enum(["CONVERSATION", "CHANNEL", "MEETING"]),
  scopeId: objectIdSchema,
});
export type ActiveCallQueryDto = z.infer<typeof activeCallQuerySchema>;

// ── p2-03 — phòng thoại kênh VOICE ─────────────────────────────────────────

export const voicePreviewParamsSchema = z.object({ id: objectIdSchema });

/** `POST /calls/:id/leave` — chủ phòng chọn chuyển quyền / kết thúc cho mọi người (be.md §5.3). Thân rỗng vẫn hợp lệ. */
export const leaveRoomSchema = z.object({
  transferToUserId: objectIdSchema.optional(),
  endForEveryone: z.boolean().default(false),
});
export type LeaveRoomDto = z.infer<typeof leaveRoomSchema>;

export const handSchema = z.object({ raised: z.boolean() });
export type HandDto = z.infer<typeof handSchema>;

export const screenShareSchema = z.object({ on: z.boolean() });
export type ScreenShareDto = z.infer<typeof screenShareSchema>;

export const HOST_ACTIONS = ["invite-speak", "mute-request", "block-audio", "unblock-audio", "end-share", "remove", "transfer", "end"] as const;
export type HostAction = (typeof HOST_ACTIONS)[number];

export const hostActionParamsSchema = z.object({ id: objectIdSchema, action: z.enum(HOST_ACTIONS) });

/** `targetUserId` bắt buộc trừ `end` — kiểm ở service vì `action` nằm ở params, không ở thân. */
export const hostActionBodySchema = z.object({
  targetUserId: objectIdSchema.optional(),
  expectedVersion: z.number().int().min(1),
  reason: z.string().max(200).optional(),
});
export type HostActionBodyDto = z.infer<typeof hostActionBodySchema>;
