import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { GuestManageForm } from '../components/GuestManageForm';
import { MemberCardHeader } from '../components/MemberCardHeader';
import { MemberCardLoadError } from '../components/MemberCardLoadError';
import { useWorkspaceAccess } from '../queries/guests.queries';
import { useMemberCard } from '../queries/members.queries';

/**
 * Quản lý MỘT khách (app.md p3-04 §3, route `members/[userId]/guest`): hạn, kênh
 * chỉ định, thu hồi ngay — OWNER/ADMIN. Vào từ hàng "Quản lý quyền khách" ở thẻ
 * thành viên. Người này không phải khách (BE cũng trả 400) → thông báo, không có form.
 */
export function ManageGuestScreen() {
  const { userId, wsId } = useLocalSearchParams<{ userId: string; wsId: string }>();
  const isOffline = useConnectionState() === 'offline';
  const { data: card, error, isLoading, refetch } = useMemberCard(wsId, userId);
  const { data: access } = useWorkspaceAccess(wsId);

  return (
    <Screen header={<AppBar title="Quyền khách" onBack={router.back} />}>
      <View className="gap-md py-xs">
        {isLoading ? (
          <Skeleton className="h-64 rounded-md" />
        ) : error || !card ? (
          <MemberCardLoadError error={error} onRetry={() => void refetch()} />
        ) : card.role !== 'GUEST' ? (
          <EmptyState
            description="Người này không phải khách của nhóm."
            icon="shield-user"
            title="Không phải khách"
            tone="neutral"
          />
        ) : (
          <>
            {/* Header đã kèm "Khách · còn N ngày" cho thẻ khách. */}
            <MemberCardHeader card={card} />
            {isOffline ? <Alert description="Kết nối lại để thay đổi quyền khách." title="Bạn đang ngoại tuyến" tone="warning" /> : null}
            {/* `key`: đổi sang khách khác (hoặc thẻ tải lại với phiên bản mới) phải dựng lại state form từ `card`. */}
            <GuestManageForm
              key={`${card.userId}:${card.version ?? 0}`}
              card={card}
              disabled={isOffline}
              maxDays={access?.maxGuestDays}
              wsId={wsId}
            />
          </>
        )}
      </View>
    </Screen>
  );
}
