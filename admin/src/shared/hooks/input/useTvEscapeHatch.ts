import { useEffect } from 'react';

import { useEventCallback } from '@/shared/hooks/state/useEventCallback';

/** Element mà user đang gõ text — bỏ qua để không cướp phím khi nhập liệu. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Lối tắt bàn phím thoát chế độ TV: Ctrl/Cmd + Alt + Shift + T.
 *
 * ⛔ Hook nhận CALLBACK chứ không tự đọc `@/app/store`. `shared/` biết tới
 * `app/` là kéo cả cây store vào mọi nơi dùng hook — test, showcase và dự án có
 * store khác đều gãy. Tầng `app/` nối vào store (xem `BackgroundLayout.tsx`).
 *
 * @param onEscape Gọi khi bấm đúng tổ hợp. KHÔNG cần ổn định tham chiếu —
 *                 `useEventCallback` lo phần đó nên listener chỉ gắn MỘT lần.
 */
export function useTvEscapeHatch(onEscape: () => void): void {
  // Tham chiếu ổn định nhưng luôn gọi bản mới nhất. Đưa thẳng `onEscape` vào
  // deps thì mỗi lần cha render lại sẽ gỡ rồi gắn lại listener trên `document` —
  // tốn vô ích và có kẽ hở giữa hai lần gắn.
  const handleEscape = useEventCallback(onEscape);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const hasMod = event.ctrlKey || event.metaKey;
      if (!hasMod || !event.altKey || !event.shiftKey) return;
      // Dùng `event.code` (vị trí phím vật lý) chứ KHÔNG dùng `event.key`:
      // giữ Alt làm đổi ký tự sinh ra ở nhiều bố cục bàn phím — trên macOS
      // Option+T cho `†`, nên so với `'t'` sẽ không bao giờ khớp và lối thoát
      // chết im lặng đúng trên nền tảng hay dùng Cmd nhất.
      if (event.code !== 'KeyT') return;

      // Tổ hợp không có hành vi mặc định nào của trình duyệt cần giữ lại —
      // chặn luôn kể cả khi TV đang tắt (idempotent, tránh side-effect lạ).
      event.preventDefault();

      handleEscape();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleEscape]);
}
