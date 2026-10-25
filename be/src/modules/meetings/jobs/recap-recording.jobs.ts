import { registerLiveKitHandler } from "../../../infrastructure/media";
import { defineCron, registerJob } from "../../../infrastructure/queue";
import { getMeetingsContainer } from "../meetings.container";
import { registerMeetingAssetReadResolvers } from "../services/recap-asset-access";
import { RECAP_REMINDER_JOB, RECORDING_IMPORT_JOB, RECORDING_STOP_ON_END_JOB, RECORDING_STORAGE_DELETE_JOB } from "../services/recording-outbox";

/**
 * Side-effect (import từ `meeting.jobs.ts`, chạy ở worker): handler webhook LiveKit `egress_*` của phòng họp + processor việc nền của biên bản/ghi hình + hai
 * cron tick TĨNH (không scheduler theo từng bản ghi — `syncCronSchedulers` xoá scheduler động). Toàn bộ nghiệp vụ ở service (`getMeetingsContainer().recapRecording`);
 * file này chỉ giải payload rồi gọi. Processor idempotent, kiểm lại trạng thái.
 */
const kit = () => getMeetingsContainer().recapRecording;

// Worker riêng không chạy `registerMeetingsModule()`: đăng ký resolver quyền đọc tệp cho tiến trình này (idempotent — cùng targetType ghi đè).
registerMeetingAssetReadResolvers(() => getMeetingsContainer().room.deps);

registerLiveKitHandler({
  name: "p2-06.recording",
  roomKind: "meeting",
  types: ["egress_started", "egress_updated", "egress_ended"],
  handle: (event) => kit().egress.handle(event),
});

/** Tệp egress đã nằm trên S3 → `Asset READY` + `AssetLink` + tin/thông báo. Thiếu tệp: service tự hẹn lại bằng outbox (backoff), không ném. */
registerJob("media", RECORDING_IMPORT_JOB, async (job) => {
  await kit().importer.run((job.data as { recordingId: string }).recordingId);
});

/** Xoá object trên storage sau khi xoá mềm/hết hạn — object không tồn tại = thành công; lỗi thật → BullMQ thử lại. */
registerJob("media", RECORDING_STORAGE_DELETE_JOB, async (job) => {
  const { storageKey } = job.data as { storageKey: string };
  if (storageKey) await kit().storage.deleteObjects([storageKey]);
});

/** Chạm trần thời lượng một lần ghi: dừng nếu bản ghi còn chạy (processor kiểm lại — họp đã kết thúc/host đã dừng thì no-op). */
registerJob("calls", RECORDING_STOP_ON_END_JOB, async (job) => {
  await kit().recording.stopBySystem({ recordingId: (job.data as { recordingId: string }).recordingId }, "MAX_DURATION");
});

/** Nhắc lại viết biên bản sau `reminderAfterHours` (hộp thư + push cho chủ trì/đồng chủ trì) — no-op khi đã công bố/họp bắt đầu lại/đã xoá. */
registerJob("notifications", RECAP_REMINDER_JOB, async (job) => {
  const d = job.data as { meetingId: string; endedAtMs: number };
  await kit().events.fireRecapReminder(d);
});

// Hằng ngày 03:30: xoá bản READY/FAILED quá hạn lưu trữ (object + asset + link) + cập nhật gauge `recording_storage_bytes`.
registerJob("cron", "recording.retention-cleanup", async () => {
  await kit().maintenance.retentionCleanup();
});
defineCron({ schedulerId: "recording.retention-cleanup", queue: "cron", jobName: "recording.retention-cleanup", pattern: "30 3 * * *", opts: { attempts: 1 } });

// Mỗi 15 phút: bản kẹt STARTING/STOPPING/PROCESSING vì mất webhook → hỏi `listEgress` rồi áp như webhook tương ứng.
registerJob("cron", "recording.stuck-check", async () => {
  await kit().maintenance.stuckCheck();
});
defineCron({ schedulerId: "recording.stuck-check", queue: "cron", jobName: "recording.stuck-check", pattern: "*/15 * * * *", opts: { attempts: 1 } });
