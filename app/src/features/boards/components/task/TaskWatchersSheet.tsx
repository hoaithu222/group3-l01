import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { ListItem } from '@/shared/ui/list';

import type { TaskWatchers } from '../../api/task-detail.types';
import { WATCHER_STATE_LABEL, watcherCountText } from '../../utils/task-watch';

export interface TaskWatchersSheetProps {
  /** Lỗi của lượt tải lại gần nhất (vd mở danh sách lúc mất mạng) — danh sách cũ vẫn hiện kèm banner. */
  error: unknown;
  visible: boolean;
  watchers: TaskWatchers;
  onClose: () => void;
  onRetry: () => void;
}

/**
 * Danh sách người theo dõi thẻ (p3-03 P1, `GET /tasks/:id/watchers`): tên + LÝ DO đang theo dõi bằng chữ ("Người làm / người tạo", "Tự động theo
 * dõi", "Đã chọn theo dõi"). BE chỉ trả thành viên ACTIVE hiện tại (tối đa 200), người đã tắt không nằm trong danh sách. Chỉ đọc — mỗi người tự đổi
 * trạng thái của MÌNH ở dòng theo dõi, không có thao tác nào lên người khác.
 *
 * `TaskWatchRow` chỉ mở tấm khi đã có dữ liệu (dòng đó lo khung xương lúc tải và lỗi tải lần đầu) nên tấm chỉ còn hai ca: rỗng và có danh sách;
 * tải lại lỗi thì giữ danh sách cũ và hiện banner "Thử lại".
 */
export function TaskWatchersSheet({ error, visible, watchers, onClose, onRetry }: TaskWatchersSheetProps) {
  const items = watchers.watchers;

  return (
    <BottomSheet
      alert={
        error ? (
          <Alert
            actions={<Button label="Thử lại" size="xs" variant="secondary" onPress={onRetry} />}
            description={toErrorMessage(error)}
            tone="error"
          />
        ) : undefined
      }
      padded={false}
      scrollable
      title={`Người theo dõi (${watchers.total})`}
      visible={visible}
      onClose={onClose}
    >
      {items.length === 0 ? (
        <EmptyState
          description="Người làm, người tạo và ai chọn theo dõi sẽ nhận thông báo bình luận và nhắc hạn của thẻ."
          icon="noti-off"
          size="compact"
          title={watcherCountText(0)}
        />
      ) : (
        <SheetList accessibilityRole="list" className="pb-md">
          {items.map((watcher, index) => (
            <ListItem
              key={watcher.user.id}
              description={WATCHER_STATE_LABEL[watcher.state]}
              divider={index < items.length - 1}
              label={watcher.user.name || 'Thành viên'}
              leading={
                <Avatar
                  name={watcher.user.name}
                  size="sm"
                  source={watcher.user.avatarUrl ? { uri: watcher.user.avatarUrl } : undefined}
                />
              }
            />
          ))}
        </SheetList>
      )}
    </BottomSheet>
  );
}
