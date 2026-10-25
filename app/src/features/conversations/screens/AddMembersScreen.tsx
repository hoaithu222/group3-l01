import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SearchInput } from '@/shared/ui/search';
import { hapticSuccess, hapticWarning } from '@/shared/utils/haptics';

import type { AddMemberSkipReason, PersonOption } from '../api/conversations.types';
import { PeoplePickerList } from '../components/PeoplePickerList';
import { PersonRowsSkeleton } from '../components/PersonRowsSkeleton';
import { SelectedChips } from '../components/SelectedChips';
import { useConversationDetail } from '../hooks/useConversationDetail';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useMemberActions } from '../hooks/useMemberActions';
import { usePeopleSearch } from '../hooks/usePeopleSearch';

const SKIP_REASON_LABEL: Record<AddMemberSkipReason, string> = {
  ALREADY_MEMBER: 'đã là thành viên',
  NOT_WORKSPACE_MEMBER: 'không còn trong nhóm làm việc',
  // ⛔ TRUNG TÍNH (p1-08 README §2, cùng câu `BLOCK_003`): `BLOCKED` chỉ tới người THÊM khi đối phương đã chặn họ — nói
  // "đã chặn" là tiết lộ họ đang bị chặn. Không được viết lại thành "bị chặn"/"đã chặn bạn".
  BLOCKED: 'không thể thêm người này',
};
const ADD_BATCH_MAX = 50;

/** app.md §3 — tìm trong workspace của nhóm, chọn ≤ 50/lần, vai trò (OWNER mới thấy ADMIN), kết quả `skipped` hiện lý do. */
export function AddMembersScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const conversation = useConversationDetail(conversationId);
  const actions = useMemberActions(conversationId);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query).trim();
  const [selected, setSelected] = useState<PersonOption[]>([]);
  const [role, setRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');

  const people = usePeopleSearch(debouncedQuery, conversation.data?.workspaceId ?? undefined);
  const canPickAdmin = conversation.data?.myRole === 'OWNER';

  function toggle(person: PersonOption): void {
    setSelected((prev) =>
      prev.some((p) => p.userId === person.userId) ? prev.filter((p) => p.userId !== person.userId) : [...prev, person].slice(0, ADD_BATCH_MAX),
    );
  }

  function submit(): void {
    actions.addMembers.mutate(
      { userIds: selected.map((p) => p.userId), role },
      // Chỉ tự quay lại khi KHÔNG có ai bị bỏ qua — có `skipped` thì ở lại màn
      // để người dùng đọc lý do (app.md §3 "kết quả skipped hiện lý do"),
      // quay lại ngay sẽ làm mất thông tin đó trước khi kịp đọc.
      // Rung: thêm trọn ⇒ `success`; có người bị bỏ qua ⇒ `warning` (cần đọc khối cảnh báo bên dưới).
      {
        onSuccess: (result) => {
          if (result.skipped.length === 0) {
            hapticSuccess();
            router.back();
            return;
          }
          hapticWarning();
          setSelected([]);
        },
      },
    );
  }

  const skipped = actions.addMembers.data?.skipped ?? [];

  return (
    <Screen
      footer={
        <BottomActionBar>
          <Button
            disabled={selected.length === 0}
            fullWidth
            label={`Thêm ${String(selected.length)} người`}
            loading={actions.addMembers.isPending}
            onPress={submit}
          />
        </BottomActionBar>
      }
      header={<AppBar title="Thêm thành viên" onBack={router.back} />}
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 gap-sm py-xs">
        <View className="gap-2xs px-md">
          <SearchInput placeholder="Tìm trong nhóm làm việc" onChangeText={setQuery} />
          <SelectedChips
            items={selected.map((p) => ({ id: p.userId, name: p.name, avatarUrl: p.avatarUrl }))}
            onRemove={(id) => setSelected((prev) => prev.filter((p) => p.userId !== id))}
          />
          {canPickAdmin ? (
            <View className="flex-row gap-xs">
              <Chip label="Thành viên" role="radio" selected={role === 'MEMBER'} onPress={() => setRole('MEMBER')} />
              <Chip label="Quản trị viên" role="radio" selected={role === 'ADMIN'} onPress={() => setRole('ADMIN')} />
            </View>
          ) : null}
        </View>

        <View className="flex-1">
          {people.isLoading ? (
            <PersonRowsSkeleton label="Đang tìm người trong nhóm làm việc" />
          ) : people.isError ? (
            <EmptyState
              actions={[{ label: 'Thử lại', onPress: () => void people.refetch() }]}
              description={toErrorMessage(people.error)}
              icon="alert-warning"
              title="Không tải được"
              tone="danger"
            />
          ) : (
            <PeoplePickerList people={people.data ?? []} selectedIds={new Set(selected.map((p) => p.userId))} onSelect={toggle} />
          )}
        </View>

        {/* `Alert` cảnh báo (icon + tông) thay cho hai dòng chữ xám lạc cuối màn: người dùng phải THẤY có người chưa được thêm. Tên tra từ
            kết quả tìm đang hiện (không gọi thêm API); không tra được thì chỉ nêu lý do. */}
        {skipped.length > 0 ? (
          <View className="px-md">
            <Alert
              description={
                <View className="gap-3xs">
                  {skipped.map((item) => {
                    const name = people.data?.find((p) => p.userId === item.userId)?.name;
                    return (
                      <Text key={item.userId} className="text-body-md text-fg-1">
                        {name ? `${name}: ${SKIP_REASON_LABEL[item.reason]}` : SKIP_REASON_LABEL[item.reason]}
                      </Text>
                    );
                  })}
                </View>
              }
              title={`Không thêm được ${String(skipped.length)} người`}
              tone="warning"
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
