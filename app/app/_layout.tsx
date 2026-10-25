import '@/styles/global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { View } from 'react-native';

import { initMonitoring, wrapRootComponent } from '@/core/monitoring';
import { CallNativeBridge, CallRuntime } from '@/features/calls';
import { PushTapRouter } from '@/shell/notifications';
import { AppProviders } from '@/shell/providers/AppProviders';
import { useMonitoringUser } from '@/shell/providers/useMonitoringUser';
import { useSessionBootstrap } from '@/shell/session/useSessionBootstrap';
import { AppSplashScreen } from '@/shell/splash';
import { AppLockBoundary, useAppLockStore } from '@/shell/app-lock';
import { AppLockOverlay } from '@/features/auth/components/app-lock/AppLockOverlay';
import { useAuthStore } from '@/shell/store/slices/auth';
// p7-04: khảo sát/hẹn giờ/nhắc lại/tạo task đăng ký vào các khe của chat (module scope, trước mọi danh sách tin) — vì sao ở đây mà không ở `(app)/_layout.tsx`: xem chú thích của module này.
import '@/shell/chat/register-chat-extensions';

/**
 * Giữ màn hình chờ hiện cho tới khi ta biết người dùng đã đăng nhập hay chưa.
 *
 * ⛔ Gọi ở TẦM MODULE, không phải trong effect. Effect chạy sau lần vẽ đầu, mà
 * hệ điều hành đã hạ màn hình chờ trước đó rồi — người dùng thấy một khung hình
 * trống nhấp nháy giữa màn hình chờ và màn hình thật.
 */
void SplashScreen.preventAutoHideAsync();

/** Trần chờ `onLayout` của `AppSplashScreen` trước khi tự hạ màn hình chờ native — xem `useEffect` trong `RootNavigator`. */
const SPLASH_HIDE_FALLBACK_MS = 1500;

/**
 * Bật Sentry (p0-11) ở TẦM MODULE — TRƯỚC render đầu tiên để bắt cả lỗi lúc khởi động. Thiếu `EXPO_PUBLIC_SENTRY_DSN` thì không làm gì (no-op tuyệt đối).
 * Hai điểm nối còn lại: `wrapRootComponent` ở export mặc định (dưới) và `captureException` trong `ErrorBoundary`.
 */
initMonitoring();

/**
 * Gốc của cây điều hướng.
 *
 * Hai nhóm route, cố ý tách rời:
 *
 *   `(auth)` — màn hình cho KHÁCH: đăng nhập, đăng ký, quên mật khẩu.
 *   `(app)`  — màn hình cho người ĐÃ đăng nhập, có thanh tab dưới.
 *
 * Dấu ngoặc đơn là "nhóm route" của Expo Router: nó gom file lại để dùng chung
 * một layout, nhưng KHÔNG hiện trong đường dẫn. Nên `app/(auth)/login.tsx` là
 * `/login`, không phải `/auth/login`. Nhờ vậy đổi cách nhóm về sau không làm
 * gãy deep link nào đã phát hành.
 */
function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

/** `wrapRootComponent` = `Sentry.wrap` khi đã bật giám sát (đo chạm/điều hướng), nguyên component khi tắt. */
export default wrapRootComponent(RootLayout);

