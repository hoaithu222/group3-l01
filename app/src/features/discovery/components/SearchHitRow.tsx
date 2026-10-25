import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { SearchHit } from '../api/discovery.types';
import { attachmentSummaryIcon, attachmentSummaryLabel } from '../utils/attachment-label';
import { HighlightedText } from './HighlightedText';

export interface SearchHitRowProps {
  hit: SearchHit;
  onPress: (hit: SearchHit) => void;
}

const UNKNOWN_AUTHOR = 'Thành viên';

/**
 * Một kết quả tìm (app.md p1-09 §2): tác giả · thời gian · nhãn "Trong luồng" · snippet có highlight · tóm tắt tệp.
 * Snippet giữ NGUYÊN dấu gốc (`normalizedContent` không bao giờ lộ ra UI). `memo`: danh sách kéo nhiều trang, mỗi lần
 * gõ tiếp hoặc tải thêm không được vẽ lại các hàng đã có.
 */
export const SearchHitRow = memo(function SearchHitRow({ hit, onPress }: SearchHitRowProps) {
  const author = hit.author.name?.trim() || UNKNOWN_AUTHOR;
  const time = formatDateTime(hit.createdAt);
  const attachments = attachmentSummaryLabel(hit.attachmentsSummary);

  const spoken = [
    author,
    time,
    hit.inThread ? 'trong luồng' : null,
    hit.snippet,
    attachments ? `kèm ${attachments}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityHint="Mở tin nhắn"
      accessibilityLabel={spoken}
      accessibilityRole="button"
      className="flex-row gap-sm px-md py-sm active:opacity-70"
      onPress={() => onPress(hit)}
    >
      {/* Ảnh người gửi BE đã trả (`author.avatarUrl`) — trước đây chỉ vẽ chữ viết tắt dù có ảnh. */}
      <Avatar
        name={author}
        size="md"
        source={hit.author.avatarUrl ? { uri: hit.author.avatarUrl } : undefined}
      />

      <View className="flex-1 gap-3xs">
        <View className="flex-row items-center gap-2xs">
          <Text className="shrink text-label-md font-semibold text-fg-1" numberOfLines={1}>
            {author}
          </Text>
          <Text className="text-caption-sm text-fg-2">{time}</Text>
          {hit.inThread ? <Badge label="Trong luồng" size="sm" variant="info" /> : null}
        </View>

        <HighlightedText
          className="text-body-md text-fg-2"
          highlights={hit.highlights}
          numberOfLines={3}
          text={hit.snippet}
        />

        {attachments ? (
          <View className="flex-row items-center gap-3xs">
            <Icon color="fg-2" name={attachmentSummaryIcon(hit.attachmentsSummary)} size={14} />
            <Text className="text-caption-sm text-fg-2">{attachments}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});
