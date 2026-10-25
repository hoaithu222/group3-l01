import { Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Icon } from '@/shared/ui/icon';
import { hapticSelection } from '@/shared/utils/haptics';
import { cn } from '@/shared/utils/style/cn';

import type { PersonOption } from '../api/conversations.types';

export interface PeoplePickerListProps {
  people: PersonOption[];
  /** Có ⇒ chế độ chọn nhiều (bước 2 `CreateGroupScreen`, checkmark khi đã chọn). Không có ⇒ chạm là chọn ngay (`NewConversationScreen`). */
  selectedIds?: Set<string>;
  onSelect: (person: PersonOption) => void;
}

/**
 * app.md §3 — danh sách người: avatar (chấm xanh khi đang hoạt động), tên, số workspace chung, "Đã có cuộc trò chuyện" nếu đã có DM.
 *
 * Chế độ chọn nhiều: hàng đã chọn phủ nền `bg-primary` (10%) + dấu tick thương hiệu, hàng chưa chọn có dấu "+" `fg-2` — ⛔ không `fg-4`
 * (1.73:1, dấu "+" gần như vô hình nên người dùng không biết hàng bấm được). Đổi lựa chọn rung nhẹ (`hapticSelection`); chế độ chạm-là-mở
 * thì KHÔNG rung — đó là điều hướng, không phải chọn.
 */
export function PeoplePickerList({ people, selectedIds, onSelect }: PeoplePickerListProps) {
  return (
    // ⚠️ TỰ cuộn: cả ba màn dùng (`NewConversationScreen`, `MembersStep`, `AddMembersScreen`) là `Screen scrollable={false}` và đặt danh
    // sách trong một khối `flex-1` — bản `View` trần cũ tràn quá đáy màn là hàng dưới bị CẮT, không cuộn tới được. `handled`: chạm hàng
    // lúc bàn phím của ô tìm đang mở thì chọn luôn, không mất cú chạm đầu để đóng bàn phím.
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-2xs pb-md"
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {people.map((person) => {
        const selected = selectedIds?.has(person.userId) ?? false;
        const sharedLabel =
          person.sharedWorkspaceIds.length > 0
            ? `${person.sharedWorkspaceIds.length} nhóm chung`
            : undefined;

        return (
          <Pressable
            key={person.userId}
            accessibilityLabel={`${person.name}${sharedLabel ? `, ${sharedLabel}` : ''}${person.directConversationId ? ', đã có cuộc trò chuyện' : ''}`}
            accessibilityRole={selectedIds ? 'checkbox' : 'button'}
            accessibilityState={selectedIds ? { checked: selected } : undefined}
            className={cn(
              'flex-row items-center gap-sm px-md py-sm active:opacity-70',
              selected && 'bg-bg-primary',
            )}
            onPress={() => {
              if (selectedIds) hapticSelection();
              onSelect(person);
            }}
          >
            <Avatar
              badge={person.presence === 'ONLINE' ? 'success' : undefined}
              name={person.name}
              size="md"
              source={person.avatarUrl ? { uri: person.avatarUrl } : undefined}
            />
            <View className="flex-1 gap-3xs">
              <Text className="text-label-md font-semibold text-fg-1" numberOfLines={1}>
                {person.name}
              </Text>
              {person.directConversationId ? (
                <View className="flex-row items-center gap-3xs">
                  <Icon color="fg-brand" name="chat-bubble" size={14} />
                  <Text className="text-caption-sm text-fg-2">Đã có cuộc trò chuyện</Text>
                </View>
              ) : sharedLabel ? (
                <Text className="text-caption-sm text-fg-2">{sharedLabel}</Text>
              ) : null}
            </View>
            {selectedIds ? (
              <Icon
                color={selected ? 'fg-brand' : 'fg-2'}
                name={selected ? 'checkmark-circle' : 'add-circle'}
                size={22}
              />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
