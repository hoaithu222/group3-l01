/**
 * Barrel công khai của module `coins` (p7-02) — module khác (hồ sơ công khai, sau này chợ tài liệu) CHỈ import từ đây, không import `coins/services/*` hay `coins/repositories/*` trực tiếp.
 *
 * `createEquippedItemsReader()` — đọc vật phẩm hồ sơ đang trang bị (khung avatar, theme, gói emoji) của nhiều người, CHỈ ĐỌC. Việc có hiện cho người xem hay không do module hồ sơ quyết định.
 * ⛔ Không có hàm nào ở đây ghi số dư: mọi thay đổi xu đi qua `CoinLedgerService` bên trong module (cấm cập nhật `CoinWallet.balance` ngoài service đó).
 */
import { getCoinsContainer } from "./coins.container";
import type { EquippedItemsReader } from "./services/equipped-items.reader";

export type { EquippedItemView } from "./services/coins-presenter";

export function createEquippedItemsReader(): EquippedItemsReader {
  return getCoinsContainer().equipped;
}
