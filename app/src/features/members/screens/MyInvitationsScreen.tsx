import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useConnectionState } from '@/core/socket';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { hapticSuccess } from '@/shared/utils/haptics';

import type { MyInvitationDto } from '../api';
import { MyInvitationRow } from '../components/MyInvitationRow';
import { useAcceptMyInvitation, useMyInvitations } from '../queries/invitations.queries';
import { classifyAcceptError } from '../utils/invitation-errors';

/** Câu hiện NGAY DƯỚI dòng lời mời theo loại lỗi (mỗi loại một hướng xử lý — xem `classifyAcceptError`). */
function failureText(error: unknown): string {
  const failure = classifyAcceptError(error);
  switch (failure.kind) {
    case 'EMAIL_MISMATCH':
    case 'EMAIL_NOT_VERIFIED':
      return 'Hãy xác minh email của tài khoản này rồi thử lại.';
    case 'EXPIRED':
      return 'Lời mời đã hết hạn hoặc đã bị thu hồi — hãy xin lời mời mới.';
    case 'NOT_FOUND':
      return 'Lời mời không còn khả dụng.';
    case 'BLOCKED':
      return 'Bạn không thể tham gia nhóm này.';
    default:
      return failure.message;
  }
}

/**
 * "Lời mời của tôi" (app.md p3-04 §13.3 — `GET /me/invitations` + `POST /me/invitations/:id/accept`):
 * lời mời email gửi tới CHÍNH email đã xác minh của tài khoản, chấp nhận KHÔNG cần mở lại thư/link. Token
 * không đi qua đây (BE không trả). Kết quả chấp nhận điều hướng như `AcceptInvitationScreen`: `PENDING`
 * (nhóm duyệt thành viên mới) → màn chờ duyệt, còn lại → thẳng vào nhóm.
 */
export function MyInvitationsScreen() {
  const { data, error, isError, isLoading, isRefetching, refetch } = useMyInvitations();
  const accept = useAcceptMyInvitation();
  const isOffline = useConnectionState() === 'offline';
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  function handleAccept(invitation: MyInvitationDto): void {
    setFailures((current) => ({ ...current, [invitation.id]: '' }));
    setAcceptingId(invitation.id);
    accept.mutate(invitation.id, {
      onSuccess: (result) => {
        hapticSuccess(); // đã vào nhóm (hoặc đã gửi yêu cầu) — rung báo xong trước lượt chuyển màn
        router.replace(
          result.membership.status === 'PENDING'
            ? { params: { wsId: result.workspaceId }, pathname: '/workspaces/pending' }
            : { params: { wsId: result.workspaceId }, pathname: '/workspaces/[wsId]' },
        );
      },
      onError: (failure) =>
        setFailures((current) => ({ ...current, [invitation.id]: failureText(failure) })),
      onSettled: () => setAcceptingId(null),
    });
  }

  return (
    <Screen
      header={<AppBar title="Lời mời của tôi" onBack={() => router.back()} />}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
    >
      <View className="py-xs">
        {isLoading ? (
          <View className="gap-sm">
            <Skeleton className="h-20 rounded-md" />
            <Skeleton className="h-20 rounded-md" />
          </View>
        ) : isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void refetch() }]}
            description={toErrorMessage(error)}
            icon="alert-warning"
            title="Không tải được lời mời"
            tone="danger"
          />
        ) : !data || data.length === 0 ? (
          <EmptyState
            description="Chỉ hiện lời mời gửi tới email ĐÃ XÁC MINH của tài khoản này. Lời mời gửi tới email khác, hãy mở link trong thư."
            icon="email"
            title="Chưa có lời mời nào"
            tone="info"
          />
        ) : (
          // `-mx-md`: hàng đã tự có `px-md` + kẻ `border-b` chạy hết bề ngang; `Screen` (padded) cộng thêm 16 nữa là chữ
          // thụt vào 32dp. Kéo hàng ra tới mép để lề còn đúng 16.
          <View className="-mx-md">
            {data.map((invitation) => (
              <MyInvitationRow
                key={invitation.id}
                accepting={acceptingId === invitation.id}
                disabled={isOffline || acceptingId !== null}
                error={failures[invitation.id]}
                invitation={invitation}
                onAccept={handleAccept}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
