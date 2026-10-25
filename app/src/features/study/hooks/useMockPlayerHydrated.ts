import { useSyncExternalStore } from 'react';

import { useMockPlayerStore } from '../store/mock-player.store';

/**
 * `true` khi `mock-player.store` đã nạp xong từ AsyncStorage — màn thi chờ cờ này trước khi khôi phục đáp án.
 * ⛔ Đọc store ở khung hình đầu là đọc RỖNG: "khôi phục" ra không có gì rồi bị đĩa ghi đè ngay sau đó.
 */
export function useMockPlayerHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useMockPlayerStore.persist.onFinishHydration(onChange),
    () => useMockPlayerStore.persist.hasHydrated(),
    () => false,
  );
}
