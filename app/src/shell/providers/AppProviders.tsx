import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { warnOnRiskyConfig } from '@/core/config/env.config.warnings';
import { queryClient } from '@/core/config/query-client';
import { configureZodLocale } from '@/core/config/zod.config';
import { initOnlineManager } from '@/core/net/online-manager';
import { initNotifications } from '@/core/notifications';
import { usePermissionRevokedHandler } from '@/core/permission';
import {
  bindAppState,
  bindPresenceHeartbeat,
  connectSocket,
  disconnectSocket,
  resetRoomSubscriptions,
  usePresenceStore,
  useTypingStore,
} from '@/core/socket';
import { ToastHost } from '@/shared/ui/feedback/ToastHost';
import { CAPABILITIES_QUERY_KEY, readCachedCapabilities, useConfigSync } from '@/shell/capabilities';
import { useNotificationsBootstrap } from '@/shell/notifications';
import { useAuthStore } from '@/shell/store/slices/auth';

import { ErrorBoundary } from './ErrorBoundary';
import { ThemeProvider } from './ThemeProvider';

/**
 * Đặt tiếng Việt cho Zod NGAY LÚC NẠP MODULE, không phải trong effect.
 *
 * ⛔ Phải chạy TRƯỚC khi bất kỳ schema nào được `parse`. Nếu để trong
 * `useEffect` thì effect chạy SAU lần render đầu, mà màn đăng nhập đã kịp dựng
 * schema và kiểm dữ liệu — lỗi đầu tiên người dùng thấy sẽ là tiếng Anh, các
 * lỗi sau mới tiếng Việt. Sai kiểu "chỉ lần đầu" là loại khó tái hiện nhất.
 */
configureZodLocale();

/** In cảnh báo cấu hình rủi ro MỘT lần lúc khởi động (chỉ ở bản dev). */
warnOnRiskyConfig();

/** Nối `onlineManager` của React Query với NetInfo (p0-12) — `refetchOnReconnect` chỉ có tác dụng khi có cầu nối này. */
initOnlineManager();

/**
 * Handler thông báo foreground + kênh Android (p0-06) — cũng phải ở TẦM MODULE, không phải trong effect:
 * push tới ngay lúc app vừa mở nguội mà handler chưa cài thì expo mặc định ẨN banner, và lượt đó mất
 * (không có lần thứ hai).
 */
initNotifications();

