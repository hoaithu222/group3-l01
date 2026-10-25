import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { SearchInput } from '@/shared/ui/search';
import { matchesSearch } from '@/shared/utils/format/string.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { MemberListItem } from '../api/conversations.types';
import { MemberActionSheet } from '../components/MemberActionSheet';
import { MemberConfirmSheet, type MemberConfirm } from '../components/MemberConfirmSheet';
import { MemberRow } from '../components/MemberRow';
import { PersonRowsSkeleton } from '../components/PersonRowsSkeleton';
import { useConversationDetail } from '../hooks/useConversationDetail';
import { useGroupMembers } from '../hooks/useGroupMembers';
import { useMemberActions } from '../hooks/useMemberActions';

/** app.md §3 — tìm (lọc client, be.md §3 không có `q`), nhóm OWNER→ADMIN→tên (server đã sắp), chạm → `MemberActionSheet`. */
export function GroupMembersScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const conversation = useConversationDetail(conversationId);
  const members = useGroupMembers(conversationId);
  const actions = useMemberActions(conversationId);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MemberListItem | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [confirm, setConfirm] = useState<MemberConfirm | null>(null);

  const items = useMemo(() => {
    const all = members.data?.pages.flatMap((page) => page.data) ?? [];
    return query.trim() ? all.filter((m) => matchesSearch(query, m.name)) : all;
  }, [members.data, query]);
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void members.refetch(),
    refreshing: members.isRefetching && !members.isFetchingNextPage,
  });
  const memberCount = conversation.data?.memberCount;
  const countLabel =
    members.isLoading || members.isError
      ? null
      : query.trim()
        ? `${String(items.length)} kết quả`
        : memberCount !== undefined
          ? `${String(memberCount)} thành viên`
          : null;

  return (
    <Screen header={<AppBar title="Thành viên" onBack={router.back} />} padded={false} scrollable={false}>
      <View className="flex-1 gap-sm py-xs">
        <View className="gap-xs px-md">
          <SearchInput placeholder="Tìm thành viên" onChangeText={setQuery} />
          {/* Số đếm cho biết danh sách dài tới đâu trước khi cuộn — đang lọc thì đếm KẾT QUẢ, không đếm cả nhóm. */}
          {countLabel ? <Text className="text-caption-sm text-fg-2">{countLabel}</Text> : null}
        </View>

        <View className="flex-1">
          {members.isLoading ? (
            <PersonRowsSkeleton label="Đang tải danh sách thành viên" rows={8} />
          ) : members.isError ? (
            <EmptyState
              actions={[{ label: 'Thử lại', onPress: () => void members.refetch() }]}
              description={toErrorMessage(members.error)}
              icon="alert-warning"
              title="Không tải được"
              tone="danger"
            />
          ) : items.length === 0 ? (
            <EmptyState
              description={query ? 'Không tìm thấy thành viên nào khớp.' : 'Chỉ có bạn trong nhóm.'}
              icon={query ? 'search' : 'user'}
              title={query ? 'Không có kết quả' : 'Chưa có ai khác'}
              tone={query ? 'neutral' : 'brand'}
            />
          ) : (
            <FlashList<MemberListItem>
              contentContainerStyle={{ paddingBottom: 16 }}
              data={items}
              keyExtractor={(item) => item.userId}
              refreshControl={refreshControl}
              renderItem={({ item }) => (
                <MemberRow
                  isMe={item.userId === currentUserId}
                  member={item}
                  onPress={(m) => {
                    setSelected(m);
                    setSheetVisible(true);
                  }}
                />
              )}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              onEndReached={() => {
                if (members.hasNextPage && !members.isFetchingNextPage) void members.fetchNextPage();
              }}
              onEndReachedThreshold={0.4}
            />
          )}
        </View>
      </View>

      <MemberActionSheet
        member={selected}
        myPermissions={conversation.data?.myPermissions ?? {
          canSend: false, canCall: false, canRename: false, canAddMembers: false, canRemoveMembers: false,
          canChangeRoles: false, canTransfer: false, canLeave: false, canDissolve: false, canPin: false, canMentionAll: false,
        }}
        myRole={conversation.data?.myRole ?? 'MEMBER'}
        myUserId={currentUserId}
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onMessage={(userId) => router.push({ pathname: '/messages/new', params: { userId } })}
        // Xoá thành viên / chuyển quyền chủ nhóm KHÔNG chạy ngay: đóng menu rồi hỏi lại (`MemberConfirmSheet`).
        onRemove={(m) => {
          setSheetVisible(false);
          setConfirm({ kind: 'remove', member: m });
        }}
        onToggleAdmin={(m) => {
          actions.changeRole.mutate({ userId: m.userId, role: m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN' });
          setSheetVisible(false);
        }}
        onTransfer={(m) => {
          setSheetVisible(false);
          setConfirm({ kind: 'transfer', member: m });
        }}
      />

      <MemberConfirmSheet
        confirm={confirm}
        loading={actions.removeMember.isPending || actions.transferOwner.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={({ kind, member }) => {
          const done = { onSettled: () => setConfirm(null) };
          if (kind === 'remove') actions.removeMember.mutate(member.userId, done);
          else actions.transferOwner.mutate(member.userId, done);
        }}
      />
    </Screen>
  );
}
