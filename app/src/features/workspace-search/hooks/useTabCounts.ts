import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import type { WorkspaceSearchType } from '../api';
import type { SearchFilters } from '../utils/search-params';
import { readTabCounts, type TabCounts } from '../utils/tab-counts';

const NONE = '{}';

/**
 * Số kết quả ĐÃ BIẾT của từng tab ("Tin nhắn 12", "Tệp 30+") — đọc từ CACHE kết quả nhưng PHẢN ỨNG khi cache đổi.
 *
 * ── ⛔ Vì sao không gọi `readTabCounts(queryClient, …)` thẳng trong lúc vẽ ─────────────────────────────────────────────
 * Cache của React Query là trạng thái NGOÀI React. Đọc nó trong thân render thì kết quả chỉ đúng khi có gì khác khiến màn vẽ lại;
 * và app bật React Compiler (`experiments.reactCompiler`) — trình biên dịch nhớ kết quả của phép tính theo ĐẦU VÀO của nó, mà cache
 * (cùng `queryClient`) không nằm trong đầu vào ⇒ số đếm kẹt ở bản cũ, không lỗi nào báo. Jest không chạy trình biên dịch nên test
 * màn cũng không thấy. `useSyncExternalStore` là đường chuẩn: đăng ký vào cache, và chuỗi ảnh chụp đổi thì màn vẽ lại.
 *
 * Ảnh chụp là CHUỖI JSON (giá trị nguyên thuỷ nên so sánh bằng nhau ổn định — `useSyncExternalStore` bắt buộc); `text = null`
 * (từ khoá chưa hợp lệ) ⇒ không có số nào, không đọc cache.
 */
export function useTabCounts(
  workspaceId: string,
  text: string | null,
  filters: SearchFilters,
  types: readonly WorkspaceSearchType[],
): TabCounts {
  const queryClient = useQueryClient();

  const subscribe = useCallback(
    (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange),
    [queryClient],
  );
  const getSnapshot = useCallback(
    () =>
      text === null
        ? NONE
        : JSON.stringify(readTabCounts(queryClient, workspaceId, text, filters, types)),
    [queryClient, workspaceId, text, filters, types],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(() => JSON.parse(snapshot) as TabCounts, [snapshot]);
}
