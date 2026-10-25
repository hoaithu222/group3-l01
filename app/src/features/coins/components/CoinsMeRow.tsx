import { router } from 'expo-router';

import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import { useCoinsEvents } from '../hooks/useCoinsEvents';
import { useCoinsEnabled } from '../hooks/useCoinsEnabled';
import { useWallet } from '../queries/wallet.queries';
import { formatCoins } from '../utils/coin-format';
import { COINS_HREF } from '../utils/coins-routes';

/**
 * Hàng "Xu và cửa hàng" ở màn Tôi (app.md p7-02 §1) — đăng ký vào khe `@/shared/profile` (`ProfileRowsSlot`) ở `register-profile.tsx`, nên `features/me` không
 * import feature này. Chỉ hiện khi cờ phân hệ `coins` bật (chưa biết → ẩn). Số dư hiện ở cột phải KÈM chữ "xu" (đọc thành "Xu và cửa hàng: 1.250 xu"); chưa tải/lỗi
 * ⇒ không hiện số (không bịa "0 xu"). Nghe socket để số dư đổi ngay khi nhận/tiêu xu ở thiết bị khác — hàng nằm trên màn Tôi nên ví tải lười khi màn mở.
 * ⚠️ Cờ tắt thì `useWallet` cũng không gọi API (BE sẽ trả 404).
 */
export function CoinsMeRow() {
  const enabled = useCoinsEnabled();
  const wallet = useWallet();
  useCoinsEvents();
  if (!enabled) return null;

  return (
    <ListItem
      className="py-xs"
      description="Ví xu, nhiệm vụ ngày và cửa hàng vật phẩm"
      divider
      label="Xu và cửa hàng"
      leading={<IconTile name="loyalty" tone="accent" />}
      trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
      value={wallet.data ? formatCoins(wallet.data.balance) : undefined}
      onPress={() => router.push(COINS_HREF)}
    />
  );
}
