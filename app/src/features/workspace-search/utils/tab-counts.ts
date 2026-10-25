import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { workspaceSearchKeys, type WorkspaceSearchPage, type WorkspaceSearchType } from '../api';
import { formatCount } from './result-format';
import { buildSearchParams, type SearchFilters } from './search-params';

/** Số kết quả ĐÃ BIẾT của một tab: `hasMore` ⇒ còn trang sau, số thật ≥ `count` ("30+"). */
export interface TabCount {
  count: number;
  hasMore: boolean;
}

export type TabCounts = Partial<Record<WorkspaceSearchType, TabCount>>;

/**
 * Đọc số đếm từng tab từ CACHE kết quả — không gọi API: mỗi lượt tìm tốn 1 trong 30 lần/phút, nên tab chưa mở thì chưa
 * có số (không hiện badge) thay vì bắn 5 request mỗi lần gõ. Khoá cache dựng bằng ĐÚNG `buildSearchParams` của lượt tìm
 * thật, nên tab nào có bộ lọc riêng (Tin nhắn/Tệp) chỉ lấy số của lượt đã lọc khớp bộ lọc hiện tại.
 */
export function readTabCounts(
  queryClient: QueryClient,
  workspaceId: string,
  text: string,
  filters: SearchFilters,
  types: readonly WorkspaceSearchType[],
): TabCounts {
  const counts: TabCounts = {};
  for (const type of types) {
    const key = workspaceSearchKeys.search(workspaceId, buildSearchParams(text, type, filters));
    const data = queryClient.getQueryData<InfiniteData<WorkspaceSearchPage>>(key);
    if (!data || data.pages.length === 0) continue;
    counts[type] = {
      count: data.pages.reduce((sum, page) => sum + page.data.length, 0),
      hasMore: data.pages[data.pages.length - 1]?.meta.hasMore ?? false,
    };
  }
  return counts;
}

/** Chữ hiện trên tab: `Tin nhắn` (chưa biết) · `Tin nhắn 12` · `Tin nhắn 30+`. */
export function tabLabel(label: string, count: TabCount | undefined): string {
  return count ? `${label} ${formatCount(count.count, count.hasMore)}` : label;
}

/**
 * Nhãn cho trình đọc màn hình (app.md p5-04 §7): "Tin nhắn, có kết quả" / "Tin nhắn, không có kết quả". Chưa biết số (tab chưa mở,
 * hoặc trang đầu rỗng mà còn trang sau — BE lọc sau khi lấy) thì đọc đúng nhãn, không bịa ra "không có kết quả".
 */
export function tabAccessibilityLabel(label: string, count: TabCount | undefined): string {
  if (!count) return label;
  if (count.count === 0) return count.hasMore ? label : `${label}, không có kết quả`;
  return `${label}, có kết quả, ${formatCount(count.count, count.hasMore).replace('+', ' trở lên')}`;
}
