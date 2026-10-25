import { router } from 'expo-router';

import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import { useMarketplaceEnabled } from '../hooks/useMarketplaceEnabled';
import { MARKETPLACE_HREF } from '../utils/marketplace-routes';

/**
 * Hàng "Chợ tài liệu" ở màn Tôi — đăng ký vào khe `@/shared/profile` (`register-profile.tsx`), nên `features/me` không import feature này. Chỉ hiện khi
 * cờ phân hệ `coins` bật (chưa biết → ẩn); cờ RIÊNG `economy.marketplaceEnabled` không kiểm được ở máy khách (xem `useMarketplaceEnabled`) — màn chợ tự
 * hiện thông điệp "Chợ chưa mở" (`COIN_008`) nếu admin chưa bật.
 */
export function MarketplaceMeRow() {
  const enabled = useMarketplaceEnabled();
  if (!enabled) return null;

  return (
    <ListItem
      className="py-xs"
      description="Mua và bán bộ học, tài liệu bằng xu"
      divider
      label="Chợ tài liệu"
      leading={<IconTile name="store" tone="accent" />}
      trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
      onPress={() => router.push(MARKETPLACE_HREF)}
    />
  );
}
