import Constants from 'expo-constants';
import { Image } from 'expo-image';
import type { LayoutChangeEvent } from 'react-native';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

/** 160dp — PHẢI khớp `imageWidth` của plugin `expo-splash-screen` (`app.config.ts`), xem chú thích ở component. */
const LOGO_SIZE = 160;

/**
 * Bản JS của màn hình chờ — `app/_layout.tsx` vẽ cái này thay cho `return null`
 * trong lúc `useSessionBootstrap()` chưa xong.
 *
 * ── Vì sao cần bản JS, trong khi đã có màn hình chờ NATIVE ───────────────────
 * Màn hình chờ native (plugin `expo-splash-screen`, khai ở `app.config.ts`) chỉ
 * vẽ được MỘT ảnh + một màu nền — không có chỗ cho chữ. Muốn thêm tên app bên
 * dưới logo thì phải làm ở tầng React: `_layout.tsx` giữ màn hình chờ native
 * (`preventAutoHideAsync`) tới khi component này vẽ xong khung hình ĐẦU TIÊN
 * (`onLayout`), rồi mới hạ nó — người xem thấy ảnh logo đứng yên, chỉ có thêm
 * dòng chữ hiện ra ngay sau.
 *
 * ⛔ Nền (`bg-bg-1`) và ảnh (`splash-icon.png`, 160dp, `contain`) PHẢI khớp
 * Y HỆT cấu hình native — lệch màu hay cỡ dù một chút cũng lộ ra thành một cú
 * nháy đổi hình đúng lúc `onLayout` hạ màn hình chờ native. Dùng class
 * `bg-bg-1` (không viết cứng mã màu) để không bao giờ lệch với
 * `colors.json` — khác với hai hằng `SPLASH_BG_LIGHT`/`SPLASH_BG_DARK` bên
 * `app.config.ts`, nơi bắt buộc viết cứng vì file đó chạy trước khi Metro đóng
 * gói xong token màu.
 */
export function AppSplashScreen({
  onLayout,
}: {
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-xl bg-bg-1" onLayout={onLayout}>
      <Image
        contentFit="contain"
        source={require('@/assets/images/splash-icon.png')}
        style={{ height: LOGO_SIZE, width: LOGO_SIZE }}
      />

      {/**
       * ⛔ `className` đặt trên `<Text>` THƯỜNG, không phải trên `Animated.Text`
       * — `Animated.View`/`Animated.Text` không nằm trong danh sách interop của
       * NativeWind, và nếu component đó còn mang `style` dạng SharedValue thì
       * NativeWind gộp class + style thành một object khiến Reanimated tưởng đó
       * là animation handle rồi vứt sạch style của class (bẫy đã ghi ở
       * `shared/ui/AGENTS.md` — "Animated.View và className KHÔNG đi chung").
       * `entering` không đụng tới `style` nên bọc ngoài bằng `Animated.View` là
       * an toàn, còn chữ (font/màu/cỡ qua token) vẫn nằm nguyên trên `<Text>`.
       */}
      <Animated.View entering={FadeInDown.duration(400).delay(150)}>
        <Text className="text-header-lg font-bold text-fg-1">
          {Constants.expoConfig?.name ?? 'Super App'}
        </Text>
      </Animated.View>
    </View>
  );
}