function RootNavigator() {
  const { isSessionReady } = useSessionBootstrap();
  const locked = useAppLockStore((state) => state.locked);
  /**
   * Đổi tài khoản NGAY tại lớp phủ khoá (không đăng xuất, xem `sign-in.ts` §`switchedUser`) chỉ
   * `router.replace(HOME)` ở TAB đang mở — các tab KHÁC vẫn còn sống (Expo Router giữ mounted)
   * với state cục bộ của người CŨ cho tới khi người dùng chạm vào lại. `wipeUserData()` đã xoá
   * cache/store, nhưng state nội bộ một số màn (không đi qua query cache) thì không.
   * `key={userId}` ép React huỷ-dựng-lại TOÀN BỘ cây điều hướng bên dưới mỗi khi người dùng
   * thật sự đổi — cùng một người (mở khoá lại/`sameUser`) thì `userId` không đổi nên KHÔNG
   * remount, giữ đúng bất biến BIO-16 ("đứng nguyên màn đang làm").
   */
  const userId = useAuthStore((state) => state.user?.id ?? null);
  // p0-11: id người dùng cho Sentry (no-op khi chưa bật). Đặt TRƯỚC `return` bên dưới — hook không được gọi có điều kiện.
  useMonitoringUser();

  /**
   * Hạ màn hình chờ NATIVE ngay khi `AppSplashScreen` (bản JS, có thêm tên app
   * dưới logo) vẽ xong khung hình đầu — KHÔNG đợi `isSessionReady`.
   *
   * ⛔ Gọi ở `onLayout`, không phải `useEffect`: effect chạy SAU khung hình đầu
   * được vẽ lên MÀN HÌNH, còn `onLayout` chỉ báo cây RN đã ĐO xong kích thước —
   * sớm hơn, nhưng vẫn đủ trễ để native chắc chắn có gì đó để thay thế (không
   * có khung hình trắng loé lên giữa hai màn hình chờ). Gọi lại nhiều lần (đo
   * lại khi xoay máy) vô hại: `hideAsync()` là no-op nếu đã hạ rồi.
   */
  const handleSplashLayout = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  /**
   * Đường lùi cho việc hạ màn hình chờ native — để KHÔNG chỉ dựa vào mỗi `onLayout`.
   *
   * ⚠️ Đây là LƯỚI AN TOÀN, không phải bản vá của sự cố "kẹt màn hình chờ" 29/09 (các bản 389803/389830/389848).
   * Gốc sự cố đó nằm ở `react-native-callkeep` làm JS ném lúc nạp module nên React không bao giờ mount — xem
   * `package.json` → `expo.autolinking.exclude`. Lúc đầu logcat chỉ lộ `ReactNativeJNI: instanceHandle is null,
   * event of type topLayout will be dropped`, và dòng đó từng bị đọc NHẦM thành nguyên nhân; thật ra nó là HỆ QUẢ
   * (React instance đã chết, `reactInstance is null. Dropping work.`). Giữ lưới này lại vì nó rẻ và vẫn đúng cho
   * MỌI trường hợp `onLayout` của khung hình đầu không tới được — nhưng đừng trông vào nó để chẩn đoán.
   *
   * `hideAsync()` idempotent (gọi lại sau khi đã hạ là no-op) nên chạy cả hai đường là an toàn.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      void SplashScreen.hideAsync();
    }, SPLASH_HIDE_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, []);

  /**
   * ⛔ Chưa biết trạng thái phiên thì chỉ vẽ màn hình chờ, không vẽ route nào.
   *
   * Vẽ sớm là guard của `(app)` chạy khi `status` còn `restoring`, kết luận
   * "chưa đăng nhập" và đẩy sang `/login` — rồi một nhịp sau token về và đẩy
   * ngược lại. Người dùng thấy màn đăng nhập chớp lên ở MỖI lần mở app.
   *
   * `AppSplashScreen` là an toàn để vẽ ở đây vì nó chỉ lặp lại ĐÚNG những gì
   * màn hình chờ native đã hiện (cùng nền, cùng ảnh) rồi thêm tên app — không
   * hé lộ nội dung trang chủ. `useSessionBootstrap` chỉ báo `isSessionReady`
   * SAU khi quyết định khoá ứng dụng (P1) đã chạy xong, nên `locked` ở dưới
   * (nếu có) đã đúng ngay từ khung hình đầu tiên của route thật — không có
   * khung hình nào loé nội dung trang chủ trước khi lớp phủ khoá kịp bật.
   */
  if (!isSessionReady) return <AppSplashScreen onLayout={handleSplashLayout} />;

  return (
    <>
      {/* `auto` = chữ thanh trạng thái tự đảo theo nền sáng/tối. Đặt cứng
          `light`/`dark` là một trong hai theme sẽ có chữ trắng trên nền trắng. */}
      <StatusBar style="auto" />

      {/**
       * ⛔ `importantForAccessibility` (Android) ẩn TOÀN BỘ cây route khỏi
       * TalkBack khi đang khoá — thiếu bước này thì `accessibilityViewIsModal`
       * của `<AppLockOverlay>` (chỉ có tác dụng thật trên iOS) để lọt trình đọc
       * màn hình Android vuốt xuyên qua lớp phủ, đọc luôn nội dung trang chủ
       * đang bị che. Bọc ở ĐÂY vì đây là nơi DUY NHẤT có quyền ôm cả `<Stack>`.
       */}
      <View importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'} style={{ flex: 1 }}>
        <Stack key={userId} screenOptions={{ headerShown: false }}>
          {/* Đổi NHÓM (đăng nhập ⇄ đăng xuất, `router.replace`) = mờ chéo: hai nhóm là hai "thế giới" ngang hàng chứ
              không phải màn con của nhau — trượt ngang gợi ra một cú "lùi" không tồn tại. Bên trong `(auth)` vẫn trượt
              ngang (layout riêng của nhóm). */}
          <Stack.Screen name="(app)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
          {/* p2-01: cuộc gọi toàn màn, không vuốt để đóng (thoát bằng nút hoặc thu nhỏ — `MiniCallBar`). */}
          <Stack.Screen
            name="call/[callId]"
            options={{
              animation: 'slide_from_bottom',
              gestureEnabled: false,
              presentation: 'fullScreenModal',
            }}
          />
          {/* p2-05: phòng họp toàn màn — pre-join/lobby/phòng; thoát bằng nút "Rời"/"Thu nhỏ" (`MeetingRoomHost` giữ phòng). */}
          <Stack.Screen
            name="meeting-room"
            options={{
              animation: 'slide_from_bottom',
              gestureEnabled: false,
              presentation: 'fullScreenModal',
            }}
          />
        </Stack>
      </View>

      {/**
       * `AppLockBoundary` — headless, theo dõi `AppState` và áp luật khoá.
       * `AppLockOverlay` — lớp phủ NHÌN THẤY ĐƯỢC, tự `return null` khi
       * `!locked`. Cả hai đứng NGOÀI `<Stack>` (SAU, không lồng vào trong) vì
       * khoá là LỚP PHỦ, không phải route (`app.md` §1).
       */}
      <AppLockBoundary />
      <AppLockOverlay />

      {/**
       * p0-06: chạm thông báo → mở màn. Headless, sau `<Stack>` và chỉ khi phiên đã sẵn sàng (dòng
       * `return null` ở trên) — điều hướng trước khi navigator gốc dựng thì bị nuốt.
       */}
      <PushTapRouter />

      {/**
       * p2-01/p2-02: bộ máy cuộc gọi — socket `call:*`, phiên media, chuông, foreground service,
       * cầu sang native. Cả hai đều HEADLESS.
       *
       * ⛔ PHẢI ở GỐC, không được trả về `(app)/_layout.tsx`: route `call/[callId]` nằm NGOÀI nhóm
       * `(app)`, nên mở app NGUỘI bằng deep link từ thông báo cuộc gọi thì `(app)` không hề mount —
       * người nhận bấm Nghe xong kẹt ở "Đang kết nối…" còn chuông thì treo mãi. Xem KDoc `CallRuntime`.
       */}
      <CallRuntime />
      <CallNativeBridge />
    </>
  );
}
