import { Text } from 'react-native';

import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';

import type { RescheduleBatchDto } from '../../api/critical-path.types';

export interface RescheduleConflictSheetProps {
  batch: RescheduleBatchDto | undefined;
  visible: boolean;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
}

/**
 * Danh sách thẻ CHƯA DỜI ĐƯỢC của một lô nền (app.md §3 dòng Kanban: "Xem chi tiết"): thẻ bị sửa, chuyển sang Hoàn
 * thành hoặc bị xoá giữa lúc lô chạy nên BE ghi `CONFLICT` thay vì dời. BE trả tối đa 50 thẻ — nhiều hơn thì nói rõ số
 * còn lại để người dùng không tưởng đây là toàn bộ. Chạm một thẻ để mở và dời tay.
 *
 * Hàng là `ListItem` điều hướng (tiêu đề đậm + mũi tên `›` + kẻ ngăn) trong `SheetList` — trước đây là dòng chữ trần,
 * không có dấu hiệu nào cho thấy bấm được.
 */
export function RescheduleConflictSheet({
  batch,
  visible,
  onClose,
  onOpenTask,
}: RescheduleConflictSheetProps) {
  const conflicts = batch?.conflicts ?? [];
  const hidden = Math.max(0, (batch?.conflictCount ?? 0) - conflicts.length);

  return (
    <BottomSheet
      description="Các thẻ này bị sửa, hoàn thành hoặc xoá trong lúc dời nên chưa đổi lịch. Hãy mở và kiểm tra lại."
      padded={false}
      scrollable
      title={`${batch?.conflictCount ?? 0} thẻ chưa dời được`}
      visible={visible}
      onClose={onClose}
    >
      {conflicts.length === 0 && hidden === 0 ? (
        // `EmptyState` tự có lề 16 ⇒ đặt NGOÀI `SheetList` (bọc vào là thụt 32).
        <EmptyState
          description="Không còn thẻ nào cần kiểm tra."
          icon="checkmark-circle"
          size="compact"
          tone="success"
        />
      ) : (
        // `SheetList` = lề 16 (tấm tràn viền không đệm, `ListItem` cũng không). `pb-md`: tấm không có `footer`.
        <SheetList accessibilityRole="list" className="pb-md">
          {conflicts.map((item, index) => (
            <ListItem
              key={item.taskId}
              divider={index < conflicts.length - 1}
              emphasis="title"
              label={item.title}
              labelNumberOfLines={2}
              // Mũi tên thuần trang trí (không `label` ⇒ ẩn khỏi trình đọc màn hình) — vai `button` của hàng đã nói "bấm được".
              trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
              onPress={() => {
                onClose();
                onOpenTask(item.taskId);
              }}
            />
          ))}
          {hidden > 0 ? (
            <Text className="pt-xs text-body-md text-fg-2">{`và ${hidden} thẻ khác`}</Text>
          ) : null}
        </SheetList>
      )}
    </BottomSheet>
  );
}
