import { ErrorCode } from "../../../core/utils/error.codes";
import { logger } from "../../../infrastructure/logger";
import { recordingEgressTotal, recordingStorageBytes } from "../../../infrastructure/metrics/recording.metrics";
import type { MeetingEntity } from "../entities/meeting.interface";
import type { RecordingEntity, RecordingStopReasonValue } from "../entities/meeting-recap.interface";
import type { MeetingAssetsPort } from "./meeting-assets.port";
import { meetError } from "./meeting-errors";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import { sanitizeRecordingError } from "./recording-errors";
import { recordingOutbox } from "./recording-outbox";
import { restorePublishAfterRecording } from "./recording-publish";
import type { RecordingRuntimeLimits } from "./recording-runtime";
import type { RecordingSignals } from "./recording-signals";

const DAY_MS = 86_400_000;
const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Máy trạng thái `MeetingRecording` (README §3.2) — MỘT nơi thực hiện mọi chuyển trạng thái để người dùng (dừng/xoá), webhook egress, job import và cron
 * (stuck-check, retention) dùng chung. Mọi chuyển là CAS theo trạng thái nguồn (`transition`): sự kiện trùng/đảo thứ tự/song song chỉ MỘT lượt thắng, lượt
 * còn lại nhận `null` và không làm gì thêm (không tin nhắn/asset/outbox trùng). Socket phát sau commit; lỗi phát chỉ log.
 */
