import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import type { ForwardedFrom, ResolveChatAuthor } from '../../api/chat.types';

export interface ForwardedLabelProps {
  forwardedFrom: ForwardedFrom;
  resolveAuthor?: ResolveChatAuthor;
  /**
   * `onAction` = nằm trên bong bóng CỦA MÌNH (nền `action-base`) ⇒ chữ + icon `action-fg`, cùng luật `BubbleContent`/`VoiceNotePlayer`.
   * ⛔ Để `fg-2`/`fg-3` trên nền đó là chữ xám trên nền thương hiệu đậm — gần như không đọc được.
   */
  tone?: 'default' | 'onAction';
}

/** "↪ Đã chuyển tiếp" (+ "từ Tên" nếu người xem biết `authorId`) — app.md §3. */
export function ForwardedLabel({
  forwardedFrom,
  resolveAuthor,
  tone = 'default',
}: ForwardedLabelProps) {
  const authorName = forwardedFrom.authorId
    ? resolveAuthor?.(forwardedFrom.authorId)?.name
    : undefined;
  const onAction = tone === 'onAction';

  return (
    <View className="mb-3xs flex-row items-center gap-3xs">
      {/* `fg-2` (≥ 3:1) chứ không `fg-3` (2.96:1) trên bong bóng thường — hình phi văn bản vẫn cần đọc được. */}
      <Icon color={onAction ? 'action-fg' : 'fg-2'} name="share-02" size={12} />
      <Text
        className={
          onAction ? 'text-label-xs italic text-action-fg' : 'text-label-xs italic text-fg-2'
        }
      >
        {authorName ? `Đã chuyển tiếp từ ${authorName}` : 'Đã chuyển tiếp'}
      </Text>
    </View>
  );
}
