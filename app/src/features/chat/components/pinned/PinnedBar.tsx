import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { ChatScopeRef, ResolveChatAuthor } from '../../api/chat.types';
import { usePinnedMessages } from '../../hooks/usePinnedMessages';
import { pinnedExcerpt } from '../../utils/pinned-excerpt';

export interface PinnedBarProps {
  scope: ChatScopeRef;
  resolveAuthor?: ResolveChatAuthor;
  /** Chạm thanh → nhảy tới tin đang hiện (`ChatRoom.jumpTo`: cuộn + tô nổi, tự tải lô `around` nếu tin cũ). */
  onJump: (messageId: string) => void;
  /** Chạm "N ghim" → màn danh sách "Tin đã ghim" (có nút Bỏ ghim). `chat` không biết route ⇒ màn cha nối. */
  onOpenList: () => void;
}

/**
 * Thanh tin đã ghim ở ĐẦU phòng chat, kiểu Zalo: ô ghim · "Tin nhắn ghim" (kèm `1/N` khi có nhiều) · `Tên: nội dung` một dòng ·
 * "N ghim ›" mở danh sách. Tin MỚI ghim hiện trước; chạm thanh nhảy tới tin đó rồi chuyển sang tin ghim kế (xoay vòng — app.md p1-05 §3),
 * nên chạm liên tục là duyệt hết các tin ghim mà không phải mở danh sách. Không có tin ghim nào (hoặc đã thu hồi hết) ⇒ không vẽ gì,
 * không chiếm chỗ.
 *
 * ⚠️ Ghim/bỏ ghim (của mình hoặc máy khác) cập nhật qua `chatKeys.pins` — xem `usePinnedMessages`. Có tin ghim mới thì thanh về tin đó.
 */
export function PinnedBar({ scope, resolveAuthor, onJump, onOpenList }: PinnedBarProps) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { data } = usePinnedMessages(scope);
  // Tin đã thu hồi không còn là "tin ghim" đáng nhảy tới (BE giữ cờ ghim trên tin thu hồi).
  const pins = useMemo(() => (data ?? []).filter((message) => !message.deleted), [data]);

  const [cursor, setCursor] = useState(0);
  // Có tin ghim MỚI (đầu danh sách đổi) ⇒ về đầu — điều chỉnh state ngay lúc render, không cần effect (react.dev "You Might Not Need an Effect").
  const newestId = pins[0]?.id;
  const [seenNewestId, setSeenNewestId] = useState(newestId);
  if (seenNewestId !== newestId) {
    setSeenNewestId(newestId);
    setCursor(0);
  }

  const index = Math.min(cursor, pins.length - 1);
  const pin = pins[index];
  if (!pin) return null;

  const total = pins.length;
  const author = pin.authorId === currentUserId ? 'Bạn' : ((pin.authorId && resolveAuthor?.(pin.authorId)?.name) || 'Thành viên');
  const excerpt = pinnedExcerpt(pin);
  const title = total > 1 ? `Tin nhắn ghim · ${String(index + 1)}/${String(total)}` : 'Tin nhắn ghim';

  return (
    <View className="flex-row items-center border-b border-divider-1 bg-bg-1 pl-md pr-xs">
      <Pressable
        accessibilityHint="Chạm để xem tin nhắn này trong cuộc trò chuyện"
        accessibilityLabel={`${title}. ${author}: ${excerpt}`}
        accessibilityRole="button"
        className="min-h-11 flex-1 flex-row items-center gap-sm py-xs active:opacity-70"
        onPress={() => {
          onJump(pin.id);
          setCursor((index + 1) % total);
        }}
      >
        <View className="size-3xl items-center justify-center rounded-xs bg-surface-primary">
          <Icon color="fg-brand" name="location" size={18} variant="twotone" />
        </View>
        <View className="flex-1">
          <Text className="text-label-md font-semibold text-fg-1" maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-caption-lg text-fg-2" maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {author}: {excerpt}
          </Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityLabel={`${String(total)} tin nhắn đã ghim, xem danh sách`}
        accessibilityRole="button"
        className="min-h-11 flex-row items-center gap-3xs pl-xs active:opacity-70"
        onPress={onOpenList}
      >
        <Text className="text-label-md font-semibold text-fg-brand" maxFontSizeMultiplier={1.3}>
          {total} ghim
        </Text>
        <Icon color="fg-brand" name="arrow-right-small" size={16} />
      </Pressable>
    </View>
  );
}
