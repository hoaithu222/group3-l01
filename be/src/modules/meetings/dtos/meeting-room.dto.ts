import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

const deviceId = z.string().min(8).max(128);
const displayName = z.string().trim().min(1).max(80).optional();
const version = z.number().int().min(1);

/**
 * `POST /meetings/:id/start` — thêm `deviceId`/`force`/`displayName` so với be.md §3 (chỉ `expectedVersion`): `start` trả luôn kết quả `join`
 * (token vào phòng) nên cần định danh thiết bị như `join`.
 */
export const startMeetingSchema = z.object({ expectedVersion: version, deviceId, force: z.boolean().default(false), displayName });
export type StartMeetingDto = z.infer<typeof startMeetingSchema>;

export const joinMeetingSchema = z.object({ deviceId, force: z.boolean().default(false), displayName });
export type JoinMeetingDto = z.infer<typeof joinMeetingSchema>;

export const leaveMeetingSchema = z.object({ transferControlTo: objectIdSchema.optional() });
export type LeaveMeetingDto = z.infer<typeof leaveMeetingSchema>;

export const endMeetingSchema = z.object({ expectedVersion: version.optional() });
export type EndMeetingDto = z.infer<typeof endMeetingSchema>;

export const muteParticipantSchema = z.object({ source: z.enum(["MICROPHONE", "CAMERA", "SCREEN_SHARE"]) });
export type MuteParticipantDto = z.infer<typeof muteParticipantSchema>;

/** "Tắt mic tất cả" (P0 chỉ micro — không tắt camera hàng loạt). */
export const muteAllSchema = z.object({ source: z.enum(["MICROPHONE"]).default("MICROPHONE") });
export type MuteAllDto = z.infer<typeof muteAllSchema>;

export const removeParticipantSchema = z.object({ alsoRemoveAttendee: z.boolean().default(false), reason: z.string().trim().max(500).optional() });
export type RemoveParticipantDto = z.infer<typeof removeParticipantSchema>;

export const participantRoleSchema = z.object({ role: z.enum(["CO_HOST", "MEMBER"]) });
export type ParticipantRoleDto = z.infer<typeof participantRoleSchema>;

export const transferControlSchema = z.object({ toUserId: objectIdSchema });
export type TransferControlDto = z.infer<typeof transferControlSchema>;

/** `:meetingId/participants/:userId/*` và `:meetingId/lobby/:userId/*`. */
export const roomUserParamsSchema = z.object({ meetingId: objectIdSchema, userId: objectIdSchema });
