import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { useResolveTask } from '../queries/task-detail.queries';
import { getHttpStatus } from '../utils/error-details';

/**
 * Đích của deep link `https://<miền>/w/{wsId}/t/{taskId}` và của thông báo `TASK_*` (p1-07 — chưa có, xem
 * README p3-03 #10): hỏi `GET /tasks/:id` lấy `boardId` rồi `Redirect` sang route chi tiết thật. Nằm TRONG
 * `(app)/workspaces/[wsId]` nên hàng rào đăng nhập/thành viên áp dụng như mọi màn (`app/w/**` chỉ chuyển tiếp).
 * 404 (thẻ xoá / không còn quyền / người ngoài — GUEST luôn 404) → "Thẻ không còn tồn tại".
 */
export function TaskLinkResolverScreen() {
  const { taskId, wsId } = useLocalSearchParams<{ taskId: string; wsId: string }>();
  const task = useResolveTask(taskId);

  if (task.data) {
    return (
      <Redirect
        href={{
          params: { boardId: task.data.boardId, taskId, wsId },
          pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
        }}
      />
    );
  }

  const header = <AppBar title="Chi tiết thẻ" onBack={router.back} />;
  if (task.isError) {
    const gone = getHttpStatus(task.error) === 404;
    return (
      <Screen header={header} scrollable={false}>
        <EmptyState
          actions={
            gone
              ? [
                  {
                    label: 'Về nhóm',
                    onPress: () =>
                      router.replace({ params: { wsId }, pathname: '/workspaces/[wsId]' }),
                  },
                ]
              : [{ label: 'Thử lại', onPress: () => void task.refetch() }]
          }
          description={
            gone ? 'Thẻ này đã bị xoá hoặc bạn không còn quyền xem.' : toErrorMessage(task.error)
          }
          icon={gone ? 'lock' : 'alert-warning'}
          title={gone ? 'Thẻ không còn tồn tại' : 'Không tải được thẻ'}
          tone={gone ? 'warning' : 'danger'}
        />
      </Screen>
    );
  }

  return (
    <Screen header={header} scrollable={false}>
      <View className="gap-md pt-xs">
        <Skeleton className="h-8 rounded-xs" />
        <Skeleton className="h-24 rounded-xs" />
      </View>
    </Screen>
  );
}
