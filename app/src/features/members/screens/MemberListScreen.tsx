import type { ListRenderItem } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import type { SearchInputHandle } from '@/shared/ui/search';

import type { ListMembersFilter, MemberRoleFilter, MemberRow as MemberRowData, MemberStatusFilter } from '../api';
import { InviteMethodSheet } from '../components/InviteMethodSheet';
import { JoinRequestsEntry } from '../components/JoinRequestsEntry';
import { MemberCardSheet } from '../components/MemberCardSheet';
import { MemberFilterBar } from '../components/MemberFilterBar';
import { MemberListBody } from '../components/MemberListBody';
import { MemberListEmpty } from '../components/MemberListEmpty';
import { MemberRow } from '../components/MemberRow';
import { MemberSectionHeader } from '../components/MemberSectionHeader';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useMemberListItems, type MemberListItem } from '../hooks/useMemberListItems';
import { useMemberRoleCounts } from '../hooks/useMemberRoleCounts';
import { useMemberSocket } from '../hooks/useMemberSocket';
import { useWorkspaceAccess } from '../queries/guests.queries';
import { useMembers } from '../queries/members.queries';
import { useWorkspaceWellbeingIndicators } from '../queries/wellbeing-indicators.queries';

/**
 * Danh sách thành viên (app.md p1-02 §3): tìm (debounce 300ms), lọc vai trò (chip kèm số), tab "Bị chặn", presence, FlashList vô
 * hạn chia nhóm theo vai trò ("CHỦ NHÓM · 1"…, kiểu Discord / Google Classroom "Mọi người"), nhấn → `MemberCardSheet`.
 *
 * ✅ Ô tìm + dải chip ĐỨNG YÊN trên đầu (ngoài vùng cuộn); lối vào "Yêu cầu tham gia" nằm ở đầu DANH SÁCH nên cuộn đi theo — xoay
 * ngang (cao ~360dp) không còn bị ba khối cố định ăn mất gần hết chỗ của danh sách.
 *
 * `permission:revoked` (mất quyền workspace) đã có `useWorkspaceSocket` của
 * p1-01 xử lý ở `[wsId]/_layout.tsx` bọc quanh màn này — không lặp lại ở đây.
 */
