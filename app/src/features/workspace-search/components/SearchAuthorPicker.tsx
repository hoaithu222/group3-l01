import { Text, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Avatar } from '@/shared/ui/avatar';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';
import { SearchInput, useSearchInput } from '@/shared/ui/search';
import { Skeleton } from '@/shared/ui/skeleton';

import type { SearchAuthorOption } from '../api';
import { useSearchAuthors } from '../queries/workspace-search.queries';

export interface SearchAuthorPickerProps {
  selectedId: string | undefined;
  workspaceId: string;
  /** `null` = "Tất cả người gửi" (bỏ lọc). */
  onSelect: (author: SearchAuthorOption | null) => void;
}

const CHECK = <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" size="sm" />;

/**
 * Chọn NGƯỜI GỬI để lọc (app.md p5-04 §2): thành viên ACTIVE của nhóm, BE lọc theo `q` không dấu. Ô tìm uncontrolled +
 * debounce (`useSearchInput`, luật IME). Chỉ tải khi màn này mở; khách không tới được đây (BE trả 404 cho danh sách thành
 * viên) nên tờ bộ lọc ẩn hẳn dòng "Người gửi" với khách.
 */
export function SearchAuthorPicker({ selectedId, workspaceId, onSelect }: SearchAuthorPickerProps) {
  const input = useSearchInput();
  const authors = useSearchAuthors(workspaceId, input.value.trim(), true);

  return (
    <View className="gap-sm">
      <SearchInput {...input.inputProps} placeholder="Tìm người gửi" />

      {/* Hàng nằm trong MỘT `<View>` riêng: `gap-sm` của khối ngoài chỉ để cách ô tìm ↔ danh sách, chèn nó giữa các hàng có kẻ thì kẻ và hàng kế tiếp hở ra 12dp. */}
      <View>
        <ListItem
          divider
          label="Tất cả người gửi"
          leading={<Icon color="fg-2" name="user" />}
          selected={selectedId === undefined}
          trailing={selectedId === undefined ? CHECK : undefined}
          onPress={() => onSelect(null)}
        />

        {authors.isPending ? (
          <View className="gap-xs">
            <Skeleton className="h-10 rounded-md" />
            <Skeleton className="h-10 rounded-md" />
            <Skeleton className="h-10 rounded-md" />
          </View>
        ) : authors.isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void authors.refetch() }]}
            description={toErrorMessage(authors.error)}
            icon="alert-warning"
            size="compact"
            title="Không tải được danh sách"
            tone="danger"
          />
        ) : authors.data.length > 0 ? (
          authors.data.map((author) => (
            <ListItem
              key={author.userId}
              divider
              label={author.name}
              leading={
                <Avatar
                  name={author.name}
                  size="sm"
                  source={author.avatarUrl ? { uri: author.avatarUrl } : undefined}
                />
              }
              selected={selectedId === author.userId}
              trailing={selectedId === author.userId ? CHECK : undefined}
              onPress={() => onSelect(author)}
            />
          ))
        ) : (
          <Text className="py-md text-center text-body-md text-fg-2">Không có người nào khớp.</Text>
        )}
      </View>
    </View>
  );
}
