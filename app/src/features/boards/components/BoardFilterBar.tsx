import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { SPACING } from '@/shared/theme';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';
import { SearchInput, type SearchInputHandle } from '@/shared/ui/search';
import { SelectSheet, type SelectOption } from '@/shared/ui/select';
import { hapticSelection } from '@/shared/utils/haptics';

import type { BoardFilter, BoardLabel } from '../api/boards.types';
import { useWorkspaceMemberOptions } from '../queries/workspace-access.queries';

type PickerKind = 'assignee' | 'label';

export interface BoardFilterBarProps {
  /** Chip đang bật (không gồm chữ tìm). */
  chips: Pick<BoardFilter, 'assigneeId' | 'labelId' | 'overdue'>;
  labels: readonly BoardLabel[];
  wsId: string;
  onPatch: (partial: Pick<BoardFilter, 'assigneeId' | 'labelId' | 'overdue'>) => void;
  onQuery: (text: string) => void;
  onReset: () => void;
}

/**
 * Thanh lọc của Kanban (`app.md` §2 `BoardFilterBar`): ô tìm + chip "Của tôi",
 * "Người làm", "Nhãn", "Quá hạn".
 *
 * Ô tìm là UNCONTROLLED (`SearchInput` không có `value`) — cùng luật IME-safe:
 * ghi đè nội dung giữa lúc bộ gõ ghép dấu làm mất dấu tiếng Việt trên Android.
 * Debounce 300 ms nằm ở `useBoardFilter`, không ở đây.
 *
 * Danh sách người làm chỉ tải khi mở sheet (`enabled`), tránh gọi
 * `GET /workspaces/:id/members` ở mọi lần mở bảng.
 */
export function BoardFilterBar({ chips, labels, wsId, onPatch, onQuery, onReset }: BoardFilterBarProps) {
  const [picker, setPicker] = useState<PickerKind | null>(null);
  const searchRef = useRef<SearchInputHandle>(null);
  const members = useWorkspaceMemberOptions(wsId, '', picker === 'assignee');

  const isMine = chips.assigneeId === 'me';
  const hasOtherAssignee = Boolean(chips.assigneeId) && !isMine;
  const anyActive = Boolean(chips.assigneeId || chips.labelId || chips.overdue);

  const memberOptions: SelectOption[] = (members.data ?? []).map((member) => ({
    label: member.displayName ?? member.name,
    value: member.userId,
  }));
  const labelOptions: SelectOption[] = labels.map((label) => ({ label: label.name, value: label.id }));
  // Bật/tắt/đổi một bộ lọc = đổi lựa chọn ⇒ nhịp `selection` (chip lẫn chọn trong tấm).
  const patch = (partial: Pick<BoardFilter, 'assigneeId' | 'labelId' | 'overdue'>) => {
    hapticSelection();
    onPatch(partial);
  };

  const clearButton = (key: 'assigneeId' | 'labelId') => (
    <Button
      label="Bỏ lọc"
      variant="secondary"
      onPress={() => {
        onPatch({ [key]: undefined });
        setPicker(null);
      }}
    />
  );

  return (
    <View className="gap-xs pb-xs">
      <View className="px-md">
        <SearchInput ref={searchRef} placeholder="Tìm thẻ theo tiêu đề" onChangeText={onQuery} />
      </View>

      {/* `grow-0`: ScrollView NGANG mặc định `flexGrow: 1` — nằm trong cột có phần tử `flex-1` khác (vùng cột Kanban) thì bị kéo cao, chip trôi giữa màn. */}
      <ScrollView
        className="grow-0"
        contentContainerStyle={{ alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.md }}
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Chip
          label="Của tôi"
          leading={<Icon color="fg-brand" name="user" size="sm" />}
          role="checkbox"
          selected={isMine}
          size="sm"
          onPress={() => patch({ assigneeId: isMine ? undefined : 'me' })}
        />
        <Chip
          label="Người làm"
          leading={<Icon color="fg-brand" name="contact-list" size="sm" />}
          selected={hasOtherAssignee}
          size="sm"
          onPress={() => setPicker('assignee')}
        />
        <Chip
          disabled={labels.length === 0}
          label="Nhãn"
          leading={<Icon color={labels.length === 0 ? 'fg-2' : 'fg-brand'} name="discount" size="sm" />}
          selected={Boolean(chips.labelId)}
          size="sm"
          onPress={() => setPicker('label')}
        />
        <Chip
          label="Quá hạn"
          leading={<Icon color="fg-brand" name="clock" size="sm" />}
          role="checkbox"
          selected={Boolean(chips.overdue)}
          size="sm"
          onPress={() => patch({ overdue: chips.overdue ? undefined : true })}
        />
        {anyActive ? (
          <Button
            iconLeft="clear-circle"
            label="Xoá lọc"
            size="xs"
            variant="tertiary"
            onPress={() => {
              // `reset()` xoá cả chữ tìm ở tầng lọc, nhưng ô tìm là UNCONTROLLED — không xoá tay thì chữ cũ vẫn nằm trong ô trong
              // khi bảng đã bỏ lọc, và phím gõ kế tiếp bật lại đúng bộ lọc vừa xoá.
              searchRef.current?.clear();
              onReset();
            }}
          />
        ) : null}
      </ScrollView>

      <SelectSheet
        emptyMessage={members.isLoading ? 'Đang tải…' : 'Không có thành viên phù hợp.'}
        footer={chips.assigneeId && !isMine ? clearButton('assigneeId') : undefined}
        options={memberOptions}
        searchable
        searchPlaceholder="Tìm thành viên"
        title="Lọc theo người làm"
        value={hasOtherAssignee ? chips.assigneeId : undefined}
        visible={picker === 'assignee'}
        onChange={(userId) => patch({ assigneeId: userId })}
        onClose={() => setPicker(null)}
      />
      <SelectSheet
        footer={chips.labelId ? clearButton('labelId') : undefined}
        options={labelOptions}
        title="Lọc theo nhãn"
        value={chips.labelId}
        visible={picker === 'label'}
        onChange={(labelId) => patch({ labelId })}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}
