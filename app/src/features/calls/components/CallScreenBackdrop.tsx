import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

import { useThemeColors } from '@/shared/theme';

/**
 * Nền TOÀN MÀN của `CallScreen` — dải chuyển màu chéo `nav-from` → `nav-to`, CÙNG cặp token với thanh tab dưới
 * (`BottomNavGradient`) và thẻ chào Trang chủ (`HomeGreetingBackdrop`): đậm ở CẢ HAI chế độ sáng/tối, nên chữ LUÔN
 * TRẮNG (`fg-on-nav`/`fg-on-nav-muted`) của `CallPeerHeader` lúc nào cũng đọc được, không phụ thuộc theme máy.
 *
 * ⛔ TRƯỚC ĐÂY `CallScreen` tô nền bằng token `bg-nav` (nền của component "bottom bar" — trắng 94% ở chế độ SÁNG, xem
 * `bottom-nav.styles.ts`): đúng tối ở chế độ tối nhưng LẬT thành gần-trắng ở chế độ sáng, chữ trắng của
 * `CallPeerHeader` gần như tan vào nền. `nav-from`/`nav-to` là cặp DUY NHẤT trong hệ token LUÔN tối ở cả hai chế độ —
 * đúng thứ một màn gọi (vốn tối kiểu gì cũng phải tối) cần.
 *
 * Vẽ bằng `react-native-svg` chứ không cài `expo-linear-gradient` — cùng lý do đã ghi ở `ScreenGradient.tsx` (mã
 * native: thêm vào là cả nhóm phải dựng lại dev client; `react-native-svg` đã có sẵn trong bản dựng vì bộ icon dùng nó).
 *
 * Trang trí thuần tuý: nơi gọi (`CallScreen`) chịu trách nhiệm ẩn khỏi trình đọc màn hình + tắt cú chạm, giống hệt
 * cách `HomeGreeting` bọc `HomeGreetingBackdrop`.
 */
export function CallScreenBackdrop() {
  const colors = useThemeColors();

  return (
    <Svg height="100%" width="100%">
      <Defs>
        <LinearGradient id="call-screen-bg" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor={colors['nav-from']} />
          <Stop offset="1" stopColor={colors['nav-to']} />
        </LinearGradient>
      </Defs>
      <Rect fill="url(#call-screen-bg)" height="100%" width="100%" x="0" y="0" />
    </Svg>
  );
}
