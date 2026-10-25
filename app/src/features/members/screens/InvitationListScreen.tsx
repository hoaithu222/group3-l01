import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useConnectionState } from '@/core/socket';
import { hapticSelection, hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs, type TabItemData } from '@/shared/ui/tab';

import { INVITATION_ERROR, type InvitationDto } from '../api';
import { InvitationRow } from '../components/InvitationRow';
import { useInvitationTab, type InvitationTab } from '../hooks/useInvitationTab';
import { useResendInvitation, useRevokeInvitation } from '../queries/invitations.queries';
import { readErrorInfo } from '../utils/error-info';

const TABS: TabItemData[] = [
  { key: 'PENDING', label: 'Đang chờ' },
  { key: 'ACCEPTED', label: 'Đã nhận' },
  // Ngắn để vừa ba tab trên máy 360dp ("Thu hồi / hết hạn" bị cắt thành "Thu hồi / hết…"); EMPTY_TEXT bên dưới vẫn nói rõ "thu hồi hoặc hết hạn".
  { key: 'ENDED', label: 'Hết hiệu lực' },
];

const EMPTY_TEXT: Record<InvitationTab, string> = {
  PENDING: 'Chưa có lời mời nào đang chờ.',
  ACCEPTED: 'Chưa có lời mời nào được nhận.',
  ENDED: 'Chưa có lời mời nào bị thu hồi hoặc hết hạn.',
};

/**
 * Danh sách lời mời email đã gửi (OWNER/ADMIN — BE trả 403/404 cho người khác).
 * Email hiện ĐẦY ĐỦ (người mời thấy, app.md p3-04 §7). Gửi lại có cooldown 12
 * giờ ở BE; thu hồi đi qua hộp thoại xác nhận vì liên kết trong email chết ngay.
 */
export function InvitationListScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const isOffline = useConnectionState() === 'offline';
  const [tab, setTab] = useState<InvitationTab>('PENDING');
  const [revokeTarget, setRevokeTarget] = useState<InvitationDto | null>(null);

  const list = useInvitationTab(wsId, tab);
  const resend = useResendInvitation(wsId);
  const revoke = useRevokeInvitation(wsId);

  function handleResend(invitation: InvitationDto): void {
    resend.mutate(invitation.id, {
      onSuccess: () => {
        hapticSuccess();
        showToast('success', `Đã gửi lại lời mời tới ${invitation.email}.`);
      },
      onError: (error) =>
        showToast(
          'error',
          readErrorInfo(error).code === INVITATION_ERROR.RATE_LIMITED
            ? 'Lời mời này vừa được gửi lại — hãy thử lại sau ít giờ.'
            : toErrorMessage(error),
        ),
    });
  }

  function confirmRevoke(): void {
    if (!revokeTarget) return;
    revoke.mutate(revokeTarget.id, {
      onSuccess: () => showToast('success', 'Đã thu hồi lời mời.'),
      // 409: lời mời đã không còn ở trạng thái chờ — danh sách được tải lại (hook), không phải lỗi của người dùng.
      onError: (error) =>
        showToast('error', readErrorInfo(error).status === 409 ? 'Lời mời này đã được xử lý.' : toErrorMessage(error)),
      onSettled: () => setRevokeTarget(null),
    });
  }

  const busyId = resend.isPending ? resend.variables : revoke.isPending ? revoke.variables : undefined;

  return (
    <Screen
      header={
        <AppBar
          actions={
            <Button
              accessibilityLabel="Mời qua email"
              iconLeft="user-add"
              iconOnly
              size="sm"
              variant="tertiary"
              onPress={() => router.push({ pathname: '/workspaces/[wsId]/members/invite-email', params: { wsId } })}
            />
          }
          title="Lời mời đã gửi"
          onBack={router.back}
        />
      }
      refreshing={list.isRefetching}
      onRefresh={list.refetch}
    >
      <View className="gap-md py-xs">
        <Tabs
          items={TABS}
          value={tab}
          onChange={(key) => {
            hapticSelection();
            setTab(key as InvitationTab);
          }}
        />

        {list.isLoading ? (
          <View className="gap-sm">
            <Skeleton className="h-20 rounded-md" />
            <Skeleton className="h-20 rounded-md" />
          </View>
        ) : list.isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: list.refetch }]}
            description={toErrorMessage(list.error)}
            icon="alert-warning"
            title="Không tải được danh sách lời mời"
            tone="danger"
          />
        ) : list.items.length === 0 ? (
          <EmptyState
            description={EMPTY_TEXT[tab]}
            icon="email"
            title="Chưa gửi lời mời nào"
            tone="info"
          />
        ) : (
          <View>
            {/* `-mx-md`: hàng đã tự có `px-md` + kẻ `border-b` chạy hết bề ngang; `Screen` (padded) cộng thêm 16 nữa
                là chữ thụt vào 32dp. Kéo hàng ra tới mép để lề còn đúng 16. */}
            <View className="-mx-md">
              {list.items.map((invitation) => (
                <InvitationRow
                  key={invitation.id}
                  busy={isOffline || busyId === invitation.id}
                  invitation={invitation}
                  onResend={handleResend}
                  onRevoke={setRevokeTarget}
                />
              ))}
            </View>
            {list.hasNextPage ? (
              <Button label="Tải thêm" loading={list.isFetchingNextPage} variant="tertiary" onPress={list.fetchNextPage} />
            ) : null}
          </View>
        )}
      </View>

      <Dialog
        description={`Liên kết trong email gửi tới ${revokeTarget?.email ?? ''} sẽ không còn dùng được.`}
        dismissOnBackdrop={!revoke.isPending}
        primaryAction={{ label: 'Thu hồi', loading: revoke.isPending, onPress: confirmRevoke }}
        secondaryAction={{ label: 'Giữ lại', onPress: () => setRevokeTarget(null) }}
        title="Thu hồi lời mời?"
        variant="warning"
        visible={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
      />
    </Screen>
  );
}
