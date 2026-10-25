import type { ChannelVoiceActivity, ChannelVoiceActivityReader } from "../../../shared/ports/channel-voice-activity.port";
import type { ICallRepository } from "../repositories/call.repository.interface";

/**
 * Bản đọc của cổng `ChannelVoiceActivityReader` (`shared/ports`): số người đang trong phòng thoại của các kênh VOICE — danh sách kênh
 * (p1-03) dùng để vẽ "3 người đang trong phòng". Hai truy vấn cho MỌI kênh (không N+1). Đếm `CONNECTED`/`RECONNECTING` như preview.
 */
export class CallChannelVoiceActivityReader implements ChannelVoiceActivityReader {
  constructor(private readonly repo: Pick<ICallRepository, "findOpenByScope" | "findParticipantsOf">) {}

  async activityOf(channelIds: string[]): Promise<Map<string, ChannelVoiceActivity>> {
    const out = new Map<string, ChannelVoiceActivity>();
    if (channelIds.length === 0) return out;
    const open = (await this.repo.findOpenByScope("CHANNEL", channelIds)).filter((c) => c.mode === "ROOM");
    if (open.length === 0) return out;

    const counts = new Map<string, number>();
    for (const p of await this.repo.findParticipantsOf(open.map((c) => c.id))) {
      if (p.state === "CONNECTED" || p.state === "RECONNECTING") counts.set(p.callId, (counts.get(p.callId) ?? 0) + 1);
    }
    for (const call of open) {
      const count = counts.get(call.id) ?? 0;
      if (count > 0) out.set(call.scopeId, { callId: call.id, count });
    }
    return out;
  }
}
