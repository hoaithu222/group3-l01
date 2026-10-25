import type { LiveKitHandlerResult, NormalizedLiveKitEvent } from "../../../infrastructure/media";
import { roomNames } from "../../../infrastructure/media";
import { logger } from "../../../infrastructure/logger";
import { isInRoom } from "./meeting-room.access";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import type { MeetingRoomLifecycleService } from "./meeting-room.lifecycle.service";
import type { MeetingRoomMaintenanceService } from "./meeting-room.maintenance.service";
import { meetingEndReasonOf } from "./meeting-room.schedule";
import type { MeetingRoomSignals } from "./meeting-room.signals";

/** `meet_abcdefghij` (hoặc `…_<hậu tố phiên>` khi bắt đầu lại) → mã họp `abc-defg-hij`. */
export function meetingCodeOfRoomRef(ref: string): string {
  const c = ref.split("_")[0] ?? "";
  return `${c.slice(0, 3)}-${c.slice(3, 7)}-${c.slice(7, 10)}`;
}

/**
 * Handler webhook LiveKit cho phòng `meet_*` (be.md §5.7) — đăng ký `roomKind: "meeting"` (calls chỉ lo `call_*`). Nguồn sự thật người tham gia vẫn là
 * `listParticipants` (job `call.reconcile` của calls GHI ĐÈ), ở đây chỉ làm việc NHẸ + quy tắc RIÊNG của họp: ghi `firstJoinedAt`, đá người không có
 * quyền (REMOVED/lạ), một người chia sẻ màn hình, host-grace, `room_finished` → kết thúc cuộc họp. Idempotent, sự kiện của phiên CŨ bị bỏ qua.
 */
export class MeetingRoomWebhookService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly signals: MeetingRoomSignals,
    private readonly lifecycle: MeetingRoomLifecycleService,
    private readonly maintenance: MeetingRoomMaintenanceService
  ) {}

  async handle(event: NormalizedLiveKitEvent): Promise<LiveKitHandlerResult> {
    const { kind, ref } = roomNames.parse(event.roomName ?? "");
    if (kind !== "meeting" || !event.roomName) return "IGNORED";
    const meeting = await this.d.repo.findByCode(meetingCodeOfRoomRef(ref));
    if (!meeting?.currentCallId) return "IGNORED";
    const call = await this.d.calls.findCall(meeting.currentCallId);
    if (!call || call.livekitRoom !== event.roomName) return "IGNORED"; // sự kiện của phiên trước (phòng đã đóng)
    const identity = event.participant?.identity;

    switch (event.type) {
      case "room_finished": {
        if (meeting.status !== "LIVE") return "IGNORED";
        // `Call` có thể đã bị kết thúc từ nơi khác (calls thu hồi, admin) — lấy lý do đó; chưa kết thúc ⇒ phòng trống quá `emptyTimeout`.
        await this.lifecycle.endBySystem(meeting.id, meetingEndReasonOf(call.status === "ENDED" ? call.endReason : "EMPTY"));
        return "PROCESSED";
      }
      case "participant_joined": {
        if (!identity || call.status === "ENDED") return "IGNORED";
        const known = await this.d.calls.findParticipant(call.id, identity);
        if (!known || known.state === "REMOVED") {
          logger.warn("[meetings] Webhook có identity không được phép — đá khỏi phòng", { meetingId: meeting.id });
          await this.d.media().removeParticipant(call.livekitRoom, identity).catch(() => undefined);
          return "PROCESSED";
        }
        await this.d.repo.markFirstJoined(meeting.id, identity, this.d.now());
        await this.d.calls.scheduleReconcile(call.id, 1000);
        return "PROCESSED";
      }
      case "participant_left": {
        if (!identity) return "IGNORED";
        const left = await this.d.calls.findParticipant(call.id, identity);
        await this.d.calls.releaseScreen(call.id, identity);
        await this.d.calls.scheduleReconcile(call.id, 1000);
        if (meeting.status === "LIVE" && left && isInRoom(left) && (left.role === "HOST" || left.role === "CO_HOST")) {
          await this.maintenance.scheduleGraceIfHeadless(meeting, call.id, identity);
        }
        return "PROCESSED";
      }
      case "track_published": {
        if (!identity || event.track?.source !== "SCREEN_SHARE") return "IGNORED";
        const slot = await this.d.calls.acquireScreen(call.id, identity);
        if (slot.acquired) return "PROCESSED";
        // Người thứ hai chia sẻ màn hình: chặn Ở SERVER (không chỉ ở client) — tắt track mới + báo cho họ.
        await this.d.media().mutePublishedTrack(call.livekitRoom, identity, event.track.sid, true).catch(() => undefined);
        this.signals.hostAction(call.id, [identity], { type: "SCREEN_SHARE_REJECTED", byUserId: null, targetUserId: identity });
        return "PROCESSED";
      }
      case "track_unpublished": {
        if (!identity || event.track?.source !== "SCREEN_SHARE") return "IGNORED";
        await this.d.calls.releaseScreen(call.id, identity);
        return "PROCESSED";
      }
      default:
        return "IGNORED";
    }
  }
}
