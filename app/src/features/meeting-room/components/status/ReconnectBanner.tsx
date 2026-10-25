import { Alert } from '@/shared/ui/alert';

export interface ReconnectBannerProps {
  className?: string;
}

/**
 * "Đang kết nối lại…" — hiện suốt lúc mất mạng giữa cuộc họp (`RECONNECTING`, tối đa 30 s rồi quay về pre-join có "Thử lại"). Dùng `Alert`
 * chung: tông cảnh báo tự có icon + vai `alert` + vùng thông báo lịch sự, nên trình đọc màn hình nghe được ngay khi nó xuất hiện.
 */
export function ReconnectBanner({ className }: ReconnectBannerProps) {
  return <Alert className={className} description="Đang kết nối lại…" tone="warning" />;
}
