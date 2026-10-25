import { registerCallSignalSink } from "../../calls";
import { registerMeetingEventSink } from "../../meetings";
import { callSignalToUpdate, meetingEventToUpdate, type CallSignalLike, type MeetingEventLike } from "./admin-media.mapping";
import { AdminMediaUpdatedPublisher } from "./admin-media-updated.publisher";

export const ADMIN_MEDIA_SINK_NAME = "p2-07.admin-media";

/**
 * Đăng ký sink nhận sự kiện của `meetings` (`meeting.events`) và `calls` (`call.signal-dispatch`) — mỗi cặp (queue, jobName) chỉ có MỘT processor nên module ngoài dùng sink chứ không đòi
 * hàng outbox riêng (cùng mẫu `p5-03.calendar`, `p4-06.contribution`). Gọi lúc import file job (worker, `register-jobs.ts`); idempotent theo tên.
 * ⚠ `recording.deleted` KHÔNG có sự kiện nguồn dùng chung được (outbox `recording.storage-delete` có processor riêng) nên chưa phát `RECORDING/DELETED`.
 */
export function registerAdminMediaSinks(publisher: AdminMediaUpdatedPublisher = new AdminMediaUpdatedPublisher()): void {
  registerMeetingEventSink(ADMIN_MEDIA_SINK_NAME, async (payload: MeetingEventLike) => {
    const u = meetingEventToUpdate(payload);
    if (u) await publisher.publish(u);
  });
  registerCallSignalSink(ADMIN_MEDIA_SINK_NAME, async (payload: CallSignalLike) => {
    const u = callSignalToUpdate(payload);
    if (u) await publisher.publish(u);
  });
}
