import { useCallback, useMemo, useState } from 'react';

import { validateSearchText } from '@/shared/search';

import type { WorkspaceSearchType } from '../api';
import { SEARCH_TABS, type SearchTabDef } from '../constants/workspace-search.constants';
import { useSearchWorkspaceHead } from '../queries/workspace-search.queries';
import {
  buildSearchParams,
  EMPTY_FILTERS,
  parseSearchType,
  type SearchFilters,
} from '../utils/search-params';
import { useRecentSearches } from './useRecentSearches';
import { useSearchLimits } from './useSearchLimits';
import { useSearchTextInput } from './useSearchTextInput';

export interface SearchCriteriaOptions {
  initialQuery?: string;
  initialType?: string;
  workspaceId: string;
}

/**
 * TIÊU CHÍ tìm của màn: từ khoá (ô uncontrolled + debounce) · tab · bộ lọc · vai trò của mình (khách không có tab "Người").
 * Tách khỏi `useWorkspaceSearchScreen` (truy vấn + trạng thái hiển thị) để mỗi hook giữ dưới trần dòng.
 */
export function useSearchCriteria({
  initialQuery,
  initialType,
  workspaceId,
}: SearchCriteriaOptions) {
  const limits = useSearchLimits();
  const head = useSearchWorkspaceHead(workspaceId);
  const input = useSearchTextInput({ initialValue: initialQuery ?? '' });
  const recents = useRecentSearches(workspaceId);
  const [selectedTab, setSelectedTab] = useState<WorkspaceSearchType>(() =>
    parseSearchType(initialType),
  );
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);

  // Khách: 403 `SRCH_103` ở tab Người nên ẩn hẳn. Chưa biết vai trò thì ẩn (không chớp tab rồi biến); lỗi tải vai trò thì
  // cho hiện — BE là nơi quyết định.
  const isGuest = head.data?.myRole === 'GUEST';
  const canSearchPeople = head.data ? !isGuest : head.isError;
  const tabs = useMemo<readonly SearchTabDef[]>(
    () => SEARCH_TABS.filter((tab) => tab.key !== 'people' || canSearchPeople),
    [canSearchPeople],
  );
  const tab = tabs.some((item) => item.key === selectedTab) ? selectedTab : 'messages';

  const check = useMemo(() => validateSearchText(input.value, limits), [input.value, limits]);
  const params = useMemo(
    () => buildSearchParams(check.text, tab, filters),
    [check.text, tab, filters],
  );

  /** Chốt từ khoá vào "tìm gần đây" — gọi khi nhấn "Tìm" hoặc mở một kết quả (không lưu từng nhịp debounce). */
  const remember = useCallback(
    (raw: string) => {
      const checked = validateSearchText(raw, limits);
      if (checked.issue === null) recents.add(checked.text);
    },
    [limits, recents],
  );

  const inputProps = useMemo(
    () => ({
      ...input.inputProps,
      onSubmitEditing: (event: { nativeEvent: { text: string } }) => {
        input.inputProps.onSubmitEditing(event);
        remember(event.nativeEvent.text);
      },
    }),
    [input.inputProps, remember],
  );

  const rememberCurrent = useCallback(() => remember(check.text), [remember, check.text]);
  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const { apply } = input;
  const pickRecent = useCallback(
    (term: string) => {
      apply(term);
      recents.add(term);
    },
    [apply, recents],
  );

  return {
    canSearchPeople,
    check,
    clearFilters,
    filters,
    input: { inputKey: input.inputKey, inputProps },
    isGuest,
    params,
    pickRecent,
    recents,
    remember: rememberCurrent,
    setFilters,
    setTab: setSelectedTab,
    tab,
    tabs,
  };
}
