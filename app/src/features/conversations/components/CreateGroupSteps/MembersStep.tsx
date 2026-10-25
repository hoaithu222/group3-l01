import { Text, View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { SearchInput } from '@/shared/ui/search';

import { LIMITS } from '../../conversations.constants';
import type { PersonOption } from '../../api/conversations.types';
import { PeoplePickerList } from '../PeoplePickerList';
import { PersonRowsSkeleton } from '../PersonRowsSkeleton';
import { SelectedChips } from '../SelectedChips';

export interface MembersStepProps {
  isLoading: boolean;
  people: PersonOption[];
  selected: PersonOption[];
  onQueryChange: (q: string) => void;
  onToggle: (person: PersonOption) => void;
}

/** Bước 2 (app.md §3) — tìm trong workspace, chip đã chọn, đếm "x/199" (≤ `membersMax - 1`, chưa tính người tạo). */
export function MembersStep({
  isLoading,
  people,
  selected,
  onQueryChange,
  onToggle,
}: MembersStepProps) {
  const selectedIds = new Set(selected.map((p) => p.userId));

  return (
    <View className="flex-1 gap-sm">
      <View className="gap-2xs px-md">
        <SearchInput
          placeholder="Tìm thành viên trong nhóm làm việc"
          onChangeText={onQueryChange}
        />
        <SelectedChips
          items={selected.map((p) => ({ id: p.userId, name: p.name, avatarUrl: p.avatarUrl }))}
          onRemove={(id) => {
            const person = selected.find((p) => p.userId === id);
            if (person) onToggle(person);
          }}
        />
        {/* Số đã chọn / trần — người dùng biết còn thêm được bao nhiêu trước khi danh sách tự ẩn người mới (chạm trần). */}
        {selected.length > 0 ? (
          <Text className="text-caption-sm text-fg-2">{`Đã chọn ${String(selected.length)}/${String(MEMBERS_MAX)}`}</Text>
        ) : null}
      </View>

      <View className="flex-1">
        {isLoading ? (
          <PersonRowsSkeleton label="Đang tải thành viên nhóm làm việc" />
        ) : people.length === 0 ? (
          <EmptyState
            description="Nhóm làm việc này chưa có thành viên khác."
            icon="user"
            title="Chưa có ai để thêm"
          />
        ) : (
          <PeoplePickerList people={people} selectedIds={selectedIds} onSelect={onToggle} />
        )}
      </View>
    </View>
  );
}

export const MEMBERS_MAX = LIMITS.conversation.membersMax - 1;
