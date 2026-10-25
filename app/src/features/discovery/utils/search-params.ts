import dayjs from 'dayjs';

import type { ScopeSearchParams, SearchFileKind } from '../api/discovery.types';

/** `ANY` = "Có tệp" (mọi loại) → `hasFile=true`; còn lại → `fileKind`. `null` = không lọc theo tệp. */
export type FileFilter = 'ANY' | SearchFileKind;

export interface SearchFilters {
  author: { id: string; name: string } | null;
  range: { start: Date | null; end: Date | null };
  file: FileFilter | null;
  /** Mặc định `true` (kết quả gồm reply trong luồng). Chỉ có nghĩa ở KÊNH — hội thoại không có luồng. */
  includeThreads: boolean;
}

export const EMPTY_FILTERS: SearchFilters = {
  author: null,
  range: { start: null, end: null },
  file: null,
  includeThreads: true,
};

export const FILE_FILTER_LABEL: Record<FileFilter, string> = {
  ANY: 'Có tệp',
  IMAGE: 'Ảnh',
  VIDEO: 'Video',
  AUDIO: 'Âm thanh',
  VOICE: 'Tin nhắn thoại',
  FILE: 'Tài liệu',
};

/** Thứ tự chip trong tờ bộ lọc. */
export const FILE_FILTER_OPTIONS: readonly FileFilter[] = [
  'ANY',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'VOICE',
  'FILE',
];

export function hasDateRange(filters: SearchFilters): boolean {
  return filters.range.start !== null || filters.range.end !== null;
}

/** Số bộ lọc đang bật — hiện trên nút "Bộ lọc" và quyết định có nút "Xoá bộ lọc" hay không. */
export function countActiveFilters(filters: SearchFilters): number {
  return (
    (filters.author ? 1 : 0) +
    (hasDateRange(filters) ? 1 : 0) +
    (filters.file ? 1 : 0) +
    (filters.includeThreads ? 0 : 1)
  );
}

/**
 * Bộ lọc + từ khoá → query của `GET …/search`. Khoảng ngày theo GIỜ MÁY (đầu ngày → cuối ngày) rồi đổi sang ISO —
 * `from`/`to` kiểu `YYYY-MM-DD` sẽ bị BE hiểu là nửa đêm UTC, lệch một ngày với người dùng Việt Nam (xem
 * `date-picker.types.ts`). Chọn một ngày duy nhất (`end` còn `null`) nghĩa là CẢ ngày đó. `from > to` thì đảo lại
 * (BE trả `VAL_001` nếu `from > to`).
 */
export function buildSearchParams(q: string, filters: SearchFilters): ScopeSearchParams {
  const params: ScopeSearchParams = { q };
  if (filters.author) params.authorId = filters.author.id;

  const { start, end } = filters.range;
  if (start || end) {
    const a = dayjs((start ?? end) as Date);
    const b = dayjs((end ?? start) as Date);
    const [first, last] = a.isAfter(b) ? [b, a] : [a, b];
    params.from = first.startOf('day').toISOString();
    params.to = last.endOf('day').toISOString();
  }

  if (filters.file === 'ANY') params.hasFile = true;
  else if (filters.file) params.fileKind = filters.file;
  if (!filters.includeThreads) params.includeThreads = false;
  return params;
}
