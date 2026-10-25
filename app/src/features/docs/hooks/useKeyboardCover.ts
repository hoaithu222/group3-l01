import { useKeyboardState } from 'react-native-keyboard-controller';

import { useScreenFooterKeyboardOffset } from '@/shared/ui/screen';

/**
 * Phần ĐÁY vùng soạn bị bàn phím phủ lên (dp). `DocumentEditorBody` chừa đúng bấy nhiêu `paddingBottom` cho vùng soạn: WebView co lại và
 * toolbar nằm ngay trên bàn phím.
 *
 * ⛔ KHÔNG dùng `KeyboardAvoidingView` của `react-native-keyboard-controller` kèm `style={{ flex: 1 }}`: thẻ đó là `Reanimated.View`, `flex: 1`
 * bị rơi nên khung sập về chiều cao 0 — WebView cao 0dp, vùng soạn TRẮNG TRƠN dù trang vẫn nạp, kết nối và báo "Đã lưu", còn toolbar
 * dính lên ngay dưới thanh trạng thái (cùng bẫy ở `SheetSurface`, `KanbanScreen`). Ở đây chỉ dùng `View` thường + số đo bàn phím từ
 * `useKeyboardState` (cùng cách `MeetingChatSheet`).
 *
 * Màn nằm trong `<Tabs>`: bàn phím PHỦ lên thanh tab chứ không đẩy nó, nên chỉ phần bàn phím vượt quá thanh tab mới đè lên vùng soạn
 * (cùng luật `ComposerKeyboardLift`). Ngoài `<Tabs>` thanh tab = 0 ⇒ trừ 0.
 */
export function useKeyboardCover(): number {
  const keyboard = useKeyboardState((state) => (state.isVisible ? state.height : 0));
  const { opened: tabBarHeight } = useScreenFooterKeyboardOffset();
  return Math.max(keyboard - tabBarHeight, 0);
}
