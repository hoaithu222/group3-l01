import { Stack } from 'expo-router';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

// p4-05: đăng ký hàng "Cần chấm" vào danh sách của màn Tôi (side-effect) — `features/me` không import `boards`.
import '@/features/boards/register-profile';
// p6-06: đăng ký hàng "Nghề nghiệp" (huy hiệu kỹ năng xác thực) vào cùng danh sách — hàng tự ẩn khi cờ `career` tắt.
import '@/features/career/register-profile';
// p6-05: đăng ký hàng "Địa điểm & in ấn" (bản đồ tiệm in, đặt in, đơn của tôi) — hàng tự ẩn khi cờ `o2o` tắt.
import '@/features/o2o/register-profile';
// p7-02: đăng ký hàng "Xu và cửa hàng" (ví xu, nhiệm vụ ngày, cửa hàng, kho đồ — nhánh `me/coins`) — hàng tự ẩn khi cờ `coins` tắt.
import '@/features/coins/register-profile';
// p7-02 P1: đăng ký hàng "Chợ tài liệu" (mua/bán bộ học, tài liệu bằng xu — nhánh `me/marketplace`) — hàng tự ẩn khi cờ `coins` tắt.
import '@/features/marketplace/register-profile';
// p7-03: đăng ký hàng "Sức khoẻ học tập" (theo dõi OPT-IN, riêng tư — nhánh `me/wellbeing`) — hàng tự ẩn khi cờ `burnout` tắt.
import '@/features/wellbeing/register-profile';

/**
 * Ngăn xếp RIÊNG cho tab "Tôi" — có `_layout.tsx` nên `index.tsx`/`settings.tsx`
 * trong thư mục này KHÔNG bị đẩy thành hai tab rời ở `(app)/_layout.tsx`; thay
 * vào đó cả thư mục gộp thành MỘT tab ("me"), và `settings` là màn con đẩy tới
 * bằng `router.push` với nút quay lại thật (`AppBar onBack`).
 *
 * ⛔ Thiếu file này thì Expo Router "đẩy" (hoist) cả hai file lên thẳng
 * `(app)/_layout.tsx` làm hai route NGANG HÀNG — `me/settings` sẽ hiện thêm
 * MỘT tab thứ năm ở thanh dưới (Expo Router tự sinh tab cho mọi file không
 * khai tường minh, xem cảnh báo ở `module-registry.ts`), thay vì là màn con
 * của tab "Tôi".
 */
export default function MeLayout() {
  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}
