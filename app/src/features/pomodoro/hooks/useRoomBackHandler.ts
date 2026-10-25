import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * Nút back cứng của Android trong phòng: `onBack` trả `true` = đã xử lý (chặn back mặc định) — dùng để hỏi "Rời phòng học?" thay vì
 * rời ngay (bấm nhầm là mất chỗ và mất mạch tập trung). `enabled = false` ⇒ không can thiệp.
 */
export function useRoomBackHandler(enabled: boolean, onBack: () => boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }, [enabled, onBack]);
}
