/**
 * Mã lỗi BE mà `members` (p3-04) phân nhánh theo — TẬP TRUNG một chỗ.
 *
 * ⚠️ be.md p3-04 §8 GỐC đặt `INV_006..009`/`WS_010..012`/`CH_009` TRÙNG mã Phase 1; BE đã
 * ĐÁNH SỐ LẠI ở D-28 (`docs/plans/00-foundation/04-decisions.md`, đối chiếu
 * `be/src/core/utils/error.codes.ts`): bảng dưới là số CUỐI CÙNG. Các mã Phase 1 giữ nghĩa
 * cũ (`INV_006` = "quá nhiều lời mời đang hoạt động", `INV_007` = "lời mời không hợp lệ",
 * `WS_010..012`, `CH_009`) — ⛔ đừng dùng nhầm số của be.md gốc. Đổi số ở BE thì sửa bảng này
 * và `shared/constants/access-error-codes.constants.ts` (câu tiếng Việt).
 */
export const INVITATION_ERROR = {
  /** 403 — tài khoản đang đăng nhập KHÁC email được mời, hoặc email chưa xác minh (`details.reason`). */
  EMAIL_MISMATCH: 'INV_008',
  /** 410 — lời mời hết hạn/đã thu hồi/đã dùng. */
  EXPIRED: 'INV_010',
  /** 409 — người được mời đã là thành viên. */
  ALREADY_MEMBER: 'INV_011',
  /** 403 — bị chặn khỏi nhóm (mã Phase 1, giữ nguyên). */
  BLOCKED: 'INV_004',
  /** 409 — nhóm chưa bật mời khách hoặc đã đủ số khách. */
  GUEST_DISABLED: 'WS_018',
  /** 429 — vừa bị từ chối, xin lại sau 24 giờ (kiểm ở `POST /invites/:token/accept`). */
  REJECTED_COOLDOWN: 'WS_019',
  /** 403 — chỉ định kênh riêng tư mà mình không quản lý. */
  CHANNEL_NOT_MANAGED: 'CH_013',
  /** 429 — vượt hạn mức theo giờ/cooldown (gửi lại lời mời trong 12 giờ). */
  RATE_LIMITED: 'RATE_003',
} as const;

/** `details.reason` của lỗi email không khớp (be.md §4 `INV_008`). */
export type EmailMismatchReason = 'EMAIL_MISMATCH' | 'EMAIL_NOT_VERIFIED';

/** Trần số email/lần mời (`inviteMembersSchema`: `.max(20)`). */
export const INVITE_EMAILS_MAX = 20;
/** Trần lời nhắn (`z.string().max(500)`). */
export const INVITE_MESSAGE_MAX = 500;
/**
 * Trần lời nhắn khi xin vào nhóm cần duyệt (`POST /invites/:token/accept` body `{ requestMessage }` —
 * BE `INVITE_REQUEST_MESSAGE_MAX`; quá dài → `400 VAL_001`). Số bằng `INVITE_MESSAGE_MAX` nhưng là trường KHÁC của BE.
 */
export const JOIN_REQUEST_MESSAGE_MAX = 500;
/** Số kênh chỉ định tối đa (`LIMITS.guest.designatedChannelsMax`). */
export const GUEST_CHANNELS_MAX = 10;
/** Số ngày mặc định/tối đa của khách (`LIMITS.guest.defaultDays`/`maxDays`). */
export const GUEST_DAYS_DEFAULT = 30;
export const GUEST_DAYS_MAX = 90;
/** Các mốc chọn nhanh (app.md §2 `GuestDaysSelector`). */
export const GUEST_DAY_OPTIONS = [7, 14, 30, 60, 90] as const;
