import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { formatRelative, formatRelativeShort } from '@/shared/utils/format/date.utils';
import { cn } from '@/shared/utils/style/cn';

import type { ConversationListItem } from '../api/conversations.types';
import { conversationTitle } from '../utils/conversation-title';
import { lastMessagePreview } from '../utils/last-message-preview';
import { ConversationAvatar } from './ConversationAvatar';

export interface ConversationRowProps {
  /**
   * Hội thoại đang mở ở khung phải (máy tính bảng): thân thẻ tô nhạt màu thương hiệu, trình đọc màn hình đọc "đã chọn"; khung
   * thẻ đổi viền thương hiệu (`ConversationCard`).
   */
  active?: boolean;
  className?: string;
  currentUserId: string | undefined;
  item: ConversationListItem;
  /**
   * "Bây giờ" lấy từ STATE (`useNow` ở màn danh sách) để cột giờ tự nhảy "Vừa xong" → "1 phút"… Bỏ trống thì đọc lúc vẽ —
   * React Compiler ghi nhớ kết quả theo `createdAt`, nên nhãn đứng im tới lần dữ liệu của hàng đổi.
   */
  now?: number;
  onPress: (item: ConversationListItem) => void;
  onLongPress?: (item: ConversationListItem) => void;
}

function statusLabel(item: ConversationListItem): string | null {
  if (item.status === 'DISSOLVED') return 'Đã giải tán';
  if (item.readOnly) return 'Chỉ đọc';
  return null;
}

function buildAccessibilityLabel(
  item: ConversationListItem,
  preview: string,
  time: string,
): string {
  const title = conversationTitle(item);
  const parts = [title];
  if (item.unreadCount > 0) parts.push(`${item.unreadCount} tin chưa đọc`);
  if (item.hasMention) parts.push('có nhắc đến bạn');
  if (item.muted) parts.push('đã tắt thông báo');
  if (item.pinnedAt) parts.push('đã ghim');
  const status = statusLabel(item);
  if (status) parts.push(status);
  parts.push(`tin cuối: ${preview || 'chưa có tin nhắn'}`);
  if (time) parts.push(time);
  return parts.join(', ');
}

/**
 * Nền THÂN thẻ: thường ⇒ trắng; chưa đọc / đang mở ⇒ nhạt màu thương hiệu (nổi lên giữa các thẻ trắng); đang bấm ⇒ đậm thêm MỘT
 * bậc so với lúc nghỉ. ⛔ Luôn là màu ĐẶC: nút vuốt (`ConversationSwipeActions`) nằm NGAY SAU thân thẻ — nền có độ trong
 * (`bg-bg-primary`…) là màu vàng/tím của nút vuốt ánh xuyên lên thẻ. ⛔ Chuỗi TĨNH — NativeWind chỉ sinh class thấy nguyên văn.
 */
function surfaceClass(highlighted: boolean, pressed: boolean): string {
  if (highlighted) return pressed ? 'bg-action-tint-strong' : 'bg-surface-primary';
  return pressed ? 'bg-action-tint' : 'bg-bg-1';
}

/**
 * THÂN thẻ của một hội thoại (app.md §3) — khung thẻ (bo góc, viền, khe giữa hai thẻ) ở `ConversationCard`. Chốt P0 KHÔNG có
 * "đang nhập…" ở danh sách ("chốt P0 không typing preview ở danh sách", P1 mới thêm event nhẹ).
 *
 * Thứ bậc chữ: tên 16 > xem trước 14 > giờ 12. Chưa đọc KHÔNG chỉ báo bằng màu: tên đậm hẳn lên, xem trước sang chữ chính,
 * cộng huy hiệu số — người không phân biệt màu vẫn nhận ra qua độ đậm và con số; nền nhạt + giờ màu thương hiệu chỉ là lớp thêm.
 * 🔕 đứng cạnh tên (đọc liền với tên), 📌 + huy hiệu ở cuối dòng xem trước. Đã tắt tiếng thì huy hiệu XÁM và KHÔNG tô nền/giờ:
 * vẫn báo có tin, nhưng không giục như hội thoại thường.
 */
