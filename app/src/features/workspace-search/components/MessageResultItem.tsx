import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { formatDateTime } from '@/shared/utils/format/date.utils';
import { cn } from '@/shared/utils/style/cn';

import type { MessageHit } from '../api';
import { scopeLabel } from '../utils/result-format';
import { HighlightedSnippet } from './HighlightedSnippet';

export interface MessageResultItemProps {
  hit: MessageHit;
  /** Đang được xem trước ở khung bên phải (máy tính bảng) — nền nhạt + `selected` cho trình đọc màn hình. */
  selected?: boolean;
  onPress: (hit: MessageHit) => void;
}

const UNKNOWN_AUTHOR = 'Thành viên';

/**
 * Một kết quả TIN (app.md p5-04 §3): nơi chứa (khoá nếu riêng tư) · tác giả · thời gian · nhãn "Trong luồng" · snippet có
 * nhấn · dấu tệp đính kèm. Snippet giữ NGUYÊN dấu gốc (BE không bao giờ trả chuỗi chuẩn hoá). `memo`: danh sách kéo nhiều
 * trang, gõ tiếp hay tải thêm không được vẽ lại các hàng đã có.
 */
export const MessageResultItem = memo(function MessageResultItem({
  hit,
  selected = false,
  onPress,
}: MessageResultItemProps) {
  const author = hit.author.name?.trim() || UNKNOWN_AUTHOR;
  const place = scopeLabel(hit.scope);
  const time = formatDateTime(hit.createdAt);

  const spoken = [
    hit.scope.isPrivate ? `${place}, riêng tư` : place,
    author,
    time,
    hit.inThread ? 'trong luồng' : null,
    hit.snippet,
    hit.hasAttachments ? 'có tệp đính kèm' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityHint="Mở tin nhắn"
      accessibilityLabel={spoken}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={cn('flex-row gap-sm px-md py-sm active:opacity-70', selected && 'bg-action-tint')}
      onPress={() => onPress(hit)}
    >
      <Avatar
        name={author}
        size="md"
        source={hit.author.avatarUrl ? { uri: hit.author.avatarUrl } : undefined}
      />

      <View className="flex-1 gap-3xs">
        <View className="flex-row items-center gap-3xs">
          {hit.scope.isPrivate ? (
            <Icon color="fg-2" label="Riêng tư" name="lock" size={14} />
          ) : null}
          <Text className="shrink text-caption-sm font-semibold text-fg-2" numberOfLines={1}>
            {place}
          </Text>
        </View>

        <View className="flex-row items-center gap-2xs">
          <Text className="shrink text-label-md font-semibold text-fg-1" numberOfLines={1}>
            {author}
          </Text>
          <Text className="text-caption-sm text-fg-2">{time}</Text>
          {hit.inThread ? <Badge label="Trong luồng" size="sm" variant="info" /> : null}
        </View>

        <HighlightedSnippet highlights={hit.highlights} snippet={hit.snippet} />

        {hit.hasAttachments ? (
          <View className="flex-row items-center gap-3xs">
            <Icon color="fg-2" name="file-2" size={14} />
            <Text className="text-caption-sm text-fg-2">Có tệp đính kèm</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});
