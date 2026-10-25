import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { useContext } from 'react';

/**
 * `offset` truyền thẳng vào `KeyboardStickyView` bọc `footer` của `Screen` —
 * bù đúng chiều cao thanh tab dưới lúc bàn phím mở.
 *
 * ── Vì sao cần: bàn phím PHỦ lên thanh tab, không đẩy nó ────────────────────
 * Trên màn nằm trong `<Tabs>`, `footer` của `Screen` đứng NGAY TRÊN thanh tab
 * (`BottomTabBarHeightContext` khiến `useScreenBodyPadding` bỏ `insets.bottom`
 * — chính thanh tab đã lo phần đó, xem hook đó). Bàn phím mở thì
 * `KeyboardStickyView` mặc định nâng `footer` lên đúng CHIỀU CAO BÀN PHÍM —
 * nhưng bàn phím chỉ CHE thanh tab chứ không đẩy nó đi, nên `footer` bị nâng
 * THỪA đúng một thanh tab: nút nổi lơ lửng cách bàn phím một dải trống bằng
 * chiều cao thanh tab, lộ nội dung màn phía sau (đã đo trên máy thật ở
 * `MeetingFormScreen` — bấm "Tiêu đề" thì nút "Tạo cuộc họp" nổi giữa màn,
 * "Ngày họp"/"Thời gian" vẫn lộ ra giữa nút và bàn phím). Ngoài `<Tabs>`
 * (context vắng) ⇒ 0 ⇒ như cũ, không đổi gì.
 *
 * Cùng một lớp lỗi, cùng cách bù như `ComposerKeyboardLift`
 * (`features/chat/components/composer`) — chỉ khác chỗ dùng.
 *
 * ```tsx
 * const footerKeyboardOffset = useScreenFooterKeyboardOffset();
 * const footer = (
 *   <KeyboardStickyView offset={footerKeyboardOffset}>
 *     <BottomActionBar>
 *       <Button label="Xác nhận" fullWidth onPress={submit} />
 *     </BottomActionBar>
 *   </KeyboardStickyView>
 * );
 * ```
 */
export function useScreenFooterKeyboardOffset(): { closed: number; opened: number } {
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  return { closed: 0, opened: tabBarHeight };
}
