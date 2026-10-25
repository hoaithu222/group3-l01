import { ScrollView } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button, LinkButton } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';

import { WORKSPACE_SEARCH_HINT } from '../constants/workspace-search.constants';

export interface RecentSearchListProps {
  /** Từ khoá đã chốt gần đây của MỘT nhóm — mới nhất trước, tối đa 10. */
  items: readonly string[];
  onClear: () => void;
  onPick: (term: string) => void;
  onRemove: (term: string) => void;
}

/**
 * Màn KHI CHƯA GÕ (app.md p5-04 §3 "trước khi gõ: tìm gần đây + gợi ý"): danh sách từ khoá gần đây (chạm để tìm lại NGAY,
 * mỗi dòng có nút xoá riêng + "Xoá tất cả") và một dòng mẹo dùng bộ lọc / gõ không dấu. Chưa có lịch sử thì chỉ còn dòng
 * gợi ý nhập. Cuộn được và `keyboardShouldPersistTaps="handled"`: chạm mục gợi ý khi bàn phím đang mở phải tới được ngay
 * cú chạm đầu, không bị nuốt vào việc đóng bàn phím.
 */
export function RecentSearchList({ items, onClear, onPick, onRemove }: RecentSearchListProps) {
  return (
    <ScrollView
      contentContainerClassName="gap-md px-md py-xs"
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {items.length === 0 ? (
        <EmptyState
          description={WORKSPACE_SEARCH_HINT.empty}
          icon="search"
          size="compact"
          tone="info"
        />
      ) : (
        <Section
          action={<LinkButton label="Xoá tất cả" size="sm" onPress={onClear} />}
          title="Tìm gần đây"
        >
          {items.map((term) => (
            <ListItem
              key={term}
              divider
              label={term}
              labelNumberOfLines={1}
              leading={<IconTile name="history" size="sm" tone="neutral" />}
              trailing={
                <Button
                  accessibilityLabel={`Xoá “${term}” khỏi tìm gần đây`}
                  iconLeft="cancel"
                  iconOnly
                  size="xs"
                  variant="tertiary"
                  onPress={() => onRemove(term)}
                />
              }
              onPress={() => onPick(term)}
            />
          ))}
        </Section>
      )}

      <Alert
        description="Gõ không dấu vẫn tìm được (“do an” khớp “đồ án”). Dùng bộ lọc để thu hẹp theo người gửi, khoảng ngày hoặc kênh."
        tone="info"
      />
    </ScrollView>
  );
}
