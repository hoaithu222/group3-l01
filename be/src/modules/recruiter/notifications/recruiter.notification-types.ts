import { registerNotificationType } from "../../notifications/public";
import type { NotificationTypeDef } from "../../notifications/public";

/**
 * Loại thông báo của p6-08 (đăng ký qua `registerNotificationType`, tạo bằng `notify()` trong transaction). Tên theo quy ước dấu chấm hiện hành (`career.skill-unlocked`…);
 * kế hoạch ghi `JOB_OFFER_RECEIVED`/`JOB_OFFER_MESSAGE`/`JOB_OFFER_RESPONDED`/`COMPANY_STATUS_CHANGED`. Không gắn scope; `refs` chỉ có id (+ tên công ty, dữ liệu công khai của công ty đã duyệt) —
 * push KHÔNG chứa tiêu đề/nội dung lời mời hay tin nhắn (CR-47).
 */
export const RECRUITER_NOTIFICATION_TYPES = {
  /** Sinh viên: có lời mời việc làm mới. */
  OFFER_RECEIVED: "job-offer.received",
  /** HR gửi lời mời: sinh viên Quan tâm / Từ chối. */
  OFFER_RESPONDED: "job-offer.responded",
  /** Bên kia trong lời mời nhắn tin mới (sau Quan tâm). */
  OFFER_MESSAGE: "job-offer.message",
  /** OWNER công ty: được duyệt / bị từ chối / tạm ngưng / khôi phục. */
  COMPANY_STATUS: "company.status-changed",
  /** Vận hành (admin/manager): có doanh nghiệp cần xử lý (đăng ký mới/gửi duyệt lại/chủ sở hữu cuối cùng xoá tài khoản) — gộp theo giờ (chỉ hộp thư). */
  COMPANY_NEEDS_REVIEW: "company.needs-review",
} as const;

const BASE: Omit<NotificationTypeDef, "type" | "pushType" | "priority" | "push" | "batchable" | "inbox"> = {
  inboxFilter: "all",
  androidChannel: "default",
  respectMute: "ALWAYS",
  bypassDnd: false,
  readAction: null,
  personal: true,
};

const str = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");

const STATUS_TEXT: Record<string, { title: string; body: string }> = {
  APPROVED: { title: "Doanh nghiệp đã được duyệt", body: "Doanh nghiệp của bạn đã được duyệt — bắt đầu tìm ứng viên và gửi lời mời." },
  REJECTED: { title: "Doanh nghiệp chưa được duyệt", body: "Hồ sơ doanh nghiệp chưa được duyệt. Mở để xem lý do và gửi lại." },
  SUSPENDED: { title: "Doanh nghiệp đang tạm ngưng", body: "Doanh nghiệp của bạn đang tạm ngưng hoạt động tuyển dụng." },
  PENDING: { title: "Doanh nghiệp đang chờ duyệt", body: "Hồ sơ doanh nghiệp đã được gửi và đang chờ duyệt." },
};

/** Idempotent (registry là `Map.set`) — gọi lúc import route (API) lẫn file job (worker). */
export function registerRecruiterNotificationTypes(): void {
  registerNotificationType({
    ...BASE,
    type: RECRUITER_NOTIFICATION_TYPES.OFFER_RECEIVED,
    pushType: RECRUITER_NOTIFICATION_TYPES.OFFER_RECEIVED,
    inbox: true,
    priority: 3,
    batchable: false,
    push: {
      ttlSeconds: 7 * 24 * 3600,
      collapseKey: (refs) => `job-offer:${str(refs["offerId"])}`,
      dataKeys: ["offerId"],
      template: ({ refs }) => ({ title: "Bạn có lời mời việc làm mới", body: str(refs["companyName"]) ? `${str(refs["companyName"])} đã gửi lời mời cho bạn` : "Một doanh nghiệp đã gửi lời mời cho bạn" }),
    },
  });
  registerNotificationType({
    ...BASE,
    type: RECRUITER_NOTIFICATION_TYPES.OFFER_RESPONDED,
    pushType: RECRUITER_NOTIFICATION_TYPES.OFFER_RESPONDED,
    inbox: true,
    priority: 2,
    batchable: false,
    push: {
      ttlSeconds: 24 * 3600,
      collapseKey: (refs) => `job-offer-responded:${str(refs["offerId"])}`,
      dataKeys: ["offerId", "companyId"],
      template: ({ refs }) => ({ title: "Ứng viên đã phản hồi lời mời", body: str(refs["status"]) === "INTERESTED" ? "Một ứng viên quan tâm lời mời của bạn" : "Một ứng viên đã phản hồi lời mời của bạn" }),
    },
  });
  registerNotificationType({
    ...BASE,
    type: RECRUITER_NOTIFICATION_TYPES.OFFER_MESSAGE,
    pushType: RECRUITER_NOTIFICATION_TYPES.OFFER_MESSAGE,
    inbox: true,
    priority: 2,
    batchable: true,
    push: {
      ttlSeconds: 24 * 3600,
      collapseKey: (refs) => `job-offer-message:${str(refs["offerId"])}`,
      dataKeys: ["offerId", "companyId"],
      template: () => ({ title: "Tin nhắn mới trong lời mời", body: "Bạn có tin nhắn mới trong một lời mời việc làm" }),
    },
  });
  registerNotificationType({
    ...BASE,
    type: RECRUITER_NOTIFICATION_TYPES.COMPANY_STATUS,
    pushType: RECRUITER_NOTIFICATION_TYPES.COMPANY_STATUS,
    inbox: true,
    priority: 3,
    batchable: false,
    push: {
      ttlSeconds: 7 * 24 * 3600,
      collapseKey: (refs) => `company-status:${str(refs["companyId"])}`,
      dataKeys: ["companyId", "status"],
      template: ({ refs }) => STATUS_TEXT[str(refs["status"])] ?? { title: "Doanh nghiệp cập nhật", body: "Trạng thái doanh nghiệp của bạn vừa thay đổi" },
    },
  });
  // Chỉ hộp thư vận hành (không push): gộp theo giờ nên không có template.
  registerNotificationType({
    ...BASE,
    type: RECRUITER_NOTIFICATION_TYPES.COMPANY_NEEDS_REVIEW,
    pushType: null,
    inbox: true,
    priority: 1,
    batchable: true,
  });
}