export function ConversationRow({
  active = false,
  className,
  currentUserId,
  item,
  now,
  onLongPress,
  onPress,
}: ConversationRowProps) {
  const title = conversationTitle(item);
  const preview = lastMessagePreview(item.lastMessage, currentUserId);
  const createdAt = item.lastMessage?.createdAt;
  // Mắt đọc bản GỌN ("15 phút") cho vừa cột phải; trình đọc màn hình đọc bản ĐỦ ("15 phút trước").
  const time = createdAt ? formatRelativeShort(createdAt, now) : '';
  const spokenTime = createdAt ? formatRelative(createdAt) : '';
  const isUnread = item.markedUnread || item.unreadCount > 0;
  // Tắt tiếng = người dùng đã nói "đừng giục tôi" ⇒ vẫn đậm tên + huy hiệu, nhưng không tô nền và không tô giờ.
  const wantsAttention = isUnread && !item.muted;
  const status = statusLabel(item);
  const badgeVariant = item.muted ? 'neutral' : undefined;

  return (
    <Pressable
      accessible={false}
      className={className}
      onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      onPress={() => onPress(item)}
    >
      {({ pressed }) => (
        <View
          accessibilityLabel={buildAccessibilityLabel(item, preview, spokenTime)}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          accessible
          // Luôn có nền ĐẶC nên view native có sẵn từ lần vẽ đầu — không dính bẫy "Android làm vuông góc" khi đổi nền lúc bấm.
          className={cn(
            'flex-row items-center gap-sm p-sm',
            surfaceClass(active || wantsAttention, pressed),
          )}
        >
          <ConversationAvatar item={item} size="lg" />

          {/* Không `gap`: dòng tên 24 + dòng xem trước 24 = 48 = đúng avatar ⇒ thẻ cao đúng bằng khung xương lúc tải. */}
          <View className="flex-1">
            <View className="flex-row items-center gap-2xs">
              <Text
                className={cn(
                  'flex-1 text-label-lg text-fg-1',
                  isUnread ? 'font-bold' : 'font-medium',
                )}
                numberOfLines={1}
              >
                {title}
              </Text>
              {item.muted ? <Icon color="fg-2" name="noti-off" size={14} /> : null}
              <Text
                className={cn(
                  'text-caption-sm',
                  wantsAttention ? 'font-semibold text-fg-brand' : 'text-fg-2',
                )}
              >
                {time}
              </Text>
            </View>

            {/* `min-h-6` = đúng chiều cao huy hiệu số (24dp): thẻ có/không có tin chưa đọc cao BẰNG nhau — đọc xong một hội thoại
                thì thẻ không co lại 4dp làm cả danh sách bên dưới giật lên. */}
            <View className="min-h-6 flex-row items-center gap-2xs">
              {item.hasMention ? (
                <Text className="text-body-md font-semibold text-fg-brand">@</Text>
              ) : null}
              <Text
                className={cn(
                  'flex-1 text-body-md',
                  isUnread ? 'font-medium text-fg-1' : 'text-fg-2',
                )}
                numberOfLines={1}
              >
                {status ?? (preview || 'Chưa có tin nhắn')}
              </Text>
              {item.pinnedAt ? <Icon color="fg-2" name="favorite" size={14} /> : null}
              {item.unreadCount > 0 ? (
                <Badge
                  accessibilityLabel={`${item.unreadCount} tin chưa đọc`}
                  count={item.unreadCount}
                  variant={badgeVariant}
                />
              ) : item.markedUnread ? (
                <Badge accessibilityLabel="Đã đánh dấu chưa đọc" dot variant={badgeVariant} />
              ) : null}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}
