import { Alert } from '@/shared/ui/alert';
import {
  formatGuestExpiryDate,
  formatGuestRemaining,
  getGuestRemaining,
} from '@/shared/utils/format/guest-expiry.utils';

import { useGuestAccess } from '../hooks/useIsGuest';

export interface GuestAccessBannerProps {
  className?: string;
  wsId: string;
}

/**
 * Dải "Khách · còn 12 ngày" ở hub nhóm (app.md p3-04 §3, "Vỏ GUEST") — TỰ CHỨA: tự đọc
 * `myRole`/`myExpiresAt`, tự ẩn khi không phải khách, nên hub chỉ cần đặt
 * `<GuestAccessBanner wsId={wsId} />` (đúng mẫu card tự chứa của luật điều phối).
 *
 * Còn < 48 giờ → tông cảnh báo (`Alert` đã có icon riêng cho từng tông ⇒ chữ + icon, không
 * chỉ màu — app.md §7); luôn kèm NGÀY hết hạn cụ thể. Hết hạn rồi mà chưa bị đá ra (BE coi
 * là mất quyền ngay, socket sắp tới) thì hiện "đã hết hạn".
 */
export function GuestAccessBanner({ className, wsId }: GuestAccessBannerProps) {
  const { expiresAt, isGuest } = useGuestAccess(wsId);
  if (!isGuest) return null;

  const remaining = getGuestRemaining(expiresAt);
  const expiry = formatGuestExpiryDate(expiresAt);

  return (
    <Alert
      className={className}
      description={`Bạn chỉ thấy các kênh được chỉ định và những người trong đó.${expiry ? ` Quyền khách ${expiry}.` : ''}`}
      title={remaining ? `Khách · ${formatGuestRemaining(remaining)}` : 'Bạn đang tham gia với tư cách khách'}
      tone={remaining?.urgent ? 'warning' : 'info'}
    />
  );
}
