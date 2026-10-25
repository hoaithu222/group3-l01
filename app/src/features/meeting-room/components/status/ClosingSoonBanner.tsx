import { Alert } from '@/shared/ui/alert';

import { minutesUntil } from '../../utils/clock.utils';

export interface ClosingSoonBannerProps {
  className?: string;
  /** Mốc tự đóng (ISO, `meeting:updated`/`JOINED.closingAt`); `null` = chưa có cảnh báo ⇒ không vẽ gì. */
  closingAt: string | null;
  /** "Bây giờ" theo GIỜ SERVER (ms) — cha truyền để đồng hồ hai máy lệch nhau vẫn nói cùng một số phút. */
  nowMs: number;
  /** Có thì hiện nút ✕ (cảnh báo đọc xong có thể tắt; hết giờ thì cha gỡ khi phòng đóng). */
  onClose?: () => void;
}

/** "Cuộc họp sẽ tự kết thúc sau N phút" (N làm tròn LÊN, tính từ `closingAt` − `nowMs`); đã tới hạn thì "sắp tự kết thúc". */
export function ClosingSoonBanner({ className, closingAt, nowMs, onClose }: ClosingSoonBannerProps) {
  if (!closingAt) return null;
  const minutes = minutesUntil(closingAt, nowMs);

  return (
    <Alert
      className={className}
      description={minutes > 0 ? `Cuộc họp sẽ tự kết thúc sau ${String(minutes)} phút.` : 'Cuộc họp sắp tự kết thúc.'}
      tone="warning"
      onClose={onClose}
    />
  );
}
