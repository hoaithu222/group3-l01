import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useBreakpoint } from '@/shared/theme';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SearchInput } from '@/shared/ui/search';
import { FeatureOffScreen } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { MessageHit } from '../api';
import { RecentSearchList } from '../components/RecentSearchList';
import { SearchFilterSheet } from '../components/SearchFilterSheet';
import { SearchFiltersBar } from '../components/SearchFiltersBar';
import { SearchPreviewPane } from '../components/SearchPreviewPane';
import { SearchResultList } from '../components/SearchResultList';
import { SearchStateView } from '../components/SearchStateView';
import { SearchTabs } from '../components/SearchTabs';
import { useSearchLookbackMonths } from '../hooks/useSearchLimits';
import { useSearchRowHandlers } from '../hooks/useSearchRowHandlers';
import { useWorkspaceSearchScreen } from '../hooks/useWorkspaceSearchScreen';
import { openScopeSearch } from '../utils/open-result';
import { countActiveFilters, hasDateRange, supportsFilters } from '../utils/search-params';

/**
 * "Tìm toàn workspace" (app.md p5-04 §1–3): ô tìm (tự lấy focus lúc mở, KHÔNG lấy lại khi quay về từ một kết quả) → tab loại
 * kết quả (Tin nhắn · Tệp · Kênh · Người · Cuộc họp) → bộ lọc → danh sách. Toàn bộ logic (từ khoá/debounce IME, kiểm hợp lệ
 * trước khi gọi API, trạng thái, số đếm tab) ở `useWorkspaceSearchScreen`; màn chỉ ghép.
 *
 * Máy tính bảng: kết quả TIN ở nửa trái, xem trước ở nửa phải (bản tối thiểu — xem `SearchPreviewPane`); các tab khác và
 * điện thoại dùng cả bề ngang, chạm là mở luôn. Cờ phụ `workspaceSearch` tắt ⇒ `FeatureRouteGuard` ở route (khi mở màn) hoặc
 * `status === 'disabled'` ở đây (khi bị tắt/`CFG_005` lúc đang mở).
 */
export function WorkspaceSearchScreen() {
  const { q, type, wsId } = useLocalSearchParams<{ q?: string; type?: string; wsId: string }>();
  const search = useWorkspaceSearchScreen({
    initialQuery: q,
    initialType: type,
    workspaceId: wsId,
  });
  const { isTablet } = useBreakpoint();
  const meId = useAuthStore((state) => state.user?.id);
  const lookbackMonths = useSearchLookbackMonths();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<MessageHit | null>(null);

  const { tab } = search;
  const { handlers, joiningId, openMessage } = useSearchRowHandlers({
    onSelectMessage: isTablet && tab === 'messages' ? setSelected : undefined,
    remember: search.remember,
    workspaceId: wsId,
  });

  if (search.status === 'disabled') return <FeatureOffScreen />;

  // Kết quả đổi (gõ tiếp, đổi tab/bộ lọc) mà tin đang xem trước không còn trong danh sách ⇒ bỏ xem trước.
  const preview =
    selected && search.rows.some((row) => row.type === 'messages' && row.key === selected.messageId)
      ? selected
      : null;
  const showPreview = isTablet && tab === 'messages' && search.status === 'results';
  const openFilters = () => setFiltersOpen(true);
  const hasFilters = countActiveFilters(search.filters, tab) > 0;

  let body: ReactNode;
  if (search.status === 'results') {
    body = (
      <SearchResultList
        handlers={handlers}
        hasNextPage={search.hasNextPage}
        isFetchingNextPage={search.isFetchingNextPage}
        isStale={search.isStale}
        joiningId={joiningId}
        loadMoreFailed={search.error !== null}
        meId={meId}
        partial={search.partial}
        rows={search.rows}
        selectedKey={preview?.messageId ?? null}
        tab={tab}
        truncated={search.truncated}
        onLoadMore={search.fetchNextPage}
      />
    );
  } else if (search.status === 'hint' && search.check.issue === 'empty') {
    body = (
      <RecentSearchList
        items={search.recents.items}
        onClear={search.recents.clear}
        onPick={search.pickRecent}
        onRemove={search.recents.remove}
      />
    );
  } else {
    body = (
      <SearchStateView
        dateRangeSet={hasDateRange(search.filters)}
        error={search.error}
        errorStamp={search.errorStamp}
        hasFilters={hasFilters}
        issue={search.check.issue}
        lookbackMonths={lookbackMonths}
        status={search.status}
        tab={tab}
        onClearFilters={search.clearFilters}
        onClearScope={() => search.setFilters({ ...search.filters, scope: null })}
        onOpenFilters={openFilters}
        onRetry={search.retry}
      />
    );
  }

  return (
    <Screen
      header={
        <AppBar
          search={
            <SearchInput
              key={search.input.inputKey}
              {...search.input.inputProps}
              accessibilityLabel="Tìm trong nhóm"
              // Chỉ lần dựng đầu: điền từ "tìm gần đây" dựng lại ô (`inputKey` đổi) và KHÔNG được bật lại bàn phím.
              autoFocus={search.input.inputKey === 0}
              placeholder="Tìm trong nhóm"
              returnKeyType="search"
            />
          }
          variant="search"
          onBack={router.back}
        />
      }
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 gap-xs py-xs">
        <SearchTabs
          counts={search.counts}
          tabs={search.tabs}
          value={tab}
          onChange={search.setTab}
        />
        {supportsFilters(tab) ? (
          <SearchFiltersBar
            filters={search.filters}
            type={tab}
            onClear={search.clearFilters}
            onOpen={openFilters}
          />
        ) : null}

        <View className="flex-1 flex-row">
          <View className="flex-1">{body}</View>
          {showPreview ? (
            <View className="flex-1 border-l border-l-divider-1">
              <SearchPreviewPane hit={preview} onOpen={openMessage} />
            </View>
          ) : null}
        </View>
      </View>

      <SearchFilterSheet
        filters={search.filters}
        isGuest={search.isGuest}
        type={tab}
        visible={filtersOpen}
        workspaceId={wsId}
        onApply={search.setFilters}
        onClose={() => setFiltersOpen(false)}
        onOpenScopeSearch={(scope) => {
          setFiltersOpen(false);
          openScopeSearch(wsId, scope);
        }}
      />
    </Screen>
  );
}