export function MemberListScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  useMemberSocket(wsId);

  const searchRef = useRef<SearchInputHandle>(null);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<MemberRoleFilter | undefined>(undefined);
  const [status, setStatus] = useState<MemberStatusFilter>('ACTIVE');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query);
  // p3-04: cách mời + lối vào duyệt theo `myRole`/`canInvite` của BE (chỉ ẩn/hiện, BE mới là hàng rào).
  const { data: access } = useWorkspaceAccess(wsId);
  const counts = useMemberRoleCounts(wsId);

  const filter: ListMembersFilter = useMemo(
    () => ({ q: debouncedQuery || undefined, role, status }),
    [debouncedQuery, role, status],
  );

  const { data, error, fetchNextPage, hasNextPage, isError, isFetchingNextPage, isLoading, isRefetching, isStale, refetch } =
    useMembers(wsId, filter);
  // Màn giữ mounted dưới thẻ thành viên/màn mời: người mới vào (socket chỉ vá dòng ĐANG có) thì quay lại mới thấy.
  useRefetchOnFocus({ isStale, refetch });

  const members = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const items = useMemberListItems({
    complete: !hasNextPage,
    counts,
    grouped: status === 'ACTIVE' && !role,
    members,
    searching: Boolean(debouncedQuery),
  });
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void refetch(),
    refreshing: isRefetching,
  });

  // Nút mời CHỈ hiện khi có ít nhất một cách mời dùng được (OWNER/ADMIN, hoặc MEMBER khi nhóm cho phép mời qua email) — trước đây
  // hiện cho mọi vai trò rồi mở ra tấm chỉ có "Link mời" mà BE trả 403 cho thành viên thường. Chưa biết quyền = ẩn (không chớp).
  const canManage = access?.canManageMembers === true;
  const canInvite = canManage || access?.canInviteByEmail === true;

  // p7-03 (P1) — chấm cam "Cần chú ý": CHỈ OWNER/ADMIN (`canManage`) tải chỉ báo, CHỈ vẽ cho mức MEDIUM/HIGH (LOW = không hiện gì).
  const { data: indicators } = useWorkspaceWellbeingIndicators(wsId, canManage);
  const attentionUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const i of indicators ?? []) if (i.level === 'MEDIUM' || i.level === 'HIGH') set.add(i.userId);
    return set;
  }, [indicators]);

  const openCard = useCallback((member: MemberRowData) => setSelectedUserId(member.userId), []);
  // `renderItem` ỔN ĐỊNH (FlashList chỉ vẽ lại ô khi hàm/dữ liệu đổi) — hàm mới mỗi lượt vẽ là vẽ lại mọi ô đang hiện.
  const renderItem = useCallback<ListRenderItem<MemberListItem>>(
    ({ item }) =>
      item.kind === 'header' ? (
        <MemberSectionHeader count={item.count} role={item.role} />
      ) : (
        <MemberRow attention={attentionUserIds.has(item.member.userId)} member={item.member} onPress={openCard} />
      ),
    [attentionUserIds, openCard],
  );

  function clearSearch(): void {
    // `clear()` của ô uncontrolled KHÔNG gọi `onChangeText` ⇒ tự xoá state đang lọc.
    searchRef.current?.clear();
    setQuery('');
  }

  // ⚠️ Tổng trên AppBar là của CẢ NHÓM (`counts.ALL`) — bản cũ lấy `meta.total` của bộ lọc ĐANG chọn: gõ tìm hay mở tab "Bị chặn" là
  // tiêu đề đổi thành "Thành viên (2)" như thể nhóm chỉ còn hai người.
  const title = counts.ALL ? `Thành viên (${counts.ALL})` : 'Thành viên';

  return (
    <Screen
      header={
        <AppBar
          actions={
            canInvite ? (
              <Button
                accessibilityLabel="Mời thành viên"
                iconLeft="user-add"
                iconOnly
                size="sm"
                variant="tertiary"
                onPress={() => setInviteOpen(true)}
              />
            ) : undefined
          }
          title={title}
          onBack={router.back}
        />
      }
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 gap-sm pt-xs">
        <MemberFilterBar
          canSeeBanned={canManage}
          counts={counts}
          role={role}
          searchRef={searchRef}
          status={status}
          onQueryChange={setQuery}
          onRoleChange={setRole}
          onStatusChange={(next) => {
            setStatus(next);
            setRole(undefined);
          }}
        />

        <View className="flex-1">
          <MemberListBody
            empty={
              <MemberListEmpty
                canInvite={canInvite}
                query={debouncedQuery}
                role={role}
                status={status}
                onClearSearch={clearSearch}
                onInvite={() => setInviteOpen(true)}
                onShowAll={() => setRole(undefined)}
              />
            }
            error={error}
            header={
              <JoinRequestsEntry className="px-md pb-xs" enabled={canManage && access?.joinPolicy === 'APPROVAL'} wsId={wsId} />
            }
            isError={isError}
            isFetchingNextPage={isFetchingNextPage}
            isLoading={isLoading}
            items={items}
            refreshControl={refreshControl}
            renderItem={renderItem}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            onRetry={() => void refetch()}
          />
        </View>
      </View>

      <MemberCardSheet userId={selectedUserId} wsId={wsId} onClose={() => setSelectedUserId(null)} />
      <InviteMethodSheet
        canInviteByEmail={access?.canInviteByEmail === true}
        canManageMembers={access?.canManageMembers === true}
        visible={inviteOpen}
        wsId={wsId}
        onClose={() => setInviteOpen(false)}
      />
    </Screen>
  );
}
