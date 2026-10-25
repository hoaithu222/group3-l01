import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { PATHS } from '@/shell/config';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { showToast } from '@/shared/utils/toast.utils';

import { JoinPendingWaiting } from '../components/JoinPendingWaiting';
import { useJoinPendingState } from '../hooks/useJoinPendingState';
import { useCancelJoinRequest } from '../queries/access.queries';
import { WORKSPACE_CARD_COVER_RATIO } from '../utils/workspace-cover';

/**
 * Màn "Đang chờ quản trị nhóm duyệt" (app.md p3-04 §3, route `workspaces/pending?wsId=`).
 *
 *  · Được duyệt → `<Redirect>` thẳng vào nhóm (không `useEffect`: hàng rào phải chạy
 *    TRONG lúc vẽ, không sau nó — `navigation.md`).
 *  · Bị từ chối/không còn hiệu lực → nội dung riêng, không tự đá đi (người dùng cần
 *    đọc được kết quả), có nút về danh sách nhóm.
 *  · "Huỷ yêu cầu" → `POST …/join-request/cancel` rồi về danh sách nhóm.
 *  · Đang chờ → `JoinPendingWaiting`: danh thiếp nhóm + ba chặng + "Về danh sách nhóm" (yêu cầu vẫn giữ) / "Huỷ yêu cầu".
 *
 * Trạng thái suy từ danh sách nhóm của CHÍNH MÌNH (xem `useJoinPendingState`) vì
 * người đang chờ chưa đọc được `GET /workspaces/:id`.
 */
export function JoinPendingScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const { name, state, workspace } = useJoinPendingState(wsId);
  const cancelRequest = useCancelJoinRequest(wsId);

  if (state === 'approved') {
    return <Redirect href={{ pathname: '/workspaces/[wsId]', params: { wsId } }} />;
  }

  function handleCancel(): void {
    cancelRequest.mutate(undefined, {
      onSuccess: () => {
        showToast('success', 'Đã huỷ yêu cầu tham gia.');
        router.replace(PATHS.WORKSPACES);
      },
      onError: (error) => showToast('error', toErrorMessage(error)),
    });
  }

  return (
    <Screen header={<AppBar title="Yêu cầu tham gia" onBack={() => router.replace(PATHS.WORKSPACES)} />}>
      <View className="py-xs">
        {state === 'loading' ? (
          // Cùng khuôn trạng thái chờ (bìa 3:1 của danh thiếp nhóm + khối chữ) — dữ liệu về thì thế chỗ không nhảy.
          <View className="gap-xl">
            <View className="overflow-hidden rounded-md" style={{ aspectRatio: WORKSPACE_CARD_COVER_RATIO }}>
              <Skeleton className="h-full rounded-none" />
            </View>
            <Skeleton className="h-40 rounded-md" variant="card" />
          </View>
        ) : state === 'gone' ? (
          <EmptyState
            actions={[{ label: 'Về danh sách nhóm', onPress: () => router.replace(PATHS.WORKSPACES) }]}
            description="Quản trị nhóm đã từ chối, hoặc yêu cầu không còn hiệu lực. Bạn có thể xin vào lại sau 24 giờ."
            icon="user-add"
            title="Yêu cầu không được chấp nhận"
            tone="warning"
          />
        ) : (
          <JoinPendingWaiting
            cancelling={cancelRequest.isPending}
            name={name}
            workspace={workspace}
            onBack={() => router.replace(PATHS.WORKSPACES)}
            onCancel={handleCancel}
          />
        )}
      </View>
    </Screen>
  );
}
