import { useCallback, useRef } from 'react';

import {
  arrowDirection,
  canLeaveField,
  collectNavFields,
  findFieldInDirection,
  focusField,
  isNavField,
} from '@/shared/utils/browser/field-nav.utils';

/**
 * `[ref, onKeyDown]` — cả hai gắn vào CÙNG phần tử bọc ngoài cụm ô nhập.
 * Trả tuple (không phải object) để `react-hooks/refs` không coi là đọc ref
 * lúc render — cùng quy ước với `useElementSize`.
 */
export type ArrowFieldNav<T extends HTMLElement> = readonly [
  React.RefObject<T | null>,
  (e: React.KeyboardEvent) => void,
];

/**
 * Đi giữa các ô nhập trong một cụm form bằng phím mũi tên (↑ ↓ ← →).
 *
 * Dùng một handler ở phần tử bọc ngoài thay vì gắn vào từng `<Input>`: phím nổi
 * lên qua cell/row nên không phải sửa chữ ký của mọi ô, và ô đích được tìm bằng
 * toạ độ thật (xem `field-nav.utils.ts`) nên form dọc hay ngang đều đúng.
 *
 * Quy ước phạm vi: nếu ô đang đứng nằm trong một `<tr>` thì CHỈ đi trong dòng
 * đó — một dòng bảng là một bản ghi = một form. Nhờ vậy mũi tên không trượt
 * sang dòng khác (mỗi lúc chỉ một dòng đang sửa) hay rơi xuống thanh phân trang.
 *
 * Không cướp phím trong 4 trường hợp: đang gõ IME (tiếng Việt/Nhật dùng mũi tên
 * chọn gợi ý), có phím bổ trợ (Ctrl+→ nhảy từ, Shift+→ bôi đen), ô hiện tại
 * chưa cho rời (con trỏ còn giữa chữ, dropdown đang mở danh sách), hoặc không
 * có ô nào nằm về phía vừa nhấn.
 */
export function useArrowFieldNav<T extends HTMLElement>(): ArrowFieldNav<T> {
  const ref = useRef<T>(null);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

    const direction = arrowDirection(e.key);
    const container = ref.current;
    if (!direction || !container) return;

    const active = e.target as HTMLElement;
    // Nội dung portal (danh sách dropdown, popup gợi ý) nằm ngoài DOM container
    // nhưng event React vẫn nổi lên tới đây — loại ra để không cướp phím của nó.
    if (!container.contains(active) || !isNavField(active)) return;
    if (!canLeaveField(active, direction)) return;

    const scope = active.closest('tr') ?? container;
    const next = findFieldInDirection(collectNavFields(scope), active, direction);
    if (!next) return;

    e.preventDefault();
    focusField(next, direction);
  }, []);

  return [ref, onKeyDown] as const;
}
