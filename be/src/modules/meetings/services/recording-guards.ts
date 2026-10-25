import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { MeetingEntity } from "../entities/meeting.interface";
import { meetError, meetNotFound } from "./meeting-errors";
import type { RoomCall } from "./meeting-call.port";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import { loadViewer, type MeetingViewer } from "./recap-recording.access";
import type { RecordingCapability, RecordingRuntimeLimits } from "./recording-runtime";

export interface RecordableContext {
  meeting: MeetingEntity;
  call: RoomCall;
  viewer: MeetingViewer;
}

/** Người thấy cuộc họp nhưng không điều khiển được → 403 `MEET_002`; không thấy nội dung cuộc họp → 404 trung tính. */
export const notController = (v: MeetingViewer) => (v.canSeeDetail ? meetError(ErrorCode.MEET_002, 403) : meetNotFound());

/**
 * Điều kiện CHUNG để yêu cầu đồng ý/bắt đầu ghi hình (be.md §5.3–§5.4) — MỘT nơi, đúng thứ tự mã lỗi:
 * chủ trì/đồng chủ trì → cuộc họp nội bộ đang LIVE (`REC_007`) → cuộc họp cho phép + cờ hệ thống bật (`REC_006`) → hạ tầng S3/Egress (`REC_009`) →
 * chưa có bản ghi đang chạy (`REC_002`) → còn slot egress toàn hệ thống (`REC_003`, 503).
 */
export class RecordingGuards {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly capability: RecordingCapability,
    private readonly limits: () => Promise<RecordingRuntimeLimits>
  ) {}

  async assertCanRecord(user: AuthUser, meetingId: string): Promise<RecordableContext> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    const viewer = await loadViewer(this.d, meeting, user.id);
    if (!viewer.isHostLike) throw notController(viewer);
    if (meeting.platform !== "INTERNAL") throw meetError(ErrorCode.MEET_010, 409);
    if (meeting.status !== "LIVE" || !meeting.currentCallId) throw meetError(ErrorCode.REC_007, 409);
    if (!meeting.recordingAllowed || !(await this.capability.enabled())) throw meetError(ErrorCode.REC_006, 403);
    if (!this.capability.available()) throw meetError(ErrorCode.REC_009, 409);
    const call = await this.d.calls.findCall(meeting.currentCallId);
    if (!call || call.status === "ENDED") throw meetError(ErrorCode.REC_007, 409);
    if (await this.d.recordings.findActiveByCall(call.id)) throw meetError(ErrorCode.REC_002, 409);
    const { concurrentMax } = await this.limits();
    if ((await this.d.recordings.countActive()) >= concurrentMax) throw meetError(ErrorCode.REC_003, 503);
    return { meeting, call, viewer };
  }
}
