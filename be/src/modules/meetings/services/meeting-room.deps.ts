import type { IMediaServer } from "../../../infrastructure/media";
import type { MeetingDeps } from "./meeting.deps";
import type { MeetingCallPort } from "./meeting-call.port";
import type { MeetingRoomStore } from "./meeting-room.store";

/** Việc nền của phòng họp ngoài outbox (hẹn ngắn / không bắt buộc bền: cron `meeting.room-reconcile` quét bù). */
export interface MeetingRoomJobsPort {
  /** Chủ trì/đồng chủ trì cuối cùng rời: sau `delayMs` (30 s) kiểm lại và cấp `CO_HOST` tạm cho người vào sớm nhất. */
  scheduleHostGrace(input: { meetingId: string; callId: string }, delayMs: number): Promise<void>;
  /** Điểm danh sau khi kết thúc (`meeting.attendance-finalize:call:<id>`) — idempotent (ghi đè, không cộng dồn). */
  enqueueAttendanceFinalize(input: { meetingId: string; callId: string }): Promise<void>;
}

/** Phụ thuộc chung của các service phòng họp: mọi thứ của `MeetingDeps` + cổng cuộc gọi, Redis tạm, máy chủ media, job. */
export interface MeetingRoomDeps extends MeetingDeps {
  calls: MeetingCallPort;
  store: MeetingRoomStore;
  /** Lấy lười để test đổi `setMediaServerForTests` sau khi dựng container. */
  media: () => IMediaServer;
  roomJobs: MeetingRoomJobsPort;
}
