import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { graphemeLength } from "../../../core/utils/normalize";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";

const L = LIMITS.pomodoro;
const minutes = (r: { min: number; max: number }) => z.number().int().min(r.min).max(r.max);

export const channelParamsSchema = z.object({ channelId: objectIdSchema });
export const sessionParamsSchema = z.object({ channelId: objectIdSchema, sessionId: objectIdSchema });

/**
 * Lệnh của chủ phòng (`start|pause|resume|skip|end`): `commandId` (UUID client) → cùng lệnh gửi lại trả cùng kết quả (idempotency 1 giờ);
 * `expectedVersion` lệch → 409 `RES_003`. Kênh CHƯA có phiên thì `start` gửi `expectedVersion = 0` (snapshot ảo có `version = 0`).
 */
export const commandSchema = z.object({
  commandId: z.string().uuid("commandId phải là UUID"),
  expectedVersion: z.number().int().min(0),
});
export type CommandDto = z.infer<typeof commandSchema>;

export const configSchema = z.object({
  focusMinutes: minutes(L.focusMinutes),
  shortBreakMinutes: minutes(L.shortBreakMinutes),
  longBreakMinutes: minutes(L.longBreakMinutes),
  cyclesBeforeLongBreak: minutes(L.cyclesBeforeLongBreak),
  autoAdvance: z.boolean(),
  hostCanSpeakInFocus: z.boolean().optional(),
  expectedVersion: z.number().int().min(0).optional(),
});
export type ConfigDto = z.infer<typeof configSchema>;

/** Mục tiêu cá nhân ≤ `LIMITS.pomodoro.goalMax` grapheme (client và server cùng đếm grapheme); chuỗi rỗng = xoá mục tiêu. */
export const goalSchema = z.object({
  text: z
    .string()
    .max(4000)
    .transform((s) => s.trim())
    .refine((s) => graphemeLength(s) <= L.goalMax, { message: `Mục tiêu tối đa ${L.goalMax} ký tự` }),
  shared: z.boolean(),
});
export type GoalDto = z.infer<typeof goalSchema>;

export const joinSchema = z.object({
  deviceId: z.string().min(8).max(128),
  /** Chuyển thiết bị/đang ở phòng khác: đá máy cũ, rời cuộc gọi khác rồi vào đây (`CALL_004` khi `false`). */
  force: z.boolean().default(false),
});
export type JoinDto = z.infer<typeof joinSchema>;

export const historyQuerySchema = cursorQuerySchema;
export type HistoryQueryDto = z.infer<typeof historyQuerySchema>;
