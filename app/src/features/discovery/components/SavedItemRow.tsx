import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatDateTime, formatRelative } from '@/shared/utils/format/date.utils';

import type { SavedItem } from '../api/discovery.types';
import { attachmentSummaryIcon, attachmentSummaryLabel } from '../utils/attachment-label';
import { savedScopeLabel } from '../utils/pinned-excerpt';

export interface SavedItemRowProps {
  item: SavedItem;
  unsaving: boolean;
  onOpen: (item: SavedItem) => void;
  onUnsave: (item: SavedItem) => void;
}

/**
 * Một mục "Đã lưu" (app.md p1-09 §2/§3). Hai dạng:
 *  · KHẢ DỤNG — người gửi · phạm vi (`#kênh`/nhóm chat/người) · trích đoạn · tệp · thời điểm lưu; chạm → mở tin
 *    (đúng `around`), nút riêng "Bỏ lưu".
 *  · KHÔNG KHẢ DỤNG (thu hồi/mất quyền/bị ẩn/bị xoá — BE chỉ trả `savedAt`+`messageId`): thẻ MỜ "Tin nhắn không còn khả
 *    dụng", KHÔNG bấm mở được, chỉ có "Bỏ lưu". Tuyệt đối không suy đoán/hiện nội dung hay tên phạm vi (DU-03).
 */
export const SavedItemRow = memo(function SavedItemRow({
  item,
  unsaving,
  onOpen,
  onUnsave,
}: SavedItemRowProps) {
  const savedAgo = `Đã lưu ${formatRelative(item.savedAt)}`;

  if (!item.available) {
    return (
      // ⛔ KHÔNG `accessible` ở khối gốc: nó gộp cả cây con thành MỘT ô nên nút "Bỏ lưu" bên trong hết đường lia tới bằng
      // trình đọc màn hình. Nhãn nằm ở khối chữ; nút là ô rời.
      <View className="mx-md my-xs flex-row items-center gap-sm rounded-md bg-bg-3 p-md opacity-70">
        {/* Ô icon trung tính (trang trí — nghĩa nằm ở câu "không còn khả dụng"); icon `fg-3` cũ gần như biến mất trên nền chìm. */}
        <IconTile name="hide" size="sm" tone="neutral" />
        <View
          accessibilityLabel={`Tin nhắn không còn khả dụng. ${savedAgo}`}
          accessible
          className="flex-1 gap-3xs"
        >
          <Text className="text-label-md font-semibold text-fg-2">Tin nhắn không còn khả dụng</Text>
          <Text className="text-caption-sm text-fg-2">{savedAgo}</Text>
        </View>
        <Button
          accessibilityLabel="Bỏ lưu tin nhắn không còn khả dụng"
          label="Bỏ lưu"
          loading={unsaving}
          size="sm"
          variant="secondary"
          onPress={() => onUnsave(item)}
        />
      </View>
    );
  }

  const { message, scope } = item;
  const author = message.authorName?.trim() || 'Thành viên';
  const scopeLabel = savedScopeLabel(scope);
  const attachments = attachmentSummaryLabel(message.attachmentsSummary);

  return (
    <View className="flex-row items-start gap-sm px-md py-sm">
      <Pressable
        accessibilityHint="Mở tin nhắn"
        accessibilityLabel={`${author}, ${scopeLabel}: ${message.excerpt}. ${savedAgo}`}
        accessibilityRole="button"
        className="flex-1 flex-row gap-sm active:opacity-70"
        onPress={() => onOpen(item)}
      >
        {/* Ảnh người gửi khi BE gửi (`authorAvatarUrl` — P0 còn `null`), chữ viết tắt đỡ khi thiếu/lỗi tải. */}
        <Avatar
          name={author}
          size="md"
          source={message.authorAvatarUrl ? { uri: message.authorAvatarUrl } : undefined}
        />
        <View className="flex-1 gap-3xs">
          <View className="flex-row items-center gap-2xs">
            <Text className="shrink text-label-md font-semibold text-fg-1" numberOfLines={1}>
              {author}
            </Text>
            <Text className="text-caption-sm text-fg-2">{formatDateTime(message.createdAt)}</Text>
          </View>
          <Text className="text-caption-sm font-medium text-fg-brand" numberOfLines={1}>
            {scopeLabel}
          </Text>
          <Text className="text-body-md text-fg-2" numberOfLines={2}>
            {message.excerpt}
          </Text>
          {attachments ? (
            <View className="flex-row items-center gap-3xs">
              <Icon
                color="fg-2"
                name={attachmentSummaryIcon(message.attachmentsSummary)}
                size={14}
              />
              <Text className="text-caption-sm text-fg-2">{attachments}</Text>
            </View>
          ) : null}
          <Text className="text-caption-sm text-fg-2">{savedAgo}</Text>
        </View>
      </Pressable>

      <Button
        accessibilityLabel="Bỏ lưu tin nhắn"
        iconLeft="favorite"
        iconOnly
        loading={unsaving}
        size="sm"
        variant="tertiary"
        onPress={() => onUnsave(item)}
      />
    </View>
  );
});
