import { logger } from "../../../infrastructure/logger";
import { roomNames, type LiveKitHandlerResult, type MediaEgress, type NormalizedLiveKitEvent } from "../../../infrastructure/media";
import type { RecordingEntity } from "../entities/meeting-recap.interface";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import { meetingCodeOfRoomRef } from "./meeting-room.webhook.service";
import type { RecordingLifecycle } from "./recording-lifecycle.service";

const toDate = (iso: string | null): Date | null => (iso ? new Date(iso) : null);

/**
 * Handler webhook LiveKit `egress_*` cho phòng `meet_*` (be.md §5.6) — đăng ký `roomKind: "meeting"`. Dispatcher p0-08 đã xác thực JWT (RAW body), dedupe
 * `event.id` và ghi `WebhookEvent`; ở đây chỉ áp trạng thái egress lên `MeetingRecording` bằng CAS (`RecordingLifecycle`), nên sự kiện trùng/đảo thứ tự
 * (RR-12) không tạo Asset/tin nhắn trùng. Egress KHÔNG có bản ghi (ngoài hệ thống) → log cảnh báo, không đổi gì.
 */
export class RecordingEgressHandler {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly lifecycle: RecordingLifecycle
  ) {}

  /**
   * Bản ghi của egress: theo `egressId`; hoặc `egress_started` tới TRƯỚC khi `start` kịp ghi `egressId` — nhận bản `STARTING` chưa có egress của đúng
   * phiên họp trong phòng đó (an toàn vì mỗi phiên chỉ có một bản ghi đang chạy).
   */
  private async resolve(egress: MediaEgress, roomName: string | null): Promise<RecordingEntity | null> {
    const byId = await this.d.recordings.findByEgressId(egress.egressId);
    if (byId) return byId;
    const { kind, ref } = roomNames.parse(roomName ?? egress.roomName ?? "");
    if (kind !== "meeting") return null;
    const meeting = await this.d.repo.findByCode(meetingCodeOfRoomRef(ref));
    if (!meeting?.currentCallId) return null;
    const active = await this.d.recordings.findActiveByCall(meeting.currentCallId);
    if (active && active.status === "STARTING" && active.egressId === null && (await this.d.recordings.adoptEgress(active.id, egress.egressId))) return { ...active, egressId: egress.egressId };
    return null;
  }

  async handle(event: NormalizedLiveKitEvent): Promise<LiveKitHandlerResult> {
    if (!event.egress || event.type === "egress_updated") return "IGNORED"; // `egress_updated` chỉ để quan sát
    const rec = await this.resolve(event.egress, event.roomName);
    if (!rec) {
      logger.warn("[recording] Sự kiện egress không thuộc bản ghi nào của hệ thống — bỏ qua", { type: event.type });
      return "IGNORED";
    }
    return this.apply(rec, event.egress, event.type === "egress_started");
  }

  /** Áp trạng thái egress (webhook hoặc `listEgress` của cron stuck-check) lên bản ghi. `started` = sự kiện `egress_started`. */
  async apply(rec: RecordingEntity, egress: MediaEgress, started = false): Promise<LiveKitHandlerResult> {
    if (started || egress.status === "ACTIVE") {
      await this.lifecycle.markStarted(rec, toDate(egress.startedAt));
      return "PROCESSED";
    }
    const file = egress.files[0];
    switch (egress.status) {
      case "COMPLETE":
        await this.finished(rec, egress, false);
        return "PROCESSED";
      case "FAILED":
      case "ABORTED":
      case "LIMIT_REACHED":
        // Egress hỏng NHƯNG đã ghi được tệp (vd mất kết nối cuối buổi): vẫn xử lý bản ghi đó, đánh dấu lý do EGRESS_FAILED.
        if (file && file.sizeBytes > 0) await this.finished(rec, egress, true);
        else await this.lifecycle.toFailed(rec, egress.error ?? "Egress ghi hình kết thúc mà không có tệp");
        return "PROCESSED";
      default:
        return "IGNORED"; // STARTING/ENDING/UNKNOWN: chờ sự kiện kết thúc
    }
  }

  private async finished(rec: RecordingEntity, egress: MediaEgress, failedEgress: boolean): Promise<void> {
    const file = egress.files[0];
    await this.lifecycle.toProcessing(rec, {
      endedAt: toDate(egress.endedAt),
      durationSec: file ? Math.max(0, Math.round(file.durationSeconds)) : null,
      sizeBytes: file && file.sizeBytes > 0 ? file.sizeBytes : null,
      failedEgress,
    });
  }
}
