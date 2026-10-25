import { registerNotificationType } from "../../notifications/public";

/**
 * Loại thông báo của cuộc họp (p2-04 be.md §7). `meeting.invited/updated/cancelled/reminder/started` đã đăng ký sẵn ở lõi (p0-06);
 * `meeting.removed` (bị xoá khỏi danh sách) và `meeting.role-changed` (được chuyển chủ trì/thành đồng chủ trì) chỉ vào HỘP THƯ, không push
 * (README §7 ma trận: "—" ở cột Push). Gọi lúc import routes (API) và file job (worker) — idempotent.
 */
export function registerMeetingNotificationTypes(): void {
  // (p2-06) `meeting.recap-published` đã đăng ký sẵn ở lõi (p0-06); ba loại dưới đây chỉ vào HỘP THƯ trừ nhắc lại biên bản (có push).
  // (p2-07) `meeting.force-ended`: admin nền tảng kết thúc cưỡng bức — báo CHỦ TRÌ/ĐỒNG CHỦ TRÌ ("Cuộc họp đã được kết thúc bởi quản trị hệ thống"); chỉ hộp thư (họ đang ở phòng nên đã nhận `meeting:ended`).
  for (const type of ["meeting.removed", "meeting.role-changed", "meeting.recap-required", "meeting.recording-ready", "meeting.force-ended"] as const) {
    registerNotificationType({
      type,
      inbox: true,
      inboxFilter: "meetings",
      pushType: null,
      androidChannel: "default",
      priority: 1,
      respectMute: "ALWAYS",
      bypassDnd: false,
      batchable: false,
      readAction: null,
    });
  }
  // Nhắc lại viết biên bản sau 24 giờ (README p2-06 §3.3): hộp thư + push, dùng LẠI push type `meeting.reminder` (app đã có kênh/định tuyến) với `data.kind = RECAP` — KHÔNG thêm push type mới.
  registerNotificationType({
    type: "meeting.recap-reminder",
    inbox: true,
    inboxFilter: "meetings",
    pushType: "meeting.reminder",
    androidChannel: "default",
    priority: 2,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
    push: {
      dataKeys: ["meetingId", "kind"],
      collapseKey: (refs) => `recap-reminder:${typeof refs["meetingId"] === "string" ? refs["meetingId"] : "-"}`,
      template: () => ({ title: "Đừng quên biên bản họp", body: "Cuộc họp đã kết thúc — hãy ghi và công bố biên bản." }),
    },
  });
}
