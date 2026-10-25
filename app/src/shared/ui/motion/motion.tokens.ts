import { Easing } from 'react-native-reanimated';

/**
 * Nhịp chuyển động DÙNG CHUNG — một bộ số cho cả app, để tấm trượt, thẻ bấm, tab và màn đăng nhập "cùng một tay".
 *
 * ── Nguồn ───────────────────────────────────────────────────────────────────────────────────────────────────────
 * Thang Material 3 (đối chiếu `Seal/…/motion/AnimationSpecs.kt`, `ReadYou/…/motion/MaterialEasing.kt` trong
 * `D:\work\ui-mobile`): vật thể ĐI VÀO khung dùng "emphasized decelerate" (lao nhanh rồi đậu êm), vật thể RỜI khung dùng
 * "emphasized accelerate" (chậm lúc đầu rồi vụt đi) — ra nhanh hơn vào (≈ 3/5), vì mắt không cần theo dõi thứ đang biến mất.
 *
 * ⛔ Đừng rải số ms/bezier mới trong feature. Mỗi màn một nhịp riêng là thứ khiến app "giật cục" dù từng hiệu ứng đều mượt.
 * ⚠️ Mọi chuyển động TRANG TRÍ phải tắt khi hệ điều hành bật "Giảm chuyển động" (`useReducedMotion()`), xem `Reveal`.
 */
export const MOTION_DURATION = {
  /** Phản hồi nhỏ: đổi màu, chấm trạng thái, nhả tay. */
  fast: 150,
  /** Mặc định: hiện/ẩn một khối, đổi tab, chỉ báo trượt. */
  base: 250,
  /** Vật thể LỚN đi vào khung: tấm trượt, thẻ mở rộng. */
  emphasized: 320,
  /** Cảnh diễn: hình minh hoạ lớn, quyển sách màn đăng nhập. */
  slow: 600,
} as const;

/**
 * ⚠️ `Easing.bezier()` của Reanimated trả về một FACTORY (`{ factory }`), không phải hàm — chỉ đưa vào `withTiming(…, {
 * easing })` hoặc `.easing()` của layout animation; ⛔ đừng gọi nó như hàm số trong worklet.
 */
export const MOTION_EASING = {
  /** Chuyển trạng thái tại chỗ (đổi cỡ, đổi vị trí chỉ báo). */
  standard: Easing.bezier(0.2, 0, 0, 1),
  /** Đi VÀO khung: nhanh lúc đầu, đậu thật êm — tấm trượt mở, thẻ hiện. */
  emphasizedDecelerate: Easing.bezier(0.05, 0.7, 0.1, 1),
  /** RỜI khung: chậm lúc đầu rồi vụt đi — tấm trượt đóng. */
  emphasizedAccelerate: Easing.bezier(0.3, 0, 0.8, 0.15),
} as const;

/**
 * Lò xo (Reanimated `withSpring`). `damping` cao = không nảy — nảy ở vật thể lớn trông như lỗi, chỉ chỉ báo nhỏ mới được
 * nảy nhẹ cho "sống".
 */
export const MOTION_SPRING = {
  /** Nhấn/nhả thẻ, ô, nút: phản hồi tức thì, gần như không nảy. */
  press: { damping: 22, mass: 0.6, stiffness: 420 },
  /** Vật thể bật về chỗ cũ (tấm trượt vuốt chưa đủ xa). */
  settle: { damping: 20, stiffness: 220 },
  /** Chỉ báo chọn (vòng sáng tab, gạch chân tab): nảy RẤT nhẹ. */
  indicator: { damping: 18, mass: 0.8, stiffness: 260 },
} as const;

/** Tỉ lệ co khi nhấn giữ một thẻ/ô — đủ để ngón tay "cảm" được, không đủ để chữ bên trong mờ nhoè. */
export const PRESS_SCALE = 0.97;

/**
 * Nhịp VÒNG LẶP trang trí (`@/shared/ui/effects`: quầng nền trôi, viền chạy, ánh quét, lấp lánh…) — CHẬM hơn hẳn nhịp
 * tương tác: thứ lặp mãi mà nhanh là thứ giành mắt với nội dung.
 *
 * ⛔ Mỗi màn TỐI ĐA MỘT vòng lặp NỔI BẬT (quầng trôi HOẶC viền chạy HOẶC ánh quét lặp) — hai vòng lặp tranh nhau là màn
 * "nhấp nháy". Hiệu ứng CHẠY MỘT LẦN (ánh quét lúc vào màn) không tính.
 * ⚠️ Các component trong `effects/` tự tắt khi "Giảm chuyển động" bật và khi `active={false}` (màn bị che: tab khác).
 */
export const MOTION_LOOP = {
  /** Quầng màu nền trôi MỘT chiều (đi rồi về = 2×). */
  drift: 9000,
  /** Một vòng viền chạy quanh thẻ. */
  beam: 4200,
  /** Ánh quét lướt qua một bề mặt. */
  sweep: 1200,
  /** Nghỉ giữa hai lần quét — quét liên tục là nhấp nháy. */
  sweepRest: 3600,
  /** Một nhịp lấp lánh của ngôi sao (sáng lên rồi tắt). */
  twinkle: 1800,
  /** Một nhịp vòng toả của chấm "đang diễn ra". */
  pulse: 1600,
  /** Quỹ đạo minh hoạ (`EmptyState`) quay trọn một vòng. */
  orbit: 28000,
} as const;
