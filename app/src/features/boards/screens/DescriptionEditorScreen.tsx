import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { DescriptionEditorForm } from '../components/task/DescriptionEditorForm';
import { useTaskDetail } from '../queries/task-detail.queries';

/**
 * Màn sửa mô tả toàn màn (`tasks/[taskId]/description`, app.md §1). Nạp chi tiết từ cache (màn chi tiết đã
 * tải sẵn — không tốn thêm request); form chỉ dựng SAU khi có bản THẬT (không phải giữ chỗ) để văn bản gốc
 * nạp đúng một lần, và `key` theo id để mở thẻ khác không dính chữ cũ.
 */
export function DescriptionEditorScreen() {
  const { boardId, taskId } = useLocalSearchParams<{ boardId: string; taskId: string }>();
  const detail = useTaskDetail(boardId, taskId);
  const offline = useConnectionState() === 'offline';

  if (!detail.data || detail.isPlaceholderData) {
    return (
      <Screen header={<AppBar title="Sửa mô tả" onBack={router.back} />} scrollable={false}>
        <View className="gap-md pt-xs">
          <Skeleton className="h-10 rounded-xs" />
          <Skeleton className="h-40 rounded-xs" />
        </View>
      </Screen>
    );
  }

  return (
    <DescriptionEditorForm
      key={detail.data.id}
      boardId={boardId}
      initial={detail.data.description ?? ''}
      offline={offline}
      taskId={taskId}
    />
  );
}
