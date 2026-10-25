import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Avatar } from '@/shared/ui/avatar';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { SearchInput } from '@/shared/ui/search';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import type { DiscoveryScope, ScopeMember } from '../api/discovery.types';
import { useScopeMembers } from '../queries/search.queries';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

export interface SearchAuthorListProps {
  scope: Pick<DiscoveryScope, 'scopeId' | 'scopeType'>;
  selectedId: string | undefined;
  /** `null` = "Tất cả người gửi" (bỏ lọc). */
  onSelect: (member: ScopeMember | null) => void;
}

/**
 * Chọn người gửi để lọc (app.md p1-09 §7): CHỈ liệt kê người của chính phạm vi đang tìm (thành viên kênh/hội thoại —
 * không có ai ngoài phạm vi đọc được). Ô tìm uncontrolled + debounce (`SearchInput`, luật IME); kênh lọc theo server,
 * hội thoại lọc client (xem `discoveryService.listMembers`).
 */
export function SearchAuthorList({ scope, selectedId, onSelect }: SearchAuthorListProps) {
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q.trim(), 300);
  const members = useScopeMembers(scope, debounced);

  return (
    <View className="gap-sm">
      <SearchInput placeholder="Tìm người gửi" onChangeText={setQ} />

      {/* Hàng nằm trong MỘT `<View>` riêng: `gap-sm` của khối ngoài chỉ để cách ô tìm ↔ danh sách, chèn nó giữa các hàng có kẻ thì kẻ và hàng kế tiếp hở ra 12dp. */}
      <View>
        {/* `emphasis="title"`: tên là TIÊU ĐỀ của hàng chọn (chữ chính) — để mặc định thì cả cột tên là chữ phụ xám. */}
        <ListItem
          divider
          emphasis="title"
          label="Tất cả người gửi"
          leading={<IconTile name="add-team" size="sm" tone="neutral" />}
          selected={selectedId === undefined}
          trailing={
            selectedId === undefined ? (
              <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" size="sm" />
            ) : undefined
          }
          onPress={() => onSelect(null)}
        />

        {members.isLoading ? (
          // Cùng hình hàng người gửi (avatar + tên).
          <View>
            <SkeletonParagraphWithIcon className="py-xs" />
            <SkeletonParagraphWithIcon className="py-xs" />
            <SkeletonParagraphWithIcon className="py-xs" />
          </View>
        ) : members.isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void members.refetch() }]}
            description={toErrorMessage(members.error)}
            icon="alert-warning"
            size="compact"
            title="Không tải được danh sách"
            tone="danger"
          />
        ) : members.data && members.data.length > 0 ? (
          members.data.map((member, index, all) => (
            <ListItem
              key={member.userId}
              divider={index < all.length - 1}
              emphasis="title"
              label={member.name}
              labelNumberOfLines={2}
              leading={
                // Trang trí: tên đã nằm ở nhãn hàng ⇒ ẩn avatar khỏi trình đọc màn hình (không đọc tên hai lần).
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Avatar
                    name={member.name}
                    size="sm"
                    source={member.avatarUrl ? { uri: member.avatarUrl } : undefined}
                  />
                </View>
              }
              selected={selectedId === member.userId}
              trailing={
                selectedId === member.userId ? (
                  <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" size="sm" />
                ) : undefined
              }
              onPress={() => onSelect(member)}
            />
          ))
        ) : (
          <EmptyState
            description="Không có người nào khớp."
            icon="search"
            size="compact"
            tone="neutral"
          />
        )}
      </View>
    </View>
  );
}
