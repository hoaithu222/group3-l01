import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import type { RecordingDto } from '../../api/meeting-recap.types';

export interface RecordingActionsSheetProps {
  recording: RecordingDto | null;
  onClose: () => void;
  onDelete: (recording: RecordingDto) => void;
  onDownload: (recording: RecordingDto) => void;
}

/**
 * Menu của một bản ghi (chủ trì/OWNER — app.md §3 "menu editor: Tải về, Xoá"): chỉ hiện mục có quyền (`myActions`). Chọn mục thì tấm TỰ
 * ĐÓNG rồi mới chạy việc (hộp thoại xoá không kẹt sau tấm).
 *
 * `padded={false}` + `SheetList`: hàng menu DÍNH nhau, ngăn bằng kẻ — thân `padded` mặc định chèn khe 8 giữa hai hàng (kẻ hở một dải
 * trắng) và không có đệm đáy cho hàng cuối.
 */
export function RecordingActionsSheet({
  recording,
  onClose,
  onDelete,
  onDownload,
}: RecordingActionsSheetProps) {
  const run = (action: (rec: RecordingDto) => void) => () => {
    onClose();
    if (recording) action(recording);
  };
  const canDownload = recording?.myActions.canDownload ?? false;
  const canDelete = recording?.myActions.canDelete ?? false;

  return (
    <BottomSheet
      padded={false}
      title="Bản ghi cuộc họp"
      visible={recording !== null}
      onClose={onClose}
    >
      {/* Ô icon có tông: việc thường tông xanh, việc PHÁ HUỶ tông đỏ + tiêu đề đỏ và đứng CUỐI (không đặt cạnh nhau cùng một màu). */}
      <SheetList accessibilityRole="menu" className="pb-md">
        {canDownload ? (
          <ListItem
            description="Lưu tệp video về máy hoặc chia sẻ."
            divider={canDelete}
            emphasis="title"
            label="Tải về"
            leading={<IconTile name="save-image" size="sm" tone="info" />}
            onPress={run(onDownload)}
          />
        ) : null}
        {canDelete ? (
          <ListItem
            description="Xoá vĩnh viễn — mọi người không xem được nữa."
            emphasis="danger"
            label="Xoá bản ghi"
            leading={<IconTile name="delete" size="sm" tone="danger" />}
            onPress={run(onDelete)}
          />
        ) : null}
      </SheetList>
    </BottomSheet>
  );
}
