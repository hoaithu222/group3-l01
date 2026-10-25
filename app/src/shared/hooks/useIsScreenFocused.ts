import { useIsFocused } from 'expo-router';

import { useAppActive } from './useAppActive';

/**
 * Màn đang THẬT SỰ hiện trước mắt người dùng: đang được chọn trong navigator VÀ app đang ở tiền cảnh — dùng làm `active` cho
 * hiệu ứng lặp (`GlowOrbs`, `BorderBeam`, `ShimmerSweep loop`, `Sparkles`…) để chúng DỪNG khi người dùng sang tab khác.
 *
 * ── Vì sao cần ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * Thanh tab giữ các màn đã mở trong cây (không tháo): một vòng lặp ở Trang chủ vẫn chạy trên luồng UI trong lúc người dùng
 * đọc tin nhắn ở tab khác — tốn pin mà không ai nhìn.
 *
 * ⚠️ `useIsFocused()` NÉM LỖI khi không nằm trong navigator (test dựng màn trần, nội dung trong `<Modal>` ngoài cây điều
 * hướng) ⇒ bọc `try`: ngoài navigator coi như ĐANG hiện (cùng cách `useRefetchOnFocus`). Hook vẫn được gọi đúng thứ tự mỗi
 * lần vẽ nên không phạm luật hook.
 */
function useIsFocusedSafe(): boolean {
  try {
    return useIsFocused();
  } catch {
    return true;
  }
}

export function useIsScreenFocused(): boolean {
  // ⚠️ `useAppActive` trả TRẠNG THÁI (`active`/`inactive`/`background`), không phải boolean. `inactive` (hộp Face ID, kéo
  // Trung tâm điều khiển) vẫn coi là đang hiện — màn còn nằm ngay dưới lớp phủ trong suốt, dừng hiệu ứng là thấy khựng.
  const appState = useAppActive();
  const focused = useIsFocusedSafe();
  return focused && appState !== 'background';
}
