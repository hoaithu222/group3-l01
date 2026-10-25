/**
 * "Ai đang trong phòng thoại của kênh VOICE" — hợp đồng dùng chung giữa `calls` (nguồn: preview, phòng) và `channels`
 * (danh sách kênh vẽ "3 người đang trong phòng") qua `@/shared`, không import chéo feature (p2-03 app.md §4).
 *
 * ⚠️ Sự kiện KHÔNG đặt tên `channel:activity`: handler có sẵn (`useReadStateSync`) coi MỌI `channel:activity` là
 * "tin mới của người khác" và cộng 1 chưa đọc — dùng chung tên là mỗi lần có người vào phòng, huy hiệu kênh nhảy sai.
 */

export const CHANNEL_VOICE_ACTIVITY_EVENT = 'channel:voice-activity';

/** Payload S→C (BE `call-signal.dispatcher.ts`): kênh công khai → room `ws:{id}`; kênh riêng tư → `user:{id}` từng người đọc được. */
export interface ChannelVoiceActivityPayload {
  channelId: string;
  serverNow?: string;
  v?: number;
  voice: { callId: string | null; count: number };
  workspaceId: string;
}

/** Trạng thái phòng của một kênh trong danh sách kênh (`ChannelListItem.voice`). Vắng = phòng trống. */
export interface ChannelVoiceActivity {
  callId: string;
  count: number;
}

/** `null` (phòng kết thúc) hoặc 0 người → `undefined` để danh sách bỏ hẳn badge, không vẽ "0 người". */
export function voiceActivityOf(voice: ChannelVoiceActivityPayload['voice']): ChannelVoiceActivity | undefined {
  return voice.callId !== null && voice.count > 0 ? { callId: voice.callId, count: voice.count } : undefined;
}

/** Chữ (không chỉ icon/màu) cho danh sách kênh và trình đọc màn hình. */
export function voiceActivityLabel(count: number): string {
  return `${String(count)} người đang trong phòng`;
}
