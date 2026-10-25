import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';

/** Phần của kết quả `useQuery` mà hook cần — truyền thẳng kết quả query vào được. */
export interface RefetchableQuery {
  isStale: boolean;
  refetch: () => unknown;
}

/**
 * `useIsFocused` NÉM lỗi ("Couldn't find a navigation object") khi component không nằm trong navigator: test dựng component
 * trần, hoặc thứ gì đó vẽ qua portal ở gốc app. Khi đó coi như "luôn đang xem" (không có lượt blur → focus ⇒ không tải lại)
 * thay vì làm sập cả cây chỉ vì một tính năng làm mới.
 *
 * ⚠️ Bọc hook trong `try` vẫn giữ đúng luật hook ở đây: nhánh ném xảy ra ở `useNavigation()` — lúc đó mới chỉ ĐỌC context,
 * chưa tạo hook có trạng thái nào — và một component không bao giờ đổi từ "trong navigator" sang "ngoài navigator", nên số hook
 * của mỗi lần vẽ luôn như nhau. Mock `expo-router` không khai `useIsFocused` (gọi `undefined`) cũng rơi vào nhánh này.
 */
function useIsFocusedSafe(): boolean {
  try {
    return useIsFocused();
  } catch {
    return true;
  }
}

/**
 * Làm mới dữ liệu ĐÃ CŨ khi màn được FOCUS LẠI — quay lại từ màn con, đổi tab rồi quay về.
 *
 * ⚠️ Vì sao cần: `query-client.ts` tắt `refetchOnWindowFocus` (trên di động "focus" là mỗi lần chuyển app), và màn nằm dưới
 * stack / tab đã mở GIỮ NGUYÊN mounted — không mount lại nên cũng không có `refetchOnMount`. Không có hook này, dữ liệu do
 * người khác hoặc feature khác đổi (không ai `invalidate` được khoá của màn này) đứng yên tới khi tải lại app — đúng lỗi
 * "chuyển sang màn liên quan vẫn thấy dữ liệu cũ".
 *
 * Chỉ tải lại khi dữ liệu ĐÃ CŨ (`isStale`, theo `staleTime` của query) và khi CHUYỂN từ blur → focus — lần vẽ đầu đã có
 * `useQuery` lo. `enabled = false` (cờ phân hệ tắt) ⇒ không làm gì: `refetch()` của query bị tắt vẫn gọi API thật.
 */
export function useRefetchOnFocus(query: RefetchableQuery, enabled = true): void {
  const focused = useIsFocusedSafe();
  const wasFocused = useRef(focused);
  const { isStale, refetch } = query;

  useEffect(() => {
    if (focused && !wasFocused.current && enabled && isStale) void refetch();
    wasFocused.current = focused;
  }, [focused, enabled, isStale, refetch]);
}
