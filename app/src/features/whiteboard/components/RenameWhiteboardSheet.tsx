import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';
import { showToast } from '@/shared/utils/toast.utils';

import { WB_UI_LIMITS } from '../constants/whiteboard.constants';
import { useUpdateWhiteboard } from '../queries/whiteboard.mutations';
import { renameWhiteboardSchema, type RenameWhiteboardValues } from '../schemas/whiteboard.schemas';
import { whiteboardErrorMessage } from '../utils/whiteboard-errors';

export interface RenameWhiteboardSheetProps {
  board: { id: string; name: string; version: number };
  onClose: () => void;
  visible: boolean;
}

/**
 * Đổi tên bảng trắng (cần quyền `manage`). Gửi kèm `expectedVersion` của METADATA đang thấy: ai đổi tên/khôi phục xen giữa → 409 `RES_003` (câu tiếng
 * Việt ở khe `alert` của tấm; `useUpdateWhiteboard` tự tải lại chi tiết để lần thử sau dùng đúng phiên bản).
 * ⚠️ Ô nhập đặt THẲNG vào thân (không bọc `py-*`): tấm đã có khe 16 dưới tiêu đề và 12 trên hàng nút.
 */
export function RenameWhiteboardSheet({ board, onClose, visible }: RenameWhiteboardSheetProps) {
  const update = useUpdateWhiteboard(board.id);
  const form = useZodForm<RenameWhiteboardValues, RenameWhiteboardValues>(renameWhiteboardSchema, {
    defaultValues: { name: board.name },
    values: { name: board.name },
  });

  const close = () => {
    update.reset();
    onClose();
  };

  const submit = form.handleSubmit((data) => {
    if (data.name === board.name) {
      close();
      return;
    }
    update.mutate(
      { expectedVersion: board.version, name: data.name },
      {
        onSuccess: () => {
          showToast('success', 'Đã đổi tên bảng trắng');
          close();
        },
      },
    );
  });

  return (
    <BottomSheet
      alert={
        update.error ? (
          <Alert description={whiteboardErrorMessage(update.error)} tone="error" />
        ) : undefined
      }
      footer={<Button fullWidth label="Lưu" loading={update.isPending} onPress={submit} />}
      scrollable
      title="Đổi tên bảng trắng"
      visible={visible}
      onClose={close}
    >
      <FormInput<RenameWhiteboardValues>
        control={form.control}
        label="Tên bảng"
        maxLength={WB_UI_LIMITS.nameMax}
        name="name"
        required
        returnKeyType="done"
      />
    </BottomSheet>
  );
}
