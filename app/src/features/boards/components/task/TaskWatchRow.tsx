import { useState } from 'react';
import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Button, LinkButton } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { Skeleton } from '@/shared/ui/skeleton';
import { hapticSelection } from '@/shared/utils/haptics';

import { useSetTaskWatch, useTaskWatchers } from '../../queries/task-extras.queries';
import { watcherCountText, watchExplanation, watchHeadline } from '../../utils/task-watch';
import { TaskWatchersSheet } from './TaskWatchersSheet';

export interface TaskWatchRowProps {
  taskId: string;
}

/**
 * Theo dõi thẻ (p3-03 P1) ở chi tiết thẻ: trạng thái của TÔI bằng chữ ("Đang theo dõi thẻ này" + lý do), nút "Theo dõi"/"Bỏ theo dõi" và "N người
 * theo dõi" mở danh sách. Người theo dõi nhận thêm thông báo bình luận và nhắc hạn; bỏ theo dõi chỉ tắt hai loại đó (không tắt thông báo được giao
 * việc/được nhắc tên).
 *
 * Quyền = thấy được thẻ (BE `workspace.board.read`; theo dõi là sở thích cá nhân nên dùng được cả khi bảng đã lưu trữ) — vì vậy KHÔNG suy quyền từ
 * `myPermissions` của thẻ; chỉ khoá nút khi offline. Nơi gọi không vẽ dòng này cho thẻ đã xoá / bản giữ chỗ.
 *
 * Trạng thái: khung xương lúc tải · lỗi + "Thử lại" · dữ liệu. Nút đổi ngay (optimistic, `useSetTaskWatch`); lỗi hoàn tác + toast.
 */
export function TaskWatchRow({ taskId }: TaskWatchRowProps) {
  const watchers = useTaskWatchers(taskId, true);
  const setWatch = useSetTaskWatch(taskId);
  const offline = useConnectionState() === 'offline';
  const [listOpen, setListOpen] = useState(false);
  const data = watchers.data;

  if (!data) {
    return watchers.isError ? (
      <Card>
        <View className="flex-row items-center justify-between gap-sm">
          <Text className="flex-1 text-body-md text-fg-2">Không tải được trạng thái theo dõi.</Text>
          <LinkButton label="Thử lại" onPress={() => void watchers.refetch()} />
        </View>
      </Card>
    ) : (
      <Skeleton className="h-20 rounded-md" />
    );
  }

  const { me } = data;

  return (
    <Card>
      <View className="flex-row items-center gap-sm">
        <Icon color={me.watching ? 'fg-brand' : 'fg-2'} name={me.watching ? 'noti' : 'noti-off'} />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-lg font-semibold text-fg-1">{watchHeadline(me)}</Text>
          <Text className="text-caption-lg text-fg-2">{watchExplanation(me)}</Text>
        </View>
        <Button
          disabled={offline}
          label={me.watching ? 'Bỏ theo dõi' : 'Theo dõi'}
          loading={setWatch.isPending}
          size="sm"
          variant={me.watching ? 'secondary' : 'primary'}
          onPress={() => {
            hapticSelection();
            setWatch.mutate(!me.watching);
          }}
        />
      </View>
      <View className="items-start">
        <LinkButton
          label={watcherCountText(data.total)}
          onPress={() => {
            // Không có socket cho theo dõi: mở danh sách là lúc tải lại để thấy người vừa theo dõi.
            void watchers.refetch();
            setListOpen(true);
          }}
        />
      </View>
      <TaskWatchersSheet
        error={watchers.error}
        visible={listOpen}
        watchers={data}
        onClose={() => setListOpen(false)}
        onRetry={() => void watchers.refetch()}
      />
    </Card>
  );
}
