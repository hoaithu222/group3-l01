import { NOTIFICATION_DEFAULTS_SAVE_IMPACT } from '../notifications/constants/notifications.constants';
import { PM_TIMEZONE_SAVE_IMPACT } from '../pm/constants/pm.constants';

/** Câu "tác động" mặc định trong hộp thoại lý do khi lưu một nhóm cấu hình. */
export const DEFAULT_SAVE_IMPACT = 'Giá trị áp dụng cho mọi người dùng trong ≤ 60 giây.';

/**
 * Câu tác động RIÊNG theo khoá registry — khoá nào có nghĩa nghiệp vụ đặc biệt thì nói rõ ở đây
 * (vd `notification.defaults` chỉ đổi mặc định, không đổi cài đặt người dùng đã tự chọn).
 */
const SAVE_IMPACT_BY_KEY: Readonly<Record<string, string>> = {
  'notification.defaults': NOTIFICATION_DEFAULTS_SAVE_IMPACT,
  // `pm`: form chung chỉ còn field múi giờ (mẫu cột là thẻ riêng) — đổi múi giờ làm tính lại báo cáo đóng góp (p4-06).
  pm: PM_TIMEZONE_SAVE_IMPACT,
  // `auth`: cờ tắt được BE kiểm ở route (`AUTH_016` với sinh trắc học) và app đọc từ `capabilities.auth`.
  auth: 'Áp dụng cho mọi người dùng ứng dụng trong ≤ 60 giây. Tắt đăng nhập sinh trắc học thì người dùng phải đăng nhập bằng mật khẩu; đổi thời gian khoá có hiệu lực ở lần app tải lại cấu hình.',
  // p4-01/p6-03/p6-04: BE đọc các khoá này lúc chạy (`study-limits`, `mentor-settings`, `wallet-defaults`) — chỉ ảnh hưởng thao tác/thực thể tạo SAU khi lưu.
  'limits.study':
    'Áp dụng cho lần tạo/lưu bộ học sau đó trong ≤ 60 giây. Hạ trần không xoá dữ liệu đã có, nhưng bộ đang vượt trần mới chỉ lưu được khi giảm số mục xuống trong trần.',
  mentor:
    'Chỉ áp dụng cho đợt cố vấn được chấp nhận SAU khi lưu mà người duyệt không nhập số ngày; đợt đang chạy giữ nguyên thời hạn.',
  wallet:
    'Áp dụng cho ví nhóm CHƯA được chủ nhóm/quản trị nhóm đặt lịch nhắc và múi giờ riêng (kể cả ví tạo sau này); ví đã đặt riêng giữ nguyên.',
};

export const saveImpactFor = (key: string): string =>
  SAVE_IMPACT_BY_KEY[key] ?? DEFAULT_SAVE_IMPACT;

/** Câu "tác động" của các thẻ cấu hình JSON áp dụng cho MỌI NHÓM (cột mặc định của bảng, hạn mức riêng từng nhóm). */
export const WORKSPACE_SAVE_IMPACT = 'Giá trị áp dụng cho mọi nhóm trong ≤ 60 giây.';
