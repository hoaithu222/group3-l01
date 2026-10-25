import type { OutboxEventInput } from "../../../infrastructure/queue";
import type { RecordingEntity } from "../entities/meeting-recap.interface";

export const RECORDING_IMPORT_JOB = "recording.import";
export const RECORDING_STORAGE_DELETE_JOB = "recording.storage-delete";
export const RECORDING_STOP_ON_END_JOB = "recording.stop-on-end";
export const RECAP_REMINDER_JOB = "meeting.recap-reminder";

/**
 * Hàng outbox của ghi hình/biên bản (be.md §7) — việc "phải làm sau khi commit" ghi BỀN trong cùng transaction với thay đổi trạng thái, relay tự đẩy vào
 * BullMQ. `dedupeKey` (= jobId, unique) tất định theo thực thể: xếp trùng vô hại nhưng CHỈ ghi khi CAS trạng thái thành công (ghi trùng trong transaction
 * sẽ làm hỏng transaction do P2002).
 */
export const recordingOutbox = {
  /** Import tệp egress → Asset READY (queue `media`). `attempt` khác nhau cho mỗi lần "Thử lại import" (jobId cũ đã nằm trong `removeOnComplete`). */
  import: (rec: Pick<RecordingEntity, "id" | "meetingId">, attempt: number, availableAt?: Date): OutboxEventInput => ({
    type: RECORDING_IMPORT_JOB,
    aggregateType: "MeetingRecording",
    aggregateId: rec.id,
    queue: "media",
    jobName: RECORDING_IMPORT_JOB,
    dedupeKey: `recording.import:recording:${rec.id}${attempt > 0 ? `:r${attempt}` : ""}`,
    payload: { recordingId: rec.id, meetingId: rec.meetingId },
    ...(availableAt ? { availableAt } : {}),
  }),
  /** Xoá object trên storage sau khi xoá mềm/hết hạn (queue `media`, retry 5). */
  storageDelete: (rec: Pick<RecordingEntity, "id" | "meetingId" | "storageKey">): OutboxEventInput => ({
    type: RECORDING_STORAGE_DELETE_JOB,
    aggregateType: "MeetingRecording",
    aggregateId: rec.id,
    queue: "media",
    jobName: RECORDING_STORAGE_DELETE_JOB,
    dedupeKey: `recording.storage-delete:recording:${rec.id}`,
    payload: { recordingId: rec.id, storageKey: rec.storageKey },
  }),
  /** Hẹn giờ dừng ghi khi chạm trần thời lượng (`availableAt`); processor kiểm lại trạng thái nên hàng thừa vô hại. */
  stopOnEnd: (rec: Pick<RecordingEntity, "id" | "meetingId">, at: Date): OutboxEventInput => ({
    type: RECORDING_STOP_ON_END_JOB,
    aggregateType: "MeetingRecording",
    aggregateId: rec.id,
    queue: "calls",
    jobName: RECORDING_STOP_ON_END_JOB,
    dedupeKey: `recording.stop-on-end:recording:${rec.id}`,
    payload: { recordingId: rec.id, meetingId: rec.meetingId },
    availableAt: at,
  }),
  /** Nhắc lại viết biên bản sau khi họp kết thúc (`endedAtMs` phân biệt các phiên bắt đầu lại). */
  recapReminder: (meetingId: string, endedAtMs: number, at: Date): OutboxEventInput => ({
    type: RECAP_REMINDER_JOB,
    aggregateType: "Meeting",
    aggregateId: meetingId,
    queue: "notifications",
    jobName: RECAP_REMINDER_JOB,
    dedupeKey: `meeting.recap-reminder:meeting:${meetingId}:e${endedAtMs}`,
    payload: { meetingId, endedAtMs },
    availableAt: at,
  }),
};
