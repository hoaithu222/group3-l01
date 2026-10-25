import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import type { RecordingEntity } from "../entities/meeting-recap.interface";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import type { RecordingEgressHandler } from "./recording-egress.handler";
import type { RecordingLifecycle } from "./recording-lifecycle.service";
import { recordingOutbox } from "./recording-outbox";
import type { RecordingRuntimeLimits } from "./recording-runtime";

const MIN_MS = 60_000;
const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Việc nền của ghi hình (be.md §5.8, README §10): cron `recording.retention-cleanup` (xoá bản READY/FAILED quá hạn lưu trữ + cập nhật gauge dung lượng) và cron
 * `recording.stuck-check` (mỗi 15 phút: bản kẹt ở STARTING/STOPPING/PROCESSING vì mất webhook → hỏi `listEgress` rồi áp như webhook tương ứng). Tick TĨNH, theo
 * lô, idempotent — KHÔNG tạo scheduler theo từng bản ghi (`syncCronSchedulers` sẽ xoá scheduler động).
 */
export class RecordingMaintenanceService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly lifecycle: RecordingLifecycle,
    private readonly egress: RecordingEgressHandler,
    private readonly limits: () => Promise<RecordingRuntimeLimits>
  ) {}

  /** Xoá bản ghi đã hết hạn lưu trữ (`retentionExpiresAt < now`) — như xoá tay với lý do `RETENTION`, tác nhân hệ thống. Trả số bản đã xoá. */
  async retentionCleanup(): Promise<number> {
    const rows = await this.d.recordings.findExpired(this.d.now(), LIMITS.recording.retentionBatch);
    let removed = 0;
    for (const rec of rows) {
      try {
        if (!(await this.lifecycle.remove(rec, null, "RETENTION"))) continue;
        removed += 1;
        const meeting = await this.lifecycle.meetingOf(rec);
        // `AuditPort.actorId` bắt buộc — ghi thay chủ trì (`system: true` phân biệt với thao tác của chính chủ trì).
        await this.d.audit.record({ actorId: meeting?.hostId ?? rec.startedBy, action: "recording.delete", targetType: "MeetingRecording", targetId: rec.id, workspaceId: rec.workspaceId, metadata: { system: true, reason: "RETENTION", meetingId: rec.meetingId } });
      } catch (err) {
        logger.warn("[recording] Không xoá được bản ghi hết hạn — lượt cron sau thử lại", { recordingId: rec.id, error: errText(err) });
      }
    }
    await this.lifecycle.refreshStorageGauge();
    return removed;
  }

  /** Chốt trạng thái các bản ghi kẹt. Trả số bản đã được xử lý. */
  async stuckCheck(): Promise<number> {
    const now = this.d.now().getTime();
    const L = LIMITS.recording;
    const rows = await this.d.recordings.findStuck(
      { startingBefore: new Date(now - L.stuckStartingMinutes * MIN_MS), stoppingBefore: new Date(now - L.stuckStoppingMinutes * MIN_MS), processingBefore: new Date(now - L.stuckProcessingMinutes * MIN_MS) },
      50
    );
    let handled = 0;
    for (const rec of rows) {
      try {
        if (rec.status === "PROCESSING") await this.retryStuckImport(rec);
        else await this.reconcileEgress(rec);
        handled += 1;
      } catch (err) {
        logger.warn("[recording] stuck-check lỗi với một bản ghi — lượt sau thử lại", { recordingId: rec.id, error: errText(err) });
      }
    }
    return handled;
  }

  /** `PROCESSING` quá lâu: job import bị mất (Redis/worker sự cố) → xếp lại (jobId theo lượt); quá `importMaxAttempts` thì FAILED. */
  private async retryStuckImport(rec: RecordingEntity): Promise<void> {
    const attempts = rec.importAttempts + 1;
    if (attempts >= (await this.limits()).importMaxAttempts) {
      await this.lifecycle.toFailed(rec, "Xử lý bản ghi quá thời gian cho phép", ["PROCESSING"]);
      return;
    }
    await this.d.tx.run(async (tx) => {
      const u = await this.d.recordings.transition(tx, rec.id, ["PROCESSING"], { importAttempts: attempts });
      if (u) await this.d.outbox.add(tx, recordingOutbox.import(u, u.version));
    });
  }

  /** `STARTING`/`STOPPING` quá lâu: hỏi LiveKit trạng thái egress thật rồi áp như webhook; không còn egress → FAILED. */
  private async reconcileEgress(rec: RecordingEntity): Promise<void> {
    if (!rec.egressId) {
      await this.lifecycle.toFailed(rec, "Không khởi động được egress ghi hình");
      return;
    }
    const [egress] = await this.d.media().listEgress({ egressId: rec.egressId });
    if (!egress) {
      await this.lifecycle.toFailed(rec, "Không tìm thấy egress ghi hình trên máy chủ media");
      return;
    }
    if (rec.status === "STOPPING" && (egress.status === "ACTIVE" || egress.status === "STARTING")) {
      await this.d.media().stopEgress(rec.egressId); // lệnh dừng trước đó thất bại: gửi lại
      return;
    }
    await this.egress.apply(rec, egress);
  }
}
