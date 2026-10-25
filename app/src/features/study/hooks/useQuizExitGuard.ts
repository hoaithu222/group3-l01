import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';

/**
 * Hỏi "Thoát Quiz nhanh?" trước khi bỏ một lượt đang làm dở — nút quay lại trên thanh tiêu đề VÀ phím Back cứng của Android. Tiến độ chỉ sống trong
 * bộ nhớ của màn (Quiz nhanh không lưu gì), nên hộp thoại này là lớp duy nhất báo trước "thoát là mất". Không có lượt đang làm (thiết lập / tổng kết) thì
 * rời NGAY, phím Back trả về `false` để hệ điều hành/Expo Router tự lùi.
 */
export function useQuizExitGuard(active: boolean, leave: () => void) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setAsking(true);
      return true;
    });
    return () => sub.remove();
  }, [active]);

  return {
    asking,
    cancel: () => setAsking(false),
    confirm: () => {
      setAsking(false);
      leave();
    },
    requestLeave: () => {
      if (active) setAsking(true);
      else leave();
    },
  };
}
