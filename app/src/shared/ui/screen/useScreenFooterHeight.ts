import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * Đo chiều cao THẬT của `footer` (đáy màn), cho `bottomOffset` của
 * `KeyboardAwareScrollView` ở `Screen.tsx`.
 *
 * ── Vì sao cần: footer trong `KeyboardStickyView` CHỒNG lên nội dung ────────
 * `KeyboardStickyView` chỉ dịch `footer` lên bằng `transform: translateY`
 * (xem `node_modules/react-native-keyboard-controller/src/components/
 * KeyboardStickyView`) — đây là hiệu ứng VẼ, không phải xếp lại bố cục, nên
 * footer vẫn nằm NGAY TRÊN nội dung ở đúng dải cao bằng chính nó, ngay phía
 * trên bàn phím. `bottomOffset` cũ (24, hằng số) chỉ đủ chừa chỗ cho một ô
 * nhập MỎNG — với `BottomActionBar` (~76–95dp tuỳ vùng an toàn đáy máy) thì hụt
 * mất 50–70dp, nên ô nhập cuối cùng (vd. "Lời nhắn") bị nút đáy đè ngang giữa:
 * mép trên card ô nhập lộ ra trên nút, phần rỗng của card lộ ra dưới nút.
 *
 * Đo bằng `onLayout` thay vì đọc cứng chiều cao `BottomActionBar`: footer là
 * `ReactNode` bất kỳ (một nút, hai nút xếp dọc…), mỗi nơi gọi một chiều cao
 * khác nhau — không có con số chung nào đúng cho mọi màn.
 */
export function useScreenFooterHeight() {
  const [height, setHeight] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setHeight(event.nativeEvent.layout.height);
  }, []);
  return { height, onLayout };
}
