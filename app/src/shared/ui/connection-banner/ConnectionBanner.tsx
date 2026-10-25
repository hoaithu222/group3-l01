import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useConnectionState } from '@/core/socket/use-connection-state';

import { Alert } from '../alert/Alert';

/** Mất sóng dưới 3s (đổi cell tower, đi qua hầm cầu thang) là chuyện bình thường — đừng nháy banner cho mỗi lần chập chờn. */
const CONNECTING_DELAY_MS = 3000;

/**
 * Banner trạng thái kết nối realtime.
 *
 * Bảng hành vi (`app.md` §3):
 *  · `connecting` > 3s → "Đang kết nối lại…" (KHÔNG hiện ngay, xem hằng số trên).
 *  · `offline` (NetInfo xác nhận) → "Bạn đang ngoại tuyến", hiện NGAY — đây là
 *    tín hiệu CHẮC CHẮN, không phải suy đoán như `connecting`.
 *  · `unauthorized` → không hiện gì — phiên đã chết, guard điều hướng tự đẩy về
 *    đăng nhập, banner chồng thêm chỉ gây rối.
 *  · `connected` → ẩn.
 *
 * `accessibilityLiveRegion="polite"` + role `alert` (tông lỗi/cảnh báo) đã có
 * sẵn TRONG `Alert` (`src/shared/ui/alert/Alert.tsx`) — không cần khai lại.
 *
 * ── Vùng an toàn trên (thanh trạng thái / tai thỏ) ───────────────────────────
 * ⛔ Banner nằm ĐẦU cây, trên cả `AppBar`, nên nó phải tự né thanh trạng thái: đệm `insets.top` quanh `Alert`. Thiếu đệm
 * này thì hộp cảnh báo chồng lên đồng hồ/sóng/pin và lỗ camera.
 *
 * ⛔ Đệm đó làm phần bên dưới bị cộng vùng an toàn HAI LẦN (banner đã né thanh trạng thái, `AppBar`/`Screen` lại cộng
 * `insets.top` lần nữa ⇒ khoảng trống dư ~44dp). Nên khi banner ĐANG hiện, truyền `children` để bọc phần còn lại: nó thấy
 * `insets.top = 0` cho tới khi banner ẩn. Ngoài trường hợp banner hiện, `children` đi qua nguyên vẹn (cùng `insets`).
 *
 * `children` là `Provider` chứ KHÔNG phải `View` nên không thêm hộp nào vào cây — `Tabs` bọc trong đây vẫn là navigator gốc.
 */
export function ConnectionBanner({ children }: { children?: ReactNode }) {
  const state = useConnectionState();
  const [showConnecting, setShowConnecting] = useState(false);
  // Đọc trực tiếp context (không qua `useSafeAreaInsets`) — hook đó NÉM khi thiếu provider, mà banner còn dùng được ngoài cây có nó.
  const insets = useContext(SafeAreaInsetsContext);

  useEffect(() => {
    if (state !== 'connecting') return undefined;
    const timer = setTimeout(() => setShowConnecting(true), CONNECTING_DELAY_MS);
    // Dọn dẹp cũng là chỗ ĐẶT LẠI cờ về `false` khi RỜI trạng thái `connecting`
    // (thay vì gọi `setState` đồng bộ ngay đầu thân effect — bị
    // `react-hooks/set-state-in-effect` chặn) — để lần SAU vào lại `connecting`
    // phải chờ đủ 3s mới hiện, không dùng ké giá trị `true` còn sót từ lượt trước.
    return () => {
      clearTimeout(timer);
      setShowConnecting(false);
    };
  }, [state]);

  const visible = !(
    state === 'connected' ||
    state === 'unauthorized' ||
    (state === 'connecting' && !showConnecting)
  );

  // Giá trị cho phần bên dưới: banner hiện ⇒ `top = 0` (banner đã ăn vùng an toàn trên). `useMemo` để không tạo object mới mỗi lần vẽ.
  const insetsBelow = useMemo(
    () => (insets && visible ? { ...insets, top: 0 } : insets),
    [insets, visible],
  );

  return (
    <>
      {visible ? (
        // `bg-bg-base`: vùng đệm dưới thanh trạng thái phải mang NỀN CỦA MÀN (đổi theo sáng/tối). Để trong suốt thì lộ nền cửa sổ hệ
        // thống (trắng) — ở giao diện tối thành một dải trắng lệch tông, chữ đồng hồ/sóng (trắng) chìm trên đó.
        <View className="bg-bg-base" style={{ paddingTop: insets?.top ?? 0 }}>
          <Alert
            description={state === 'offline' ? 'Bạn đang ngoại tuyến' : 'Đang kết nối lại…'}
            tone={state === 'offline' ? 'error' : 'warning'}
          />
        </View>
      ) : null}
      {children === undefined ? null : (
        <SafeAreaInsetsContext.Provider value={insetsBelow}>
          {children}
        </SafeAreaInsetsContext.Provider>
      )}
    </>
  );
}