export class RecordingLifecycle {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly signals: RecordingSignals,
    private readonly assets: MeetingAssetsPort,
    private readonly limits: () => Promise<RecordingRuntimeLimits>
  ) {}

  meetingOf(rec: Pick<RecordingEntity, "meetingId">): Promise<MeetingEntity | null> {
    return this.d.repo.findById(rec.meetingId, { includeDeleted: true });
  }

  private async notify(rec: RecordingEntity, extra: { deleted?: boolean } = {}): Promise<void> {
    const meeting = await this.meetingOf(rec);
    if (meeting) await this.signals.recordingUpdated(meeting, rec, extra).catch((err: unknown) => logger.warn("[recording] Không phát meeting:recording-updated", { recordingId: rec.id, error: errText(err) }));
  }

  /** Chỉ báo "Đang ghi hình" hiện NGAY khi bấm bắt đầu (trước `egress_started`); người vào sau nhận trạng thái này qua join/snapshot. */
  announceStarting(rec: RecordingEntity): void {
    this.signals.callRecordingOf(rec, "STARTING");
  }

  /** `egress_started` (hoặc `listEgress` thấy ACTIVE): STARTING → RECORDING; chỉ báo "Đang ghi hình" chuyển sang RECORDING. */
  async markStarted(rec: RecordingEntity, startedAt: Date | null): Promise<RecordingEntity | null> {
    const u = await this.d.recordings.transition(undefined, rec.id, ["STARTING"], { status: "RECORDING", startedAt: startedAt ?? this.d.now() });
    if (u) {
      recordingEgressTotal.inc({ status: "started" });
      this.signals.callRecordingOf(u, "RECORDING");
      await this.notify(u);
    }
    return u;
  }

  /** Dừng theo host/hết giờ/kết thúc họp: `stopEgress` rồi STARTING|RECORDING → STOPPING. Idempotent khi đã dừng/đang xử lý; `MEET_009` nếu FAILED. */
  async stop(rec: RecordingEntity, by: string | null, reason: RecordingStopReasonValue): Promise<RecordingEntity> {
    if (rec.status === "STOPPING" || rec.status === "PROCESSING" || rec.status === "READY") return rec;
    if (rec.status === "FAILED") throw meetError(ErrorCode.MEET_009, 409);
    if (!rec.egressId) throw meetError(ErrorCode.REC_004, 409); // egress còn đang khởi động — thử lại sau giây lát
    await this.d
      .media()
      .stopEgress(rec.egressId)
      .catch((err: unknown) => logger.warn("[recording] stopEgress lỗi — dựa webhook/stuck-check để chốt trạng thái", { recordingId: rec.id, error: errText(err) }));
    const u = await this.d.recordings.transition(undefined, rec.id, ["STARTING", "RECORDING"], { status: "STOPPING", stoppedAt: this.d.now(), stoppedBy: by, stopReason: reason });
    if (!u) return (await this.d.recordings.findById(rec.id)) ?? rec;
    this.signals.callRecordingOf(u, "STOPPING");
    await this.notify(u);
    return u;
  }

  /** Egress kết thúc CÓ tệp (COMPLETE, hoặc lỗi nhưng đã ghi được): → PROCESSING + xếp `recording.import`. `null` = lượt khác đã chuyển (idempotent). */
  async toProcessing(rec: RecordingEntity, i: { endedAt: Date | null; durationSec: number | null; sizeBytes: number | null; failedEgress: boolean }): Promise<RecordingEntity | null> {
    const { retentionDays } = await this.limits();
    const stoppedAt = rec.stoppedAt ?? i.endedAt ?? this.d.now();
    const updated = await this.d.tx.run(async (tx) => {
      const u = await this.d.recordings.transition(tx, rec.id, ["STARTING", "RECORDING", "STOPPING"], {
        status: "PROCESSING",
        stoppedAt,
        stopReason: rec.stopReason ?? (i.failedEgress ? "EGRESS_FAILED" : "MEETING_ENDED"),
        durationSec: i.durationSec,
        fileSizeBytes: i.sizeBytes,
        retentionExpiresAt: new Date(stoppedAt.getTime() + retentionDays * DAY_MS),
        error: null,
        importAttempts: 0,
      });
      if (!u) return null;
      await this.d.outbox.add(tx, recordingOutbox.import(u, 0));
      return u;
    });
    if (updated) {
      recordingEgressTotal.inc({ status: i.failedEgress ? "failed" : "complete" });
      this.signals.callRecordingOf(updated, "STOPPED");
      await this.notify(updated);
      await restorePublishAfterRecording(this.d, updated);
    }
    return updated;
  }

  /** Lỗi (egress hỏng không có tệp, import hết lượt thử): → FAILED + lý do đã làm sạch; chỉ báo tắt. Bản FAILED vẫn hết hạn sau `retentionDays`. */
  async toFailed(rec: RecordingEntity, raw: unknown, from: readonly RecordingEntity["status"][] = ["STARTING", "RECORDING", "STOPPING"]): Promise<RecordingEntity | null> {
    const { retentionDays } = await this.limits();
    const now = this.d.now();
    const u = await this.d.recordings.transition(undefined, rec.id, from, {
      status: "FAILED",
      error: sanitizeRecordingError(raw),
      stoppedAt: rec.stoppedAt ?? now,
      stopReason: rec.stopReason ?? "EGRESS_FAILED",
      retentionExpiresAt: new Date(now.getTime() + retentionDays * DAY_MS),
    });
    if (u) {
      if (from.includes("STARTING") || from.includes("RECORDING") || from.includes("STOPPING")) recordingEgressTotal.inc({ status: "failed" });
      this.signals.callRecordingOf(u, "FAILED");
      await this.notify(u);
      // Chỉ báo tắt ⇒ người vào sau chưa đồng ý được phát lại (bản FAILED từ PROCESSING thì không ai còn bị khoá — hàm tự thấy danh sách rỗng).
      await restorePublishAfterRecording(this.d, u);
    }
    return u;
  }

  /**
   * Xoá mềm + gỡ link + đánh dấu asset DELETED + xếp `recording.storage-delete` (cùng transaction). `false` khi đã xoá. Người gọi (`delete`) kiểm quyền và trạng thái
   * "đang chạy → MEET_009" TRƯỚC; cron hết hạn chỉ chọn bản READY/FAILED.
   */
  async remove(rec: RecordingEntity, by: string | null, reason: string): Promise<boolean> {
    const deleted = await this.d.tx.run(async (tx) => {
      const u = await this.d.recordings.markDeleted(tx, rec.id, this.d.now(), by, reason);
      if (!u) return null;
      if (u.assetId) {
        await this.assets.detach(tx, { assetId: u.assetId, target: "MEETING_RECORDING", targetId: u.id });
        await this.assets.markDeleted(tx, u.assetId);
      }
      await this.d.outbox.add(tx, recordingOutbox.storageDelete(u));
      return u;
    });
    if (!deleted) return false;
    await this.notify(deleted, { deleted: true });
    await this.refreshStorageGauge();
    return true;
  }

  /** Tổng dung lượng bản READY chưa xoá → gauge `recording_storage_bytes` (best-effort). */
  async refreshStorageGauge(): Promise<void> {
    try {
      recordingStorageBytes.set(await this.d.recordings.sumReadyBytes());
    } catch (err) {
      logger.warn("[recording] Không cập nhật gauge recording_storage_bytes", { error: errText(err) });
    }
  }
}
