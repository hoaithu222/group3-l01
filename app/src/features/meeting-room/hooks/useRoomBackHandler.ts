import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * Phím Back của Android trên màn phòng họp: `onBack` trả `true` ⇒ đã xử lý (chặn hành vi mặc định — thoát màn, mà trong phòng là bỏ họp
 * lặng lẽ). iOS không có phím Back (`gestureEnabled: false` ở route) nên hook không làm gì ở đó.
 */
export function useRoomBackHandler(onBack: () => boolean): void {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }, [onBack]);
}
