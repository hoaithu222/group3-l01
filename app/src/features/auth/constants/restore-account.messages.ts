import { formatDateTime } from '@/shared/utils/format/date.utils';

/**
 * Câu chữ của màn "Khôi phục tài khoản" (p0-01 mục 3) — huỷ yêu cầu xoá tài khoản khi đăng nhập bị
 * chặn `AUTH_012` hoặc ngay sau khi vừa yêu cầu xoá.
 *
 * ⚠️ Không dùng chung với `features/me` — hai feature không được import chéo nhau
 * (`docs/rules/feature-structure.md`), nên `account-deletion.messages.ts` bên đó có bản riêng.
 */

export const RESTORE_ACCOUNT_TITLE = 'Khôi phục tài khoản';
export const RESTORE_ACCOUNT_SUBTITLE =
  'Nhập lại email và mật khẩu để huỷ yêu cầu xoá và dùng lại tài khoản.';
export const RESTORE_ACCOUNT_ALERT_TITLE = 'Tài khoản đang chờ xoá';
export const RESTORE_ACCOUNT_SUCCESS = 'Đã huỷ yêu cầu xoá. Hãy đăng nhập lại để tiếp tục.';

/**
 * Dòng giải thích trong dải cảnh báo. `until` (ISO, do màn "Xoá tài khoản" truyền sang) chỉ có khi
 * người dùng vừa yêu cầu xoá trên máy này; từ lượt đăng nhập bị `AUTH_012` thì BE không nói mốc nào.
 * Chuỗi không đọc được thành ngày ⇒ dùng câu chung, không hiện "Invalid Date".
 */
export function restoreAccountNotice(until: string | undefined): string {
  const formatted = formatDateTime(until);
  return formatted
    ? `Tài khoản sẽ bị xoá vào ${formatted} nếu bạn không huỷ yêu cầu trước thời điểm đó.`
    : 'Tài khoản này đang trong thời gian chờ xoá. Huỷ yêu cầu để tiếp tục dùng tài khoản.';
}
