import { registerLiveKitHandler } from "../../../infrastructure/media";
import { defineCron, registerJob } from "../../../infrastructure/queue";
import { getMeetingsContainer } from "../meetings.container";
import type { MeetingForceEndPayload } from "../services/meeting-force-end.service";
import type { AutoCloseJob, HostGraceJob } from "../services/meeting-room.maintenance.service";
import { registerMeetingRoomRevokeListener } from "./meeting-room-revoke-listener";

/**
 * Side-effect (import từ `meeting.jobs.ts`, chạy ở worker): processor queue `calls` của phòng họp + handler webhook LiveKit `meet_*` (p0-08 dispatcher) +
 * cron tự sửa. Toàn bộ nghiệp vụ ở service (`getMeetingsContainer().room`); file này chỉ giải payload rồi gọi. Processor idempotent, kiểm lại trạng thái.
 */
registerMeetingRoomRevokeListener();

registerLiveKitHandler({
  name: "p2-05.meetings",
  roomKind: "meeting",
  types: ["participant_joined", "participant_left", "room_finished", "track_published", "track_unpublished"],
  handle: (event) => getMeetingsContainer().room.webhook.handle(event),
});

registerJob("calls", "meeting.auto-close", async (job) => {
  await getMeetingsContainer().room.maintenance.autoClose(job.data as AutoCloseJob);
});

registerJob("calls", "meeting.host-grace", async (job) => {
  await getMeetingsContainer().room.maintenance.hostGrace(job.data as HostGraceJob);
});

registerJob("calls", "meeting.attendance-finalize", async (job) => {
  await getMeetingsContainer().room.maintenance.finalizeAttendance((job.data as { meetingId: string }).meetingId);
});

registerJob("calls", "meeting.force-end", async (job) => {
  await getMeetingsContainer().room.forceEnd.run(job.data as MeetingForceEndPayload);
});

registerJob("calls", "meeting.room-lifecycle", async (job) => {
  await getMeetingsContainer().room.maintenance.endWorkspaceRooms((job.data as { workspaceId: string }).workspaceId);
});

// Lưới an toàn: cuộc họp LIVE mà cuộc gọi đã kết thúc, hoặc quá giờ tự đóng mà job hẹn bị mất (Redis/worker sự cố). Tick TĨNH (không scheduler theo thực thể).
registerJob("cron", "meeting.room-reconcile", async () => {
  await getMeetingsContainer().room.maintenance.reconcileLive();
});
defineCron({ schedulerId: "meeting.room-reconcile", queue: "cron", jobName: "meeting.room-reconcile", pattern: "*/2 * * * *", opts: { attempts: 1 } });
