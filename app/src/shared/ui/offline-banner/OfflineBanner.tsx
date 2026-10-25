import { useNetworkStatus } from '@/shared/hooks/use-network-status';
import { tCommon } from '@/shared/utils/i18n';

import { Alert } from '../alert/Alert';

export interface OfflineBannerProps {
  className?: string;
  /** Ghi đè câu mặc định "Bạn đang ngoại tuyến" (vd "Cần kết nối để tìm"). */
  message?: string;
}

/**
 * Banner "Bạn đang ngoại tuyến" — TỰ đọc `useNetworkStatus()`: hiện khi NetInfo xác nhận mất mạng, ẩn (không chiếm chỗ) khi
 * có lại (p0-12, SHL-05).
 *
 * ── Đặt ở đâu ────────────────────────────────────────────────────────────────
 * Trong nhóm `(app)` đã có `ConnectionBanner` (mount một lần ở `(app)/_layout.tsx`, gộp cả trạng thái socket, tự né thanh
 * trạng thái): ⛔ KHÔNG đặt thêm `OfflineBanner` ở đó — người dùng thấy HAI dòng "ngoại tuyến" giống hệt nhau. Banner này
 * dành cho chỗ NGOÀI `(app)` không có `ConnectionBanner`: màn đăng nhập/đăng ký/quên mật khẩu, màn xem link mời, biểu mẫu
 * dùng trong `Modal`. Đặt DƯỚI thanh tiêu đề (không phải đầu cây) nên KHÔNG tự đệm vùng an toàn phía trên.
 *
 * Nhãn trợ năng: dùng lại vùng thông báo của `Alert` (`accessibilityLiveRegion="polite"` + role `alert` cho tông lỗi) nên
 * TalkBack/VoiceOver đọc ra ngay khi banner xuất hiện.
 */
export function OfflineBanner({ className, message }: OfflineBannerProps) {
  const { isOnline } = useNetworkStatus();
  if (isOnline) return null;

  return (
    <Alert className={className} description={message ?? tCommon('offline.banner')} tone="error" />
  );
}
