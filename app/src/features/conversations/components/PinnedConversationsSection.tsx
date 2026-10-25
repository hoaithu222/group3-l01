import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import type { ConversationListItem } from '../api/conversations.types';
import { ConversationCard } from './ConversationCard';

export interface PinnedConversationsSectionProps {
  /** Hội thoại đang mở ở khung phải (máy tính bảng) — thẻ của nó được đánh dấu. */
  activeId: string | null;
  currentUserId: string | undefined;
  expanded: boolean;
  items: ConversationListItem[];
  /** "Bây giờ" từ state của màn danh sách — để cột giờ của thẻ ghim nhảy phút cùng nhịp với thẻ thường. */
  now?: number;
  onOpen: (item: ConversationListItem) => void;
  onToggle: () => void;
}

/**
 * Khối "Đã ghim (n)" ở đầu danh sách hội thoại — thu gọn/mở rộng được (≤ 20 thẻ, be.md §5.6). Nằm TRONG vùng cuộn của
 * danh sách (`ListHeaderComponent`), không phải dải cố định phía trên: 20 thẻ ghim mà cố định thì chiếm trọn màn.
 * Thẻ dùng CHUNG `ConversationCard` với danh sách chính (khe 8 nằm sẵn trong thẻ) — ⛔ đừng thêm `gap` ở khối này: khe giữa hai
 * thẻ ghim sẽ thành 12 trong khi bên dưới là 8.
 *
 * Icon `fg-2` chứ không `fg-3`: hình phi văn bản cần ≥ 3:1, `fg-3` trên nền màn chỉ ~2.7:1 — mũi tên thu gọn gần như vô hình.
 */
export function PinnedConversationsSection({
  activeId,
  currentUserId,
  expanded,
  items,
  now,
  onOpen,
  onToggle,
}: PinnedConversationsSectionProps) {
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="min-h-11 flex-row items-center gap-2xs px-md active:opacity-70"
        onPress={onToggle}
      >
        <Icon color="fg-2" name="favorite" size={14} />
        <Text className="flex-1 text-caption-sm font-medium text-fg-2">
          Đã ghim ({items.length})
        </Text>
        <Icon color="fg-2" name={expanded ? 'arrow-up-small' : 'arrow-down-small'} size={16} />
      </Pressable>
      {expanded
        ? items.map((item) => (
            <ConversationCard
              key={item.id}
              active={item.id === activeId}
              currentUserId={currentUserId}
              item={item}
              now={now}
              onPress={onOpen}
            />
          ))
        : null}
    </View>
  );
}
