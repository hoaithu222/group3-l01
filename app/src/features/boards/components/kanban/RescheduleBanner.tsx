import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { LinkButton } from '@/shared/ui/button';

import { useRescheduleBatch } from '../../queries/reschedule.queries';
import { batchResultText, batchRunningText, isBatchActive } from '../../utils/reschedule-text';
import { RescheduleConflictSheet } from './RescheduleConflictSheet';

export interface RescheduleBannerProps {
  batchId: string;
  boardId: string;
  /** Ẩn banner (lô kết thúc rồi người dùng đóng, hoặc không tra được lô). */
  onDismiss: () => void;
  onOpenTask: (taskId: string) => void;
}

/**
 * Banner lô dời lịch nền, đứng dưới thanh lọc của Kanban/Gantt (app.md §3): "Đang dời lịch 250 thẻ…" khi lô còn chạy;
 * kết thúc thì đổi thành kết quả ("Đã dời 249 thẻ, 1 xung đột") kèm "Xem chi tiết" khi có xung đột. Còn chạy thì KHÔNG
 * đóng được (người dùng cần biết bảng đang đổi); xong thì đóng được.
 *
 * Chỉ mount khi có `batchId` — hook trạng thái lô không chạy ở màn không có lô. Không tra được lô (404/mất quyền) thì
 * tự ẩn thay vì treo "đang dời" mãi; mất mạng giữa chừng vẫn giữ dòng "Đang dời…" (chưa có dữ liệu ≠ đã xong).
 */
export function RescheduleBanner({ batchId, boardId, onDismiss, onOpenTask }: RescheduleBannerProps) {
  const query = useRescheduleBatch(batchId, boardId);
  const [detail, setDetail] = useState(false);
  const batch = query.data;

  if (!batch) {
    if (query.isError) {
      // Không có dữ liệu VÀ đã lỗi: hỏi lại thất bại (404/mất quyền) — đừng treo banner vô nghĩa.
      return <Alert description="Không kiểm tra được tiến độ dời lịch." tone="warning" onClose={onDismiss} />;
    }
    return <Alert description="Đang dời lịch…" tone="info" />;
  }

  if (isBatchActive(batch.status)) {
    return <Alert description={batchRunningText(batch)} tone="info" />;
  }

  const tone = batch.status === 'DONE' ? 'success' : batch.status === 'PARTIAL' ? 'warning' : 'error';
  return (
    <View>
      <Alert
        actions={
          batch.conflictCount > 0 ? (
            <LinkButton label="Xem chi tiết" onPress={() => setDetail(true)} />
          ) : undefined
        }
        description={batchResultText(batch)}
        tone={tone}
        onClose={onDismiss}
      />
      <RescheduleConflictSheet
        batch={batch}
        visible={detail}
        onClose={() => setDetail(false)}
        onOpenTask={onOpenTask}
      />
    </View>
  );
}
