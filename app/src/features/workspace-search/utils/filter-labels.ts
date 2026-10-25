import { formatDate } from '@/shared/utils/format/date.utils';

import type { WorkspaceSearchType } from '../api';
import { hasDateRange, type SearchFilters } from './search-params';

export interface ActiveFilterLabel {
  key: string;
  label: string;
}

/** `25/09/2026` hoặc `20/09/2026 – 25/09/2026` — một ngày duy nhất nghĩa là CẢ ngày đó (xem `buildSearchParams`). */
export function formatDateRangeLabel(range: SearchFilters['range']): string {
  const start = formatDate(range.start ?? range.end);
  const end = formatDate(range.end ?? range.start);
  return start === end ? start : `${start} – ${end}`;
}

/** Tên phạm vi đang lọc: kênh → `#tên`, nhóm chat → tên nhóm. */
export function scopeFilterLabel(scope: NonNullable<SearchFilters['scope']>): string {
  return scope.type === 'CHANNEL' ? `#${scope.name}` : scope.name;
}

/** Nhãn từng bộ lọc ĐANG bật ở tab hiện tại — thứ tự cố định để chip không nhảy vị trí khi bật thêm. */
export function activeFilterLabels(
  filters: SearchFilters,
  type: WorkspaceSearchType,
): ActiveFilterLabel[] {
  const labels: ActiveFilterLabel[] = [];
  if (filters.author) labels.push({ key: 'author', label: `Người gửi: ${filters.author.name}` });
  if (hasDateRange(filters))
    labels.push({ key: 'range', label: formatDateRangeLabel(filters.range) });
  if (filters.scope)
    labels.push({ key: 'scope', label: `Trong ${scopeFilterLabel(filters.scope)}` });
  if (type === 'messages' && filters.hasFile)
    labels.push({ key: 'hasFile', label: 'Có tệp đính kèm' });
  if (filters.includeDirect) labels.push({ key: 'direct', label: 'Gồm tin nhắn riêng' });
  return labels;
}
