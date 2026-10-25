import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';

import type { Mentionable } from '../../api/task-detail.types';

const MAX_ROWS = 5;

export interface MentionSuggestionsProps {
  loading: boolean;
  people: readonly Mentionable[];
  onPick: (person: Mentionable) => void;
}

/**
 * Gợi ý thành viên khi gõ `@` (bản tối thiểu của `MentionPicker` p1-06 — xem `mention-compose.ts`): tối đa 5
 * dòng, mỗi dòng ≥ 44dp. Chọn KHÔNG đóng bàn phím (`keyboardShouldPersistTaps` của nơi bọc lo) để gõ tiếp.
 */
export function MentionSuggestions({ loading, people, onPick }: MentionSuggestionsProps) {
  return (
    <View accessibilityLabel="Gợi ý nhắc tên" className="border-b border-divider-1 bg-bg-1">
      {people.slice(0, MAX_ROWS).map((person) => (
        <Pressable
          key={person.id}
          accessibilityLabel={`Nhắc ${person.name}`}
          accessibilityRole="button"
          className="min-h-[44px] flex-row items-center gap-xs px-md active:opacity-70"
          onPress={() => onPick(person)}
        >
          <Avatar
            name={person.name}
            size="xs"
            source={person.avatarUrl ? { uri: person.avatarUrl } : undefined}
          />
          <Text className="flex-1 text-body-md text-fg-1" numberOfLines={1}>
            {person.name}
          </Text>
        </Pressable>
      ))}
      {people.length === 0 ? (
        <Text className="px-md py-xs text-caption-lg text-fg-2">
          {loading ? 'Đang tìm…' : 'Không có thành viên phù hợp.'}
        </Text>
      ) : null}
    </View>
  );
}
