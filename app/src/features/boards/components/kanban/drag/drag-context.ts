import { createContext, useContext } from 'react';

import type { DragContextValue } from './drag.types';

export const DragContext = createContext<DragContextValue | null>(null);

/**
 * `null` khi không có DragProvider (màn chỉ-đọc, test) — nơi gọi rơi về thẻ
 * thường thay vì ném lỗi: kéo thả là phần THÊM, `MoveTaskSheet` mới là đường chính.
 */
export function useDrag(): DragContextValue | null {
  return useContext(DragContext);
}
