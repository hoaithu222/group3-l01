import { memo } from 'react';

import { ImagePreview } from '@/shared/ui';

import { useBadgeIconUrl } from '../service/gamification.queries';

export interface BadgeIconProps {
  emoji: string | null;
  /** Ảnh huy hiệu (asset đã có); thiếu hoặc không đọc được → emoji. */
  iconAssetId: string | null;
  /** Dùng làm `alt` của ảnh. */
  name: string;
  size?: 'sm' | 'lg';
}

/**
 * Biểu tượng huy hiệu: ảnh (`iconAssetId` → `GET /assets/:id/url`) khi có, ngược lại emoji, ngược lại 🏅.
 *
 * Ảnh do `BadgeFormModal` tải lên (asset scope `BADGE`, gắn `BADGE_ICON` khi lưu; mọi người đăng nhập đọc được khi huy hiệu còn). Asset chưa gắn (vừa
 * tải, chưa Lưu) chỉ chủ tải lên đọc được. Luôn có emoji làm phương án thay thế — lỗi tải ảnh không hiện toast và không làm trống ô.
 */
const BadgeIcon = memo(function BadgeIcon({ emoji, iconAssetId, name, size = 'sm' }: BadgeIconProps) {
  const { data: url } = useBadgeIconUrl(iconAssetId);
  const glyph = (
    <span aria-hidden className={size === 'lg' ? 'text-h3' : 'text-body-18'}>
      {emoji ?? '🏅'}
    </span>
  );
  if (!iconAssetId) return glyph;
  return <ImagePreview alt={name} fallback={glyph} rounded="md" size={size === 'lg' ? 'lg' : 'sm'} src={url} />;
});

export default BadgeIcon;
