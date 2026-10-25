import { Pressable, Text, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import type { ReplyPreview, ResolveChatAuthor } from '../../api/chat.types';
import { mentionsToPlainText } from '../../mentions/mention-markup';

export interface ReplyQuoteProps {
  className?: string;
  replyPreview: ReplyPreview;
  resolveAuthor?: ResolveChatAuthor;
  /**
   * `onAction` = nằm trên bong bóng CỦA MÌNH (nền `action-base`) ⇒ vạch, tên, trích đoạn đều `action-fg` — cùng luật `BubbleContent`.
   * ⛔ `fg-brand`/`fg-2` trên nền thương hiệu đậm: tên người được trả lời gần như trùng màu nền, không đọc được.
   */
  tone?: 'default' | 'onAction';
  /** Bấm → cuộn tới tin gốc (app.md §3 "bấm → jump"). */
  onPress?: () => void;
}

/** Tên tác giả + excerpt/"[Ảnh]"; `deleted` → "Tin nhắn đã bị thu hồi" (app.md §3). */
export function ReplyQuote({ className, replyPreview, resolveAuthor, tone = 'default', onPress }: ReplyQuoteProps) {
  const onAction = tone === 'onAction';
  const authorName = (replyPreview.authorId && resolveAuthor?.(replyPreview.authorId)?.name) || 'Thành viên';
  // `excerpt` do BE cắt từ nội dung THÔ nên còn marker nhắc tên; `replyPreview` không mang `mentions[]`, chỉ tra được tên qua `resolveAuthor`.
  const text = replyPreview.deleted
    ? 'Tin nhắn đã bị thu hồi'
    : mentionsToPlainText(replyPreview.excerpt, [], (id) => resolveAuthor?.(id)?.name);

  return (
    <Pressable
      accessibilityLabel={`Trả lời ${authorName}: ${text}`}
      accessibilityRole="button"
      className={cn(
        'mb-3xs flex-row gap-2xs border-l-2 pl-2xs active:opacity-70',
        onAction ? 'border-action-fg' : 'border-border-brand',
        className,
      )}
      onPress={onPress}
    >
      <View className="flex-1">
        <Text className={cn('text-label-xs font-semibold', onAction ? 'text-action-fg' : 'text-fg-brand')} numberOfLines={1}>
          {authorName}
        </Text>
        <Text
          className={cn('text-caption-sm', replyPreview.deleted && 'italic', onAction ? 'text-action-fg' : 'text-fg-2')}
          numberOfLines={1}
        >
          {text}
        </Text>
      </View>
    </Pressable>
  );
}
