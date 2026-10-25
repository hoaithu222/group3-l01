import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SearchInput } from '@/shared/ui/search';
import { LoadingMore } from '@/shared/ui/progress';

import type { DiscoveryScope, SearchHit } from '../api/discovery.types';
import { PartialResultNotice } from '../components/PartialResultNotice';
import { SearchFilterSheet } from '../components/SearchFilterSheet';
import { SearchFiltersBar } from '../components/SearchFiltersBar';
import { SearchHitRow } from '../components/SearchHitRow';
import { SearchStateView } from '../components/SearchStateView';
import { useScopeSearchScreen } from '../hooks/useScopeSearchScreen';
import { openMessage } from '../utils/open-message';
import { countActiveFilters } from '../utils/search-params';

export interface ScopeSearchScreenProps {
  scope: DiscoveryScope;
}

/**
 * Tìm trong MỘT kênh/hội thoại (app.md p1-09 §3) — dùng chung cho cả hai qua `scope`.
 *
 * Chạm kết quả → `router.push` màn chat `?m=<id>` (hoặc màn luồng cho reply): màn này NẰM LẠI trong ngăn xếp, nên Back về
 * đúng nó với từ khoá, bộ lọc và vị trí cuộn còn nguyên ("Quay lại kết quả", SAV-06) — không có state nào phải lưu bền.
 */
export function ScopeSearchScreen({ scope }: ScopeSearchScreenProps) {
  const search = useScopeSearchScreen(scope);
  const [sheetOpen, setSheetOpen] = useState(false);

  const openHit = useCallback(
    (hit: SearchHit) =>
      openMessage({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        workspaceId: scope.workspaceId,
        messageId: hit.messageId,
        // `threadId`/`parentMessageId` cùng nghĩa: id TIN GỐC của luồng (không phải `Thread.id`).
        threadRootId: hit.threadId ?? hit.parentMessageId,
      }),
    [scope.scopeType, scope.scopeId, scope.workspaceId],
  );

  const hasFilters = countActiveFilters(search.filters) > 0;

  return (
    <Screen
      header={
        <AppBar
          search={<SearchInput {...search.input.inputProps} autoFocus placeholder="Tìm tin nhắn" />}
          variant="search"
          onBack={router.back}
        />
      }
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 gap-sm py-xs">
        <SearchFiltersBar
          filters={search.filters}
          onClear={search.clearFilters}
          onOpen={() => setSheetOpen(true)}
        />

        <View className="flex-1">
          {search.status === 'results' ? (
            // Đang chờ kết quả của bộ lọc/từ khoá mới thì kết quả CŨ mờ đi — FlashList không nhận `className` nên mờ ở View bọc.
            <View className={search.isStale ? 'flex-1 opacity-60' : 'flex-1'}>
              <FlashList<SearchHit>
                contentContainerStyle={{ paddingBottom: 16 }}
                data={search.hits}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                keyExtractor={(hit) => hit.messageId}
                ListFooterComponent={
                  search.error ? (
                    <View className="items-center px-md py-sm">
                      <Button
                        label="Không tải thêm được · Thử lại"
                        size="sm"
                        variant="tertiary"
                        onPress={search.fetchNextPage}
                      />
                    </View>
                  ) : search.isFetchingNextPage ? (
                    <LoadingMore />
                  ) : null
                }
                ListHeaderComponent={
                  search.partial ? <PartialResultNotice className="px-md pb-xs" /> : null
                }
                renderItem={({ item }) => <SearchHitRow hit={item} onPress={openHit} />}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                testID="scope-search-results"
                onEndReached={() => {
                  if (search.hasNextPage && !search.isFetchingNextPage && !search.error)
                    search.fetchNextPage();
                }}
                onEndReachedThreshold={0.4}
              />
            </View>
          ) : (
            <SearchStateView
              error={search.error}
              errorStamp={search.errorStamp}
              hasFilters={hasFilters}
              issue={search.issue}
              status={search.status}
              onClearFilters={search.clearFilters}
              onRetry={search.retry}
            />
          )}
        </View>
      </View>

      <SearchFilterSheet
        filters={search.filters}
        scope={scope}
        visible={sheetOpen}
        onApply={search.setFilters}
        onClose={() => setSheetOpen(false)}
      />
    </Screen>
  );
}
