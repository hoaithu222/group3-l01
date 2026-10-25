import { useIsCoarsePointer } from '@/shared/hooks';

import { useDockSettings, type DockDisplayMode } from './dock-settings';

/**
 * Chế độ Dock ĐANG VẼ — `mode` người dùng chọn, TRỪ máy chạm luôn bị ép `pinned`
 * (ba chế độ còn lại chỉ gọi lại được bằng con trỏ — xem chú thích đầu `Dock.tsx`).
 *
 * Dock luôn là lớp fixed overlay; layout nền không cần đọc mode để chừa chỗ
 * đáy. Vì vậy mode chỉ quyết định cách Dock hiển thị, không thay đổi chiều cao
 * hoặc vùng nội dung của trang.
 */
export function useDockDisplayMode(): DockDisplayMode {
  const storedMode = useDockSettings((s) => s.mode);
  const isCoarsePointer = useIsCoarsePointer();
  return isCoarsePointer ? 'pinned' : storedMode;
}
