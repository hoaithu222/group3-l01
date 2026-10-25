/**
 * Barrel của nhóm `search`.
 *
 * ⛔ Không tự thêm vào `src/shared/ui/index.ts` — barrel tổng do agent điều
 * phối gom, nhiều nhánh cùng sửa file đó sẽ ghi đè lẫn nhau.
 */
export { SearchInput } from './SearchInput';
export type { SearchInputHandle, SearchInputProps } from './SearchInput';

export { SEARCH_DEBOUNCE_MS, useSearchInput } from './use-search-input';
export type { UseSearchInputOptions, UseSearchInputResult } from './use-search-input';

export type { SearchVariant } from './search.styles';
