/**
 * Mã lỗi p3-04 — khách (GUEST), lời mời đích danh theo email, duyệt tham gia, cấp quyền
 * kênh riêng tư → câu tiếng Việt.
 *
 * Tách khỏi `error-codes.ts` (đã ở sát trần dòng của `file-size-manifest.json`) theo đúng
 * mẫu `message-error-codes.constants.ts`; `error-codes.ts` trải bảng này vào
 * `ERROR_CODE_MESSAGES`, nên `client.helpers.ts` vẫn chỉ tra MỘT bảng.
 *
 * ⚠️ Số mã lấy từ `be/src/core/utils/error.codes.ts` sau khi ĐÁNH SỐ LẠI ở D-28
 * (`docs/plans/00-foundation/04-decisions.md`): be.md p3-04 §8 gốc dùng `INV_006..009`,
 * `WS_010..012`, `CH_009` trùng mã Phase 1 — ba mã đó vẫn giữ nghĩa Phase 1
 * (`INV_006` "quá nhiều lời mời đang hoạt động", …) ở `error-codes.ts`. Đổi số ở BE thì đổi
 * cả ở đây VÀ ở `members/api/invitations.constants.ts`.
 */
export const ACCESS_ERROR_MESSAGES: Record<string, string> = {
  // ── Lời mời đích danh theo email ─────────────────────────────────────────
  INV_008: 'Lời mời này dành cho một địa chỉ email khác hoặc email của bạn chưa được xác minh',
  INV_009: 'Liên kết mời không thể dùng để mời khách',
  INV_010: 'Lời mời đã hết hạn hoặc đã bị thu hồi',
  INV_011: 'Người này đã là thành viên của nhóm',

  // ── Duyệt tham gia / mời khách ───────────────────────────────────────────
  // `WS_017` là 202 trả trong `data.status`, KHÔNG phải lỗi — khai để nếu lọt vào đường lỗi vẫn có câu.
  WS_017: 'Yêu cầu tham gia đang chờ quản trị nhóm duyệt',
  WS_018: 'Nhóm chưa bật mời khách hoặc đã đủ số khách',
  WS_019: 'Bạn vừa bị từ chối, hãy thử lại sau',

  // ── Chỉ định kênh riêng tư cho khách ─────────────────────────────────────
  CH_013: 'Bạn chỉ có thể chỉ định kênh riêng tư mà bạn quản lý',

  // ── Khách trong hội thoại (D-16) — thông điệp TRUNG TÍNH, không lộ ai cùng nhóm ─
  CONV_014: 'Bạn chưa thể nhắn tin trực tiếp cho người này',
  CONV_015: 'Nhóm chat này chưa cho phép khách tham gia',
};
