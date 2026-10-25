import { useEffect } from 'react';
import {
  cancelAnimation,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Nhịp "thở" của khung xương: độ mờ chạy tới lui giữa `PULSE_MIN_OPACITY` và 1.
 *
 * ⚠️ Figma KHÔNG kèm thông số chuyển động cho phần Skeleton (không có prototype,
 * không có ghi chú thời lượng). Hai hằng số dưới đây là quyết định của tầng code
 * — chọn theo hai ràng buộc: chu kỳ đủ chậm để không giật mắt khi cả màn hình
 * đầy khung xương, và đáy đủ sáng để khối vẫn nhìn ra hình dáng ở chế độ tối.
 * Có số thật từ thiết kế thì sửa ở ĐÂY, mọi khối skeleton đổi theo.
 */
const PULSE_DURATION_MS = 800;
/**
 * ⚠️ 0.6 chứ không phải 0.45 — con số này đã ĐO LẠI sau khi token đổi màu.
 *
 * ⛔ Bảng cũ ở đây tính trên `bg-skeleton` = `#D9D9D9`. Token đã được sửa về
 * đúng Figma (`Background/Support/bgskeleton` = **`#E6EBEA`**, sáng) nên MỌI con
 * số cũ đều sai — nhạt hơn thật. Bảng dưới là số của màu MỚI (đáy nhịp thở nhân
 * thẳng vào phần chênh, vì độ mờ trộn khối với chính nền phía sau):
 *
 *                        đục     0.45    0.60    0.70
 *     sáng, trên nền màn  1.095   1.041   1.055   1.065
 *     sáng, trong thẻ     1.204   1.086   1.116   1.137
 *     tối,  trên nền màn  1.449   1.140   1.208   1.260
 *
 * Ở chế độ SÁNG cả cột gần như phẳng: màu đúng của thiết kế vốn chỉ chênh nền
 * 1.09:1, nên chọn đáy nào cũng không cứu được — cái làm khối skeleton nhìn ra
 * được ở đó là HÌNH DÁNG (bo góc, khoảng hở), không phải tương phản.
 * Quyết định vì vậy nằm ở chế độ TỐI, nơi khoảng chênh còn thật: hạ xuống 0.45
 * làm mất **21%** tương phản (1.208 → 1.140) và suốt nửa chu kỳ màn hình trông
 * TRỐNG TRƠN trong lúc chờ mạng — người dùng kết luận app treo rồi bấm Back.
 * Lên 0.70 chỉ thêm 4% mà nhịp thở mờ tới mức không còn đọc ra là "đang tải".
 */
const PULSE_MIN_OPACITY = 0.6;
const OPAQUE = 1;

/**
 * Trả về `SharedValue` độ mờ để gắn thẳng vào `style` của một `Animated.View`.
 *
 * ── Vì sao trả SharedValue chứ không phải `useAnimatedStyle()` ───────────────
 * ⛔ Đừng "tối ưu" lại thành `useAnimatedStyle`. Khối skeleton lấy màu/kích
 * thước từ `className`, mà NativeWind GỘP style của class với prop `style`
 * thành MỘT object duy nhất. Object do `useAnimatedStyle` trả về mang khoá nội
 * bộ `viewDescriptors`; sau khi bị gộp chung, Reanimated nhận nhầm cả cụm là
 * "handle hoạt ảnh" và VỨT toàn bộ style của class — khối skeleton biến mất,
 * không lỗi nào báo. Shared value đặt thẳng trong style ("inline style" của
 * Reanimated) không có khoá đó nên gộp chung vẫn an toàn.
 *
 * ── Vì sao có `useReducedMotion()` ──────────────────────────────────────────
 * ⛔ Người bật "Giảm chuyển động" trong cài đặt hệ điều hành thấy một màn hình
 * đầy khối nhấp nháy liên tục là CHÓNG MẶT THẬT (tiền đình / nhạy cảm ánh
 * sáng), không phải chuyện thẩm mỹ. Tôn trọng cờ đó là bắt buộc.
 * ⚠️ Hook này đọc giá trị LÚC KHỞI ĐỘNG APP và không tự vẽ lại khi người dùng
 * đổi cài đặt giữa chừng — đó là giới hạn của Reanimated, không phải thiếu sót
 * ở đây. Người dùng mở lại app là đúng ngay.
 *
 * @param animated Bật/tắt nhịp thở. Truyền `false` cho test và ảnh chụp màn
 *   hình: hoạt ảnh lặp vô hạn làm `jest` treo và ảnh chụp ra độ mờ ngẫu nhiên.
 */
export function useSkeletonPulse(animated: boolean): SharedValue<number> {
  const prefersReducedMotion = useReducedMotion();
  const opacity = useSharedValue(OPAQUE);

  const isPulsing = animated && !prefersReducedMotion;

  useEffect(() => {
    if (!isPulsing) {
      // ⛔ Phải huỷ TRƯỚC khi gán lại. Không huỷ thì hoạt ảnh cũ vẫn còn chạy
      // trên luồng UI và ghi đè giá trị vừa gán — khối vẫn nhấp nháy dù đã
      // truyền `animated={false}`.
      cancelAnimation(opacity);
      opacity.value = OPAQUE;
      return;
    }

    // `-1` = lặp vô hạn, `true` = chạy ngược mỗi lượt (mờ đi rồi sáng lại) nên
    // không có cú nhảy đột ngột ở cuối mỗi chu kỳ.
    opacity.value = withRepeat(
      withTiming(PULSE_MIN_OPACITY, { duration: PULSE_DURATION_MS }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(opacity);
      opacity.value = OPAQUE;
    };
  }, [isPulsing, opacity]);

  return opacity;
}
