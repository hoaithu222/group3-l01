import type { SessionSummary } from '@/core/api/auth';

/**
 * Câu chữ tiếng Việt riêng của màn "Phiên đăng nhập" (p0-01 mục 10, mở từ
 * `me/settings`).
 *
 * ⚠️ Không gộp chung với hằng số của `features/auth` — `features/me` KHÔNG
 * được import chéo feature (`docs/rules/feature-structure.md`), cùng lý do
 * `biometric.messages.ts` ngay cạnh đây tách khỏi bản của `features/auth`.
 */

/** Nhãn phương thức đăng nhập — CHỈ hai giá trị theo hợp đồng BE, không suy diễn thêm. */
export function sessionAuthMethodLabel(authMethod: SessionSummary['authMethod']): string {
  return authMethod === 'BIOMETRIC' ? 'Đăng nhập bằng Face ID/vân tay' : 'Mật khẩu';
}

/**
 * Tên hiển thị cho THIẾT BỊ của một phiên.
 *
 * ⛔ KHÔNG tự viết parser `userAgent` — chuỗi UA thật (`Mozilla/5.0 (Linux;
 * Android 14; ...) ...`) đổi dạng theo từng đời máy/hệ điều hành/trình duyệt,
 * và một bộ suy luận tự chế dễ đọc sai tên máy hơn là hữu ích. Có `userAgent`
 * thì hiện NGUYÊN CHUỖI (nơi gọi tự cắt bằng `labelNumberOfLines`); không có
 * thì rơi về nhãn phương thức đăng nhập — vẫn còn nghĩa hơn để trống.
 */
export function sessionDeviceLabel(session: SessionSummary): string {
  const userAgent = session.userAgent?.trim();
  return userAgent && userAgent.length > 0 ? userAgent : sessionAuthMethodLabel(session.authMethod);
}

/** Tiêu đề hộp thoại xác nhận thu hồi — CỐ Ý không đổi theo từng phiên, giữ hộp thoại ngắn gọn. */
export const SESSION_REVOKE_DIALOG_TITLE = 'Thu hồi phiên đăng nhập?';

/** Mô tả hộp thoại xác nhận — nhắc rõ hậu quả trước khi gọi API thật. */
export function sessionRevokeDialogDescription(session: SessionSummary): string {
  return `Thiết bị "${sessionDeviceLabel(session)}" sẽ bị đăng xuất ngay lập tức và phải đăng nhập lại.`;
}

/**
 * "Đăng xuất tất cả thiết bị" (`POST /auth/logout-all`). Khác thu hồi MỘT phiên ở chỗ nó cũng đăng xuất CHÍNH MÁY NÀY
 * và tắt đăng nhập sinh trắc học (BE thu hồi mọi credential) — hộp thoại phải nói đủ hai hậu quả đó trước khi gọi API.
 */
export const LOGOUT_ALL_BUTTON_LABEL = 'Đăng xuất tất cả thiết bị';
export const LOGOUT_ALL_HINT = 'Kể cả thiết bị này. Bạn sẽ phải đăng nhập lại.';
export const LOGOUT_ALL_DIALOG_TITLE = 'Đăng xuất khỏi tất cả thiết bị?';
export const LOGOUT_ALL_DIALOG_DESCRIPTION =
  'Mọi phiên đăng nhập, kể cả thiết bị này, sẽ bị đăng xuất ngay và phải đăng nhập lại. Đăng nhập bằng Face ID/vân tay đã bật cũng bị tắt.';
export const LOGOUT_ALL_DONE_MESSAGE = 'Đã đăng xuất khỏi tất cả thiết bị. Hãy đăng nhập lại.';

/**
 * IP RÚT GỌN cho danh sách phiên (p0-01 mục 3: "IP rút gọn"): đủ để người dùng nhận ra "không phải
 * mạng nhà mình" mà không phơi địa chỉ đầy đủ ra màn hình (chụp màn hình, đưa máy cho người khác
 * xem). IPv4 giữ hai đoạn đầu; IPv6 giữ hai nhóm đầu; `::ffff:a.b.c.d` (IPv4 bọc trong IPv6 —
 * Express hay trả dạng này) xử lý như IPv4. Dạng lạ hoặc loopback ⇒ `null` (không hiện, đừng đoán).
 */
export function maskIpAddress(raw: string | null | undefined): string | null {
  const ip = raw?.trim();
  if (!ip) return null;

  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/i.exec(ip);
  if (v4) return `${v4[1] ?? ''}.${v4[2] ?? ''}.*.*`;

  if (ip.includes(':')) {
    const head = (ip.split('::')[0] ?? '').split(':').filter(Boolean).slice(0, 2).join(':');
    return head ? `${head}:…` : null;
  }
  return null;
}

/**
 * Nhãn trợ năng của nút "Thu hồi" — NÊU TÊN thiết bị (p0-01 mục 7). Chỉ chữ "Thu hồi" thì N hàng có
 * N nút trùng tên, trình đọc màn hình không cho người dùng biết nút nào thu hồi phiên nào.
 */
export function sessionRevokeAccessibilityLabel(session: SessionSummary): string {
  return `Thu hồi phiên trên ${sessionDeviceLabel(session)}`;
}
