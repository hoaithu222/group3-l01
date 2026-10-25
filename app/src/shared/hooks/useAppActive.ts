import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * `AppState.currentState` dưới dạng hook — tiện dùng lại ở nhiều nơi cần biết
 * app đang `active`/`background`/`inactive` (khác với `bindAppState()` ở
 * `core/socket/socket.client.ts`, vốn là một side-effect imperative chạy MỘT
 * LẦN ở gốc app, không phải hook để nhiều component cùng đọc).
 *
 * ⚠️ Trả nguyên `AppStateStatus`, KHÔNG rút gọn thành boolean "đang mở hay
 * không": `inactive` (iOS lúc hộp Face ID hiện, lúc kéo Trung tâm điều khiển)
 * và `background` là hai trạng thái có Ý NGHĨA KHÁC NHAU với logic khoá ứng
 * dụng (`shell/app-lock`) — gộp làm một là mất đúng phân biệt mà nơi gọi cần.
 */
export function useAppActive(): AppStateStatus {
  const [state, setState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setState);
    return () => subscription.remove();
  }, []);

  return state;
}
