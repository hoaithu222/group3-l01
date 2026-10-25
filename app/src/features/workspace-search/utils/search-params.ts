import dayjs from 'dayjs';

import type {
  SearchScopeOption,
  WorkspaceSearchParams,
  WorkspaceSearchType,
} from '../api/workspace-search.types';
import { SEARCH_TABS } from '../constants/workspace-search.constants';

/** Tab từ tham số route `?type=` — giá trị lạ/thiếu về `messages` (tab mặc định). */
export function parseSearchType(raw: string | undefined): WorkspaceSearchType {
  return SEARCH_TABS.find((tab) => tab.key === raw)?.key ?? 'messages';
}

/** Bộ lọc của màn tìm (app.md p5-04 §2 `SearchFilterSheet`) — chỉ áp cho tab Tin nhắn/Tệp (BE bỏ qua ở các tab còn lại). */
export interface SearchFilters {
  author: { id: string; name: string } | null;
  range: { start: Date | null; end: Date | null };
  /** Chỉ có nghĩa ở tab Tin nhắn — tab Tệp vốn chỉ trả tệp. */
  hasFile: boolean;
  /** Gồm hội thoại 1-1 với người còn trong nhóm (D-16). Khách không dùng được. */
  includeDirect: boolean;
  /** Một kênh/nhóm chat cụ thể. */
  scope: Pick<SearchScopeOption, 'id' | 'name' | 'type'> | null;
}

export const EMPTY_FILTERS: SearchFilters = {
  author: null,
  range: { start: null, end: null },
  hasFile: false,
  includeDirect: false,
  scope: null,
};

/** Tab nào có bộ lọc: hai tab tìm trên TIN NHẮN/TỆP; kênh, người, cuộc họp chỉ tìm theo tên. */
export function supportsFilters(type: WorkspaceSearchType): boolean {
  return type === 'messages' || type === 'files';
}

export function hasDateRange(filters: SearchFilters): boolean {
  return filters.range.start !== null || filters.range.end !== null;
}

/**
 * Số bộ lọc đang bật — hiện trên nút "Bộ lọc (n)" (chấm báo đang lọc) và quyết định có "Xoá bộ lọc" hay không. `hasFile`
 * chỉ tính ở tab Tin nhắn: sang tab Tệp nó không tác dụng gì, đếm nó là báo "đang lọc" một thứ không lọc.
 */
export function countActiveFilters(
  filters: SearchFilters,
  type: WorkspaceSearchType = 'messages',
): number {
  return (
    (filters.author ? 1 : 0) +
    (hasDateRange(filters) ? 1 : 0) +
    (filters.hasFile && type === 'messages' ? 1 : 0) +
    (filters.includeDirect ? 1 : 0) +
    (filters.scope ? 1 : 0)
  );
}

/**
 * Từ khoá + tab + bộ lọc → query của `GET /workspaces/:id/search`. Khoảng ngày theo GIỜ MÁY (đầu ngày → cuối ngày) rồi đổi
 * sang ISO — `from`/`to` kiểu `YYYY-MM-DD` sẽ bị BE hiểu là nửa đêm UTC, lệch một ngày với người dùng Việt Nam. Chọn một
 * ngày duy nhất (`end` còn `null`) nghĩa là CẢ ngày đó; `from > to` thì đảo lại (BE trả `VAL_001` nếu `from > to`).
 *
 * Tab không có bộ lọc chỉ gửi `{ q, type }` — thêm tham số thừa chỉ tạo khoá cache khác nhau vô ích. `includeDirect` chỉ gửi
 * khi bật (mặc định server là `false`); `hasFile` chỉ ở tab Tin nhắn.
 */
export function buildSearchParams(
  q: string,
  type: WorkspaceSearchType,
  filters: SearchFilters,
): WorkspaceSearchParams {
  const params: WorkspaceSearchParams = { q, type };
  if (!supportsFilters(type)) return params;

  if (filters.author) params.authorId = filters.author.id;
  const { start, end } = filters.range;
  if (start || end) {
    const a = dayjs((start ?? end) as Date);
    const b = dayjs((end ?? start) as Date);
    const [first, last] = a.isAfter(b) ? [b, a] : [a, b];
    params.from = first.startOf('day').toISOString();
    params.to = last.endOf('day').toISOString();
  }
  if (filters.scope) {
    params.scopeType = filters.scope.type;
    params.scopeId = filters.scope.id;
  }
  if (type === 'messages' && filters.hasFile) params.hasFile = true;
  if (filters.includeDirect) params.includeDirect = true;
  return params;
}
