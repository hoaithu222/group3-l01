import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { callEvents } from "../events/call-outbox.events";
import type { CallDeps } from "./call.deps";
import { callError } from "./call-scope.resolver";

/** Số `deviceId` tối đa lưu trên participant (mới nhất cuối) — người có nhiều máy cùng đổ chuông vẫn không phình dữ liệu. */
export const RING_ACK_DEVICES_MAX = 5;
/** Thiết bị khác cùng ack sát nhau → CAS `version` thua; đọc lại rồi thử tiếp (mỗi lần chỉ ghi 2 trường ack). */
const ACK_ATTEMPTS = 3;

export interface RingAckResult {
  /** `true` khi `deviceId` đã nằm trong danh sách xác nhận của người này (mới ghi hoặc đã có từ trước). */
  acked: boolean;
}

/**
 * `POST /calls/:id/ack` (p2-02 be.md §4) — THIẾT BỊ của người được gọi xác nhận "cuộc gọi tới đã hiện/đang đổ chuông trên máy này" (từ push hoặc socket),
 * để người gọi đổi "Đang gọi…" thành "Đang đổ chuông". Không đổi trạng thái cuộc gọi/participant:
 *  · participant `INVITED`/`RINGING`  → ghi `lastRingAckAt` + `deviceId` (≤ 5) bằng CAS `version`; LẦN ĐẦU của người này mới ghi outbox `call.participant-changed`
 *    (các máy sau chỉ thêm vào danh sách — không phát lại tín hiệu);
 *  · participant ở trạng thái khác (đã trả lời/từ chối/nhỡ…) → 200 no-op (`acked: false`), không lỗi để app không phải phân biệt đua với người trả lời;
 *  · không phải participant → 403 `CALL_014`; cuộc gọi đã kết thúc → 410 `CALL_005`.
 */
export class CallRingAckService {
  constructor(private readonly d: CallDeps) {}

  async ack(user: AuthUser, callId: string, deviceId: string): Promise<RingAckResult> {
    for (let attempt = 0; attempt < ACK_ATTEMPTS; attempt += 1) {
      const [call, p] = await Promise.all([this.d.repo.findById(callId), this.d.repo.findParticipant(callId, user.id)]);
      if (!call || !p) throw callError(ErrorCode.CALL_014, 403);
      if (call.status === "ENDED") throw callError(ErrorCode.CALL_005, 410, { endReason: call.endReason });
      if (p.state !== "INVITED" && p.state !== "RINGING") return { acked: false };

      const known = p.ringAckDeviceIds ?? [];
      if (known.includes(deviceId)) return { acked: true }; // lặp lại từ cùng máy — idempotent

      const first = !p.lastRingAckAt;
      const devices = [...known, deviceId].slice(-RING_ACK_DEVICES_MAX);
      const written = await this.d.tx.run(async (tx) => {
        const updated = await this.d.repo.updateParticipant(
          tx,
          callId,
          user.id,
          { version: p.version, stateIn: ["INVITED", "RINGING"] },
          { lastRingAckAt: this.d.now(), ringAckDeviceIds: devices }
        );
        if (!updated) return false;
        if (first) await this.d.outbox.add(tx, callEvents.participantChanged(callId, call.version, user.id, updated.state, updated.version));
        return true;
      });
      if (written) return { acked: true };
    }
    return { acked: false }; // thua CAS liên tiếp (trạng thái đang đổi) — coi như no-op, thiết bị có thể ack lại
  }
}
