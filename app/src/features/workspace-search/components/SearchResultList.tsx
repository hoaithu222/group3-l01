import { FlashList } from '@shopify/flash-list';
import { View } from 'react-native';

import { PartialResultNotice } from '@/shared/search';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { LoadingMore } from '@/shared/ui/progress';

import type { SearchRow, WorkspaceSearchType } from '../api';
import { SearchResultRow, type SearchRowHandlers } from './SearchResultRow';

export interface SearchResultListProps {
  handlers: SearchRowHandlers;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** Đang hiện kết quả CŨ trong lúc chờ kết quả của từ khoá/bộ lọc mới — mờ đi để không bị tưởng là kết quả mới. */
  isStale: boolean;
  joiningId: string | null;
  /** Tải trang kế đã lỗi (mạng/429) — hiện nút thử lại ở cuối thay vì im lặng dừng. */
  loadMoreFailed: boolean;
  meId: string | undefined;
  /** BE hết ngân sách thời gian giữa chừng — kết quả có thể thiếu tin cũ. */
  partial: boolean;
  rows: SearchRow[];
  selectedKey: string | null;
  tab: WorkspaceSearchType;
  /** BE chỉ tìm ở nơi hoạt động gần nhất (vượt trần 200 kênh/nhóm chat, hoặc 500 thành viên). */
  truncated: boolean;
  onLoadMore: () => void;
}

const TRUNCATED_NOTICE: Record<WorkspaceSearchType, string> = {
  channels:
    'Nhóm có rất nhiều kênh — chỉ hiện kênh hoạt động gần đây. Gõ đầy đủ tên hơn để thu hẹp.',
  files:
    'Nhóm có rất nhiều kênh — chỉ tìm ở nơi hoạt động gần đây. Dùng bộ lọc phạm vi để thu hẹp.',
  meetings: 'Kết quả có thể chưa đầy đủ — thử thêm từ khoá.',
  messages:
    'Nhóm có rất nhiều kênh — chỉ tìm ở nơi hoạt động gần đây. Dùng bộ lọc phạm vi để thu hẹp.',
  people: 'Nhóm rất đông — chỉ tìm trong một phần thành viên. Gõ đầy đủ tên hơn để thu hẹp.',
};

/**
 * Danh sách kết quả (FlashList, cursor): mỗi loại một hàng (`SearchResultRow`), thông báo `partial`/`truncated` ở đầu, vòng
 * quay/nút thử lại ở cuối. `keyExtractor` theo khoá ổn định của từng loại (`SearchRow.key`), không theo chỉ số — thêm
 * trang hay đổi bộ lọc không làm hàng nhảy lẫn nhau. Vị trí cuộn được giữ nguyên khi mở một kết quả và quay lại vì màn
 * tìm NẰM LẠI trong ngăn xếp (`router.push`), không cần lưu chỉ số.
 */
export function SearchResultList({
  handlers,
  hasNextPage,
  isFetchingNextPage,
  isStale,
  joiningId,
  loadMoreFailed,
  meId,
  partial,
  rows,
  selectedKey,
  tab,
  truncated,
  onLoadMore,
}: SearchResultListProps) {
  return (
    // FlashList không nhận `className` nên mờ ở View bọc.
    <View className={isStale ? 'flex-1 opacity-60' : 'flex-1'}>
      <FlashList<SearchRow>
        contentContainerStyle={{ paddingBottom: 16 }}
        data={rows}
        extraData={selectedKey}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(row) => `${row.type}:${row.key}`}
        ListFooterComponent={
          loadMoreFailed ? (
            <View className="items-center px-md py-sm">
              <Button
                label="Không tải thêm được · Thử lại"
                size="sm"
                variant="tertiary"
                onPress={onLoadMore}
              />
            </View>
          ) : isFetchingNextPage ? (
            <LoadingMore />
          ) : null
        }
        ListHeaderComponent={
          partial || truncated ? (
            <View className="gap-xs px-md pb-xs">
              {partial ? <PartialResultNotice /> : null}
              {truncated ? <Alert description={TRUNCATED_NOTICE[tab]} tone="info" /> : null}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <SearchResultRow
            handlers={handlers}
            joiningId={joiningId}
            meId={meId}
            row={item}
            selected={item.key === selectedKey}
          />
        )}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        testID="workspace-search-results"
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage && !loadMoreFailed) onLoadMore();
        }}
        onEndReachedThreshold={0.4}
      />
    </View>
  );
}
