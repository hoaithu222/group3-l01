import { LIMITS } from "../../../core/constants/limits";
import { ValidationError } from "../../../core/exceptions";
import type { OutboxEventInput } from "../../../infrastructure/queue";
import type { Channel, ChannelVoiceSettings } from "../entities/channel.interface";
import type { UpdateChannelDto } from "../dtos";

/** Job của module `calls` (queue `calls`) xử lý "kênh tắt video" (p2-03 be.md §5.9) — `channels` chỉ biết TÊN job, không import `calls`. */
export const CALL_CHANNEL_VIDEO_DISABLED_JOB = "call.channel-video-disabled";

/**
 * Cấu hình phòng thoại HIỆU LỰC của kênh (p2-03): thiếu `voiceSettings` ⇒ mặc định `{ allowVideo: true, maxParticipants: LIMITS.voice.maxParticipants }`;
 * `maxParticipants` luôn bị kẹp ≤ trần nền tảng (cùng công thức `call-scope.resolver.ts`/`voice-preview.service.ts` phía calls). Chỉ kênh VOICE có nghĩa.
 */
export function effectiveVoiceSettings(channel: Pick<Channel, "voiceSettings">): ChannelVoiceSettings {
  const cap = LIMITS.voice.maxParticipants;
  return {
    allowVideo: channel.voiceSettings?.allowVideo ?? true,
    maxParticipants: Math.min(channel.voiceSettings?.maxParticipants ?? cap, cap),
  };
}

export interface VoiceSettingsChange {
  /** Toàn bộ giá trị mới để ghi (`set` cả khối — hợp nhất với giá trị hiện có, trường nào không gửi thì giữ nguyên). */
  next: ChannelVoiceSettings;
  /** `allowVideo` đổi `true → false`: phòng đang chạy phải bị thu quyền camera ngay (không chờ người dùng vào lại). */
  videoDisabled: boolean;
}

/**
 * Hợp nhất `dto.voiceSettings` vào cấu hình hiện có của kênh (be.md p2-03 §2/§4). Chỉ kênh `VOICE` mới có cấu hình phòng thoại —
 * `TEXT`/`POMODORO` gửi `voiceSettings` ⇒ 400 `VAL_001` (không lặng lẽ bỏ qua để client không tưởng đã lưu). Không gửi ⇒ `null` (không đổi).
 */
export function planVoiceSettingsChange(
  channel: Pick<Channel, "type" | "voiceSettings">,
  input: UpdateChannelDto["voiceSettings"]
): VoiceSettingsChange | null {
  if (input === undefined) return null;
  if (channel.type !== "VOICE") {
    throw new ValidationError("Chỉ kênh thoại mới có cấu hình phòng thoại", { voiceSettings: ["Kênh này không phải kênh thoại"] });
  }
  const current = effectiveVoiceSettings(channel);
  const next: ChannelVoiceSettings = {
    allowVideo: input.allowVideo ?? current.allowVideo,
    maxParticipants: input.maxParticipants ?? current.maxParticipants,
  };
  return { next, videoDisabled: current.allowVideo && !next.allowVideo };
}

/** Dòng outbox RIÊNG cho `calls` (mỗi cặp queue/jobName chỉ MỘT processor, `dedupeKey` unique) — ghi CÙNG transaction với `Channel` `version + 1`. */
export function videoDisabledOutbox(channelId: string, workspaceId: string, version: number): OutboxEventInput {
  return {
    type: "channel.video-disabled",
    aggregateType: "Channel",
    aggregateId: channelId,
    queue: "calls",
    jobName: CALL_CHANNEL_VIDEO_DISABLED_JOB,
    dedupeKey: `${CALL_CHANNEL_VIDEO_DISABLED_JOB}:channel:${channelId}:v${version}`,
    payload: { channelId, workspaceId },
  };
}