/**
 * Toàn bộ provider của app, đúng thứ tự.
 *
 * ── Thứ tự KHÔNG tuỳ tiện ────────────────────────────────────────────────────
 *
 *  1. `GestureHandlerRootView` — PHẢI ngoài cùng và phải có `flex-1`. Đây là
 *     yêu cầu của thư viện: mọi cử chỉ nằm bên trong nó mới được nhận. Đặt sâu
 *     hơn thì vuốt-để-lùi và mọi cử chỉ tuỳ biến im lặng không hoạt động — không
 *     có lỗi nào báo, chỉ là "vuốt không ăn". Thiếu `flex-1` thì cây con cao 0.
 *
 *  2. `KeyboardProvider` — phải bọc ngoài mọi màn hình có ô nhập. Nó đo bàn phím
 *     ở tầng native và cấp số đo đó cho các hook bên dưới; đặt trong từng màn
 *     hình thì mỗi lần chuyển màn lại dựng lại phép đo và bàn phím nhảy giật.
 *
 *  3. `SafeAreaProvider` — phải trên mọi thứ đọc `useSafeAreaInsets()`, kể cả
 *     `ToastHost` bên dưới.
 *
 *  4. `QueryClientProvider` — trên mọi thứ gọi API.
 *
 *  5. `ThemeProvider` — cần store (không phải provider) nên đặt đâu cũng chạy,
 *     nhưng để sát trong cho gần nơi dùng. ⚠️ Nó KHÔNG còn là lớp trong cùng
 *     nữa kể từ khi có (6).
 *
 *  6. `ErrorBoundary` — TRONG CÙNG, và đó là lựa chọn có chủ đích:
 *     · phải nằm TRONG (1) và (3): màn hình lỗi dựng bằng `Screen`, mà `Screen`
 *       gọi `useSafeAreaInsets()` — hook đó NÉM LỖI khi không có
 *       `SafeAreaProvider`, tức là ranh giới lỗi tự nổ đúng lúc cần nó nhất.
 *       Không có vùng an toàn thì nút "Thử lại" còn nằm dưới vạch gạt ngang;
 *     · phải nằm TRONG (4) và (5) để màn hình lỗi có đủ theme và (về sau) có
 *       `queryClient` — `onReset` của nơi gọi thường là `queryClient.clear()`;
 *     · đặt sâu nhất KHÔNG mất phạm vi bắt lỗi đáng kể: bốn provider trên đều
 *       là vỏ vài dòng, gần như không có gì để ném. Thứ ném lỗi thật là cây
 *       route (`children`) và `ToastHost` — cả hai đều nằm trong nó.
 *
 * `ToastHost` nằm CUỐI, là anh em với `children`: nó phải vẽ ĐÈ lên mọi màn
 * hình. Đặt nó bọc ngoài `children` thì màn hình vẽ đè lên toast.
 *
 * ⚠️ `ToastHost` nằm BÊN TRONG `ErrorBoundary` chứ không phải bên cạnh: nó cũng
 * là component render được, cũng ném lỗi được. Để ngoài thì một lỗi trong chính
 * nó vẫn cho ra màn trắng — đúng thứ ranh giới lỗi sinh ra để chặn.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);

  /**
   * Mồi bản capabilities cache (AsyncStorage) vào React Query MỘT LẦN lúc khởi
   * động — TRƯỚC khi `useCapabilities()` ở màn hình đầu tiên kịp chạy.
   *
   * ⛔ Không có bước này thì mở app lúc mất mạng (hầm gửi xe, máy bay) sẽ khiến
   * `useCapabilities()` không có dữ liệu trong một nhịp, và `useAccessibleModules()`
   * (cố ý) cho các tab có `featureFlag` đi qua trong lúc chưa có dữ liệu — nhẹ
   * hơn ẩn nhầm, nhưng vẫn không đúng bằng việc có ngay bản gần nhất đã lưu.
   *
   * ⚠️ `invalidateQueries` NGAY sau khi mồi (không chỉ `setQueryData`): `setQueryData`
   * đánh dấu bản mồi là "vừa cập nhật", nên nếu cờ đổi ở BE qua env/restart (KHÔNG
   * đi qua `SystemConfig` → không có `config:updated` bắn qua socket, xem
   * `use-config-sync.ts`) thì app cứ vô tư dùng bản cache cũ tới hết `staleTime`
   * (5 phút) hoặc tới khi ra nền ≥ 60 s. Ép "stale ngay" ở đây → màn đầu vẫn vẽ
   * NGAY bản cache (không nháy trắng, không mất chế độ ngoại tuyến), nhưng luôn có
   * một lượt tải lại thật chạy nền ngay khi mở app — vá đúng lỗ hổng vừa gặp mà
   * không cần chờ thao tác thủ công (ra nền/vào lại) hay sửa gì phía BE.
   */
  useEffect(() => {
    let cancelled = false;
    void readCachedCapabilities().then((cached) => {
      if (cancelled || !cached) return;
      queryClient.setQueryData(CAPABILITIES_QUERY_KEY, cached);
      void queryClient.invalidateQueries({ queryKey: CAPABILITIES_QUERY_KEY });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Vòng đời socket theo trạng thái phiên.
   *
   * ⛔ KHÔNG kết nối khi chưa đăng nhập (`status !== 'authenticated'`) — server
   * đòi access token hợp lệ ngay từ bước handshake (`config-be.md` §7), nối lúc
   * chưa có token chỉ sinh ra một vòng `connect_error` vô ích.
   *
   * `bindAppState()` chỉ bật SAU khi đã đăng nhập, và hàm dọn dẹp của nó phải
   * chạy TRƯỚC `disconnectSocket()` ở đây — thứ tự không quan trọng giữa hai
   * lệnh dọn cụ thể này, nhưng phải dọn CẢ HAI để không rò rỉ listener `AppState`
   * qua các lượt đăng nhập/đăng xuất trong cùng một phiên chạy app.
   *
   * `bindPresenceHeartbeat()` đi kèm cùng effect vì cùng vòng đời với socket:
   * không có kết nối thì gửi heartbeat vô nghĩa. `resetRoomSubscriptions()` +
   * xoá `presence.store`/`typing.store` khi RỜI trạng thái đăng nhập — dữ liệu
   * realtime của phiên cũ (ai đang gõ, ai đang online) không còn đúng cho phiên
   * mới, và registry phòng cũ (nếu không xoá) sẽ khiến `rejoinAll()` sau lần
   * đăng nhập KẾ TIẾP cố join lại những phòng của người dùng TRƯỚC.
   */
  useEffect(() => {
    if (status !== 'authenticated') {
      disconnectSocket();
      resetRoomSubscriptions();
      usePresenceStore.getState().reset();
      useTypingStore.getState().reset();
      return undefined;
    }

    connectSocket();
    const unbindAppState = bindAppState();
    const { unbind: unbindPresenceHeartbeat } = bindPresenceHeartbeat();
    return () => {
      unbindPresenceHeartbeat();
      unbindAppState();
      disconnectSocket();
    };
  }, [status]);

  /**
   * Quyền/scope vừa bị thu hồi ở backend (`permission:revoked`, p0-02) ⇒ dữ
   * liệu React Query đang giữ CHO ĐÚNG SCOPE ĐÓ có thể đã sai quyền (vd bị gỡ
   * khỏi một workspace nhưng cache kênh của nó vẫn còn).
   *
   * ⛔ KHÔNG còn `invalidateQueries()` toàn cục (bản cũ, trước p0-02): nó khiến
   * MỌI query đang được xem tải lại cùng lúc — "refetch bão" mỗi lần một người
   * dùng khác rời khỏi một workspace không liên quan. `usePermissionRevokedHandler()`
   * (`core/permission/permission-revoked.handler.ts`) chỉ xoá cache/nháp khớp
   * ĐÚNG scope bị thu hồi (`matchesScope()` + registry `registerScopeCleanup()`
   * của từng feature), và chỉ điều hướng + toast khi người dùng đang đứng ĐÚNG
   * màn hình thuộc scope đó (ACL-10).
   */
  usePermissionRevokedHandler();

  /**
   * Cờ phân hệ/giới hạn đổi ở admin → `GET /capabilities` mới trong ≤ 60 s (p0-07): `config:updated`, foreground sau ≥ 60 s ở nền,
   * socket nối lại, một API trả `CFG_005`. Hook tự dùng `queryClient` dùng chung nên đứng NGOÀI `QueryClientProvider` được.
   */
  useConfigSync();

  /**
   * Thông báo đẩy (p0-06): đăng ký token FCM khi đã đăng nhập + đã cấp quyền, chạm thông báo → mở màn,
   * dọn khay/huy hiệu khi rời phiên. ⛔ KHÔNG xin quyền ở đây — chỉ primer/Cài đặt thông báo mới xin.
   */
  useNotificationsBootstrap();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <ErrorBoundary>
                {children}
                <ToastHost />
              </ErrorBoundary>
            </ThemeProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
