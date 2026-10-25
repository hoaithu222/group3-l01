import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { PinnedItem } from '../api/discovery.types';
import { pinnedExcerpt } from '../utils/pinned-excerpt';

export interface PinnedItemRowProps {
  item: PinnedItem;
  /** Ảnh tác giả tra CÙNG lượt với tên (danh bạ phạm vi có `avatarUrl`); vắng/`null` ⇒ chữ viết tắt của tên. */
  authorAvatarUrl?: string | null;
  /** Tên tác giả tra từ danh bạ phạm vi — `MessageView` chỉ có `authorId`. `undefined` (đã rời/danh bạ chưa tải) → "Thành viên". */
  authorName: string | undefined;
  /** `myPermissions.canPin` của CHÍNH tin này — BE tính theo người xem, không tự đoán từ vai trò. */
  canUnpin: boolean;
  unpinning: boolean;
  onPress: (item: PinnedItem) => void;
  onUnpin: (item: PinnedItem) => void;
}

/** Một dòng tin ghim (app.md p1-09 §3): tác giả · nội dung · "Ghim bởi … lúc …" · nút Bỏ ghim (khi có quyền). */
export const PinnedItemRow = memo(function PinnedItemRow({
  item,
  authorAvatarUrl,
  authorName,
  canUnpin,
  unpinning,
  onPress,
  onUnpin,
}: PinnedItemRowProps) {
  const author = authorName?.trim() || 'Thành viên';
  const excerpt = pinnedExcerpt(item);
  const pinnedBy = item.pinnedByUser?.name?.trim();
  const pinnedLine = `Ghim${pinnedBy ? ` bởi ${pinnedBy}` : ''} · ${formatDateTime(item.pinnedAt)}`;

  return (
    <View className="flex-row items-start gap-sm px-md py-sm">
      <Pressable
        accessibilityHint="Mở tin nhắn"
        accessibilityLabel={`${author}: ${excerpt}. ${pinnedLine}`}
        accessibilityRole="button"
        className="flex-1 flex-row gap-sm active:opacity-70"
        onPress={() => onPress(item)}
      >
        <Avatar name={author} size="md" source={authorAvatarUrl ? { uri: authorAvatarUrl } : undefined} />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-md font-semibold text-fg-1" numberOfLines={1}>
            {author}
          </Text>
          <Text className="text-body-md text-fg-2" numberOfLines={3}>
            {excerpt}
          </Text>
          <Text className="text-caption-sm text-fg-2">{pinnedLine}</Text>
        </View>
      </Pressable>

      {canUnpin ? (
        <Button
          accessibilityLabel="Bỏ ghim tin nhắn"
          label="Bỏ ghim"
          loading={unpinning}
          size="sm"
          variant="tertiary"
          onPress={() => onUnpin(item)}
        />
      ) : null}
    </View>
  );
});
