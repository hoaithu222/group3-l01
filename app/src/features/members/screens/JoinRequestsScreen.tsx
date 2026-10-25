import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useConnectionState } from '@/core/socket';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import type { JoinRequestRow as JoinRequestRowData } from '../api';
import { JoinRequestRow } from '../components/JoinRequestRow';
import { RejectRequestSheet } from '../components/RejectRequestSheet';
import { useDecideJoinRequest, useJoinRequests } from '../queries/join-requests.queries';
import { readErrorInfo } from '../utils/error-info';

/**
 * Yêu cầu tham gia chờ duyệt (OWNER/ADMIN — app.md p3-04 §3). Duyệt/Từ chối gỡ
 * dòng ngay (lạc quan); 409 nghĩa là người khác đã xử lý trước → giữ dòng đã gỡ +
 * toast "Đã được xử lý", KHÔNG hiện như lỗi. Offline: chỉ đọc (nút khoá).
 */
export function JoinRequestsScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const isOffline = useConnectionState() === 'offline';
  const { data, error, fetchNextPage, hasNextPage, isError, isFetchingNextPage, isLoading, isRefetching, refetch } =
    useJoinRequests(wsId);
  const decide = useDecideJoinRequest(wsId);
  const [rejectTarget, setRejectTarget] = useState<JoinRequestRowData | null>(null);

  const requests = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  function handleDecision(request: JoinRequestRowData, decision: 'approve' | 'reject', reason?: string): void {
    decide.mutate(
      { userId: request.user.id, decision, reason },
      {
        onSuccess: () => {
          hapticSuccess(); // quyết định đã ghi nhận — rung báo xong đi cùng toast
          showToast('success', decision === 'approve' ? `Đã duyệt ${request.user.name}.` : `Đã từ chối ${request.user.name}.`);
        },
        onError: (mutationError) => {
          // 409: người khác đã xử lý trước — không phải lỗi của người dùng, và dòng đã gỡ (hook giữ nguyên việc gỡ).
          if (readErrorInfo(mutationError).status === 409) showToast('info', 'Yêu cầu này đã được xử lý.');
          else showToast('error', toErrorMessage(mutationError));
        },
      },
    );
  }

  return (
    <Screen
      header={<AppBar title="Yêu cầu tham gia" onBack={router.back} />}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
    >
      <View className="gap-md py-xs">
        {isOffline ? <Alert description="Kết nối lại để duyệt hoặc từ chối." title="Bạn đang ngoại tuyến" tone="warning" /> : null}

        {isLoading ? (
          <View className="gap-sm">
            <Skeleton className="h-28 rounded-md" />
            <Skeleton className="h-28 rounded-md" />
          </View>
        ) : isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void refetch() }]}
            description={toErrorMessage(error)}
            icon="alert-warning"
            title="Không tải được yêu cầu"
            tone="danger"
          />
        ) : requests.length === 0 ? (
          <EmptyState
            description="Khi có người xin vào nhóm, yêu cầu sẽ hiện ở đây."
            icon="user-add"
            title="Không có yêu cầu"
            tone="info"
          />
        ) : (
          <View>
            {/* `-mx-md`: hàng đã tự có `px-md` + kẻ `border-b` chạy hết bề ngang; `Screen` (padded) cộng thêm 16 nữa
                là chữ thụt vào 32dp. Kéo hàng ra tới mép để lề còn đúng 16. */}
            <View className="-mx-md">
              {requests.map((request) => (
                <JoinRequestRow
                  key={request.user.id}
                  disabled={isOffline}
                  request={request}
                  onApprove={(target) => handleDecision(target, 'approve')}
                  onReject={setRejectTarget}
                />
              ))}
            </View>
            {hasNextPage ? (
              <Button label="Tải thêm" loading={isFetchingNextPage} variant="tertiary" onPress={() => void fetchNextPage()} />
            ) : null}
          </View>
        )}
      </View>

      <RejectRequestSheet
        name={rejectTarget?.user.name ?? ''}
        visible={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        onConfirm={(reason) => {
          if (rejectTarget) handleDecision(rejectTarget, 'reject', reason);
          setRejectTarget(null);
        }}
      />
    </Screen>
  );
}
