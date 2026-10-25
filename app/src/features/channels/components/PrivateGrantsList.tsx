import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { hapticSelection, hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { GrantLevel } from '../api';
import { useRevokeGrantExplained } from '../hooks/useRevokeGrantExplained';
import { useAddGrants, useChannelGrants, usePatchGrant } from '../queries/grants.queries';
import { AddGrantSheet } from './AddGrantSheet';
import { GrantRow } from './GrantRow';
import { RoleAccessNoticeDialog } from './RoleAccessNoticeDialog';
import { RoleGrantSection } from './RoleGrantSection';

export interface PrivateGrantsListProps {
  canManage: boolean;
  chId: string;
  wsId: string;
}

/**
 * Kênh PRIVATE: MANAGER thấy danh sách grant + quản lý, MEMBER chỉ xem
 * (app.md §3). Tự thu hồi CHÍNH MÌNH xử lý như mất quyền — toast + điều
 * hướng ra danh sách kênh, cùng câu với `useChannelScope`.
 */
export function PrivateGrantsList({ canManage, chId, wsId }: PrivateGrantsListProps) {
  const { data: grants, error, isError, isLoading, refetch } = useChannelGrants(chId);
  const addGrants = useAddGrants(chId);
  const patchGrant = usePatchGrant(chId);
  const currentUserId = useAuthStore((state) => state.user?.id);
  // p3-04 PR-05: gỡ quyền TRỰC TIẾP mà người đó còn quyền qua VAI TRÒ thì giải thích (hộp thoại ở cuối).
  const revokeGrant = useRevokeGrantExplained(chId, currentUserId);
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  function handleRevoke(userId: string, name: string): void {
    revokeGrant.revoke(userId, name, {
      onError: (mutationError) => showToast('error', toErrorMessage(mutationError)),
      onSuccess: () => {
        if (userId !== currentUserId) return;
        showToast('info', 'Bạn không còn quyền xem kênh này');
        router.replace({ params: { wsId }, pathname: '/workspaces/[wsId]/channels' });
      },
    });
  }

  const rows = grants?.users ?? [];

  return (
    <Screen header={<AppBar title="Thành viên" onBack={router.back} />}>
      <View className="gap-md py-xs">
        {isLoading ? (
          // Cùng hình `GrantRow` (avatar + tên + nguồn quyền).
          <View>
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonParagraphWithIcon key={index} className="py-sm" />
            ))}
          </View>
        ) : isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void refetch() }]}
            description={toErrorMessage(error)}
            icon="alert-warning"
            title="Không tải được"
            tone="danger"
          />
        ) : (
          <>
            {canManage ? <Button label="Thêm thành viên" variant="secondary" onPress={() => setAddSheetOpen(true)} /> : null}
            {canManage ? <RoleGrantSection chId={chId} roles={grants?.roles ?? []} wsId={wsId} /> : null}

            {rows.length === 0 ? (
              <EmptyState
                description="Chỉ có bạn trong kênh này."
                icon="user"
                title="Chỉ có bạn"
                tone="info"
              />
            ) : (
              // `-mx-md`: `Screen` (padded) đã cho lề 16 mà `GrantRow` tự có `px-md` ⇒ hàng thụt 32dp; kéo ra hết bề ngang.
              <View className="-mx-md gap-3xs">
                {rows.map((grant) => (
                  <GrantRow
                    key={grant.userId}
                    canManage={canManage}
                    grant={grant}
                    loading={patchGrant.isPending || revokeGrant.isPending}
                    onChangeLevel={(level: GrantLevel) => {
                      if (level !== grant.level) hapticSelection(); // đổi cấp = đổi lựa chọn trong nhóm chip
                      patchGrant.mutate(
                        { payload: { level }, userId: grant.userId },
                        { onError: (mutationError) => showToast('error', toErrorMessage(mutationError)) },
                      );
                    }}
                    onRevoke={() => handleRevoke(grant.userId, grant.name)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </View>

      <AddGrantSheet
        existingUserIds={rows.map((grant) => grant.userId)}
        loading={addGrants.isPending}
        visible={addSheetOpen}
        wsId={wsId}
        onAdd={(userIds, level) =>
          addGrants.mutate(
            { level, userIds },
            {
              onError: (mutationError) => showToast('error', toErrorMessage(mutationError)),
              onSuccess: () => {
                hapticSuccess(); // đã cấp quyền — danh sách tự cập nhật ngay dưới tấm vừa đóng
                setAddSheetOpen(false);
              },
            },
          )
        }
        onClose={() => setAddSheetOpen(false)}
      />

      <RoleAccessNoticeDialog notice={revokeGrant.notice} onClose={revokeGrant.dismissNotice} />
    </Screen>
  );
}
