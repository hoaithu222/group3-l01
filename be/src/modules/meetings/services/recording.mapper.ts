import { ACTIVE_RECORDING_STATUSES, type RecordingDto, type RecordingEntity } from "../entities/meeting-recap.interface";
import type { RecordingRights } from "./recap-recording.access";

const iso = (d: Date | null | undefined): string | undefined => (d ? d.toISOString() : undefined);

/**
 * Dựng `RecordingDto` (be.md §4). `myActions` do SERVER tính từ quyền + trạng thái (client chỉ vẽ nút). `error` (đã làm sạch) chỉ người điều khiển thấy;
 * `consentCount` là SỐ người đã đồng ý — KHÔNG có danh sách tên. `canRetry` chỉ khi egress ĐÃ ghi được tệp (`fileSizeBytes`) mà import thất bại.
 */
export function toRecordingDto(rec: RecordingEntity, rights: RecordingRights, now: Date): RecordingDto {
  const running = rec.status === "STARTING" || rec.status === "RECORDING";
  const busy = (ACTIVE_RECORDING_STATUSES as readonly string[]).includes(rec.status);
  return {
    id: rec.id,
    meetingId: rec.meetingId,
    status: rec.status,
    layout: rec.layout,
    startedBy: rec.startedBy,
    startedAt: rec.startedAt.toISOString(),
    ...(rec.stoppedAt ? { stoppedAt: iso(rec.stoppedAt) } : {}),
    ...(rec.stopReason ? { stopReason: rec.stopReason } : {}),
    ...(rec.durationSec !== null ? { durationSec: rec.durationSec } : {}),
    ...(rec.fileSizeBytes !== null ? { fileSizeBytes: rec.fileSizeBytes } : {}),
    ...(rec.retentionExpiresAt ? { retentionExpiresAt: iso(rec.retentionExpiresAt) } : {}),
    ...(rights.canControl && rec.error ? { error: rec.error } : {}),
    consentCount: rec.consentSnapshot.length,
    myActions: {
      canStop: rights.canControl && running,
      canDownload: rights.canDownload && rec.status === "READY",
      canDelete: rights.canDelete && !busy,
      canRetry: rights.canControl && rec.status === "FAILED" && rec.fileSizeBytes !== null,
    },
    serverNow: now.toISOString(),
  };
}
