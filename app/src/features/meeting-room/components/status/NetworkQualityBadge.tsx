import { Badge, type BadgeSize } from '@/shared/ui/badge';

import type { ConnectionQuality } from '../../media/meeting-media.types';
import { networkQualityLabel } from './network-quality.utils';

export interface NetworkQualityBadgeProps {
  className?: string;
  quality: ConnectionQuality;
  /** `sm` khi đứng cạnh đồng hồ ở thanh tiêu đề (dòng chữ nhỏ) — mặc định `md`. */
  size?: BadgeSize;
}

/**
 * Huy hiệu chất lượng mạng — CHỮ "Mạng yếu" (cam) / "Mạng mất" (đỏ), ẩn hẳn khi mạng tốt. Trạng thái nằm ở chữ, màu chỉ nhấn thêm
 * (luật app.md §7: không để màu là dấu hiệu duy nhất).
 */
export function NetworkQualityBadge({ className, quality, size }: NetworkQualityBadgeProps) {
  const label = networkQualityLabel(quality);
  if (!label) return null;
  return (
    <Badge
      accessibilityLabel={quality === 'lost' ? 'Mất kết nối mạng' : 'Mạng của bạn đang yếu'}
      className={className}
      label={label}
      size={size}
      variant={quality === 'lost' ? 'error' : 'warning'}
    />
  );
}
