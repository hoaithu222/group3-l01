/**
 * Đích của một thông báo — hình dạng CHUNG cho push (`data` của FCM) và hộp thư Hoạt động (`InboxItem.refs`). Tách khỏi
 * `notification-route.ts` (bảng `type → route`) để file đó giữ trong trần độ dài; `notification-route.ts` vẫn re-export kiểu này.
 */
export interface NotificationTarget {
  /** id đơn ứng tuyển cố vấn (`mentor.application`, p6-03) — hiện `mentor-route.ts` chưa dùng (màn duyệt đơn liệt kê theo bài). */
  applicationId?: string;
  /** id lượt thi thử (`study.mock-auto-submitted`, p4-02) — mở thẳng kết quả lượt đó. */
  attemptId?: string;
  boardId?: string;
  callId?: string;
  /** id nhóm chat cố vấn (`mentor.accepted`, p6-03) — mở thẳng nhóm chat; thiếu (không tạo nhóm chat) thì về tổng quan nhóm. */
  conversationId?: string;
  /** id tài liệu (`document.collaborator-added`, p6-01) — mở thẳng tài liệu (`/workspaces/[wsId]/docs/[docId]`); thiếu thì về danh sách tài liệu của nhóm. */
  documentId?: string;
  /** id đợt cố vấn (`mentor.*`, p6-03). */
  engagementId?: string;
  /** id lượt xuất báo cáo đóng góp (`contribution.export-ready|failed`, p4-06) — mở đúng trạng thái lượt đó ở màn "Đóng góp". */
  exportId?: string;
  /** Push gộp: "N tin nhắn mới" — KHÔNG nhảy tới một tin cụ thể (`messageId` khi đó chỉ là tin mới nhất). */
  coalesced?: boolean;
  /** `data.kind` của push nhắc biên bản họp (`meeting.reminder` + `RECAP`, p2-06) — phân biệt với nhắc SẮP TỚI GIỜ họp. */
  kind?: string;
  /** id buổi học lộ trình (`roadmap.lesson-due-reminder`, p4-07 bước 12) — mở màn buổi học đến hạn, kèm `subjectId`. */
  lessonId?: string;
  /** id cuộc họp (`meeting.*`, p2-04) — mở chi tiết cuộc họp. */
  meetingId?: string;
  messageId?: string;
  /** id lời mời việc làm (`job-offer.received|message`, p6-08) — mở chi tiết/thread của lời mời đó. */
  offerId?: string;
  /** id đơn in (`print-order.*`, p6-05) — mở vé đơn `/me/o2o/print/{orderId}`. */
  orderId?: string;
  /** id bài tìm cố vấn (`mentor.application`, p6-03) — mở màn duyệt đơn của bài đó. */
  postId?: string;
  /** id bản ghi cuộc họp (`meeting.recording-ready`, p2-06) — CHỈ có ở `refs` của hộp thư (push không mang) → mở đúng bản ghi. */
  recordingId?: string;
  /** id lời nhắc (`message.reminder`, p7-04) — chỉ để tương quan; đích là tin (`messageId`) hoặc "Nhắc lại của tôi". */
  reminderId?: string;
  /** id TIN GỐC của luồng (= `Message.threadId` của BE, KHÔNG phải `Thread.id`) — dùng cho `/thread/[messageId]`. */
  rootMessageId?: string;
  /** id tin hẹn giờ (`scheduled-message.failed`, p7-04) — mở "Tin đã hẹn" tô đúng dòng đó. */
  scheduledMessageId?: string;
  scopeId?: string;
  scopeType?: string;
  /** id môn lộ trình (`roadmap.lesson-due-reminder`, p4-07 bước 12) — cùng `lessonId` dựng `roadmapLessonHref`. */
  subjectId?: string;
  taskId?: string;
  type: string;
  /** `message.reminder` với tin đã gỡ/mất quyền lúc đến hạn (p7-04) — không có `messageId`, không mở tin. */
  unavailable?: boolean;
  workspaceId?: string;
}
