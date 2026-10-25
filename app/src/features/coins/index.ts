/**
 * Feature kinh tế ảo Coins (p7-02 P0: ví xu, lịch sử, nhiệm vụ ngày, cửa hàng vật phẩm, kho đồ). Route mỏng ở `app/(app)/me/coins/*` (có `_layout.tsx`: cờ `coins` + trình
 * nghe socket). ⚠️ Xu là tiền ẢO — khác hẳn ví chi tiêu nhóm `features/wallet` (p6-04); chợ tài liệu (listing) là P1, chưa làm.
 * Nơi lắp ráp: `app/(app)/me/_layout.tsx` import `register-profile.tsx` (hàng "Xu và cửa hàng" ở màn Tôi); `shell/home-widgets/register-stats-widgets.ts` import
 * `register-home-widgets.tsx` (widget số dư ở Trang chủ).
 */
export { InventoryScreen } from './screens/InventoryScreen';
export { ShopScreen } from './screens/ShopScreen';
export { WalletScreen } from './screens/WalletScreen';
export { useCoinsEvents } from './hooks/useCoinsEvents';
