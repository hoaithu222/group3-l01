import { createContext, useContext } from 'react';

/**
 * `true` ⇒ nội dung đang nằm TRONG một `BottomSheet`, và TẤM ĐÃ TỰ nâng lên đúng chiều cao bàn phím
 * (`KeyboardAvoidingView behavior="padding"` ở `SheetSurface`).
 *
 * ⚠️ Thành phần con có cơ chế né bàn phím RIÊNG (vd `KeyboardStickyView` của ô soạn tin) phải TẮT nó khi đọc được `true`,
 * không thì bị nâng HAI lần: tấm nâng một lần, ô soạn nâng thêm một lần nữa ⇒ ô soạn trôi lên giữa danh sách tin (hoặc
 * ra khỏi tấm thấp) và chừa một dải trống dưới bàn phím. Ngoài tấm, giá trị là `false` ⇒ hành vi cũ.
 */
const SheetKeyboardHandledContext = createContext(false);

export const SheetKeyboardHandledProvider = SheetKeyboardHandledContext.Provider;

export function useSheetKeyboardHandled(): boolean {
  return useContext(SheetKeyboardHandledContext);
}
