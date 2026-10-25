import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';
import { showToast } from '@/shared/utils/toast.utils';

import { WB_UI_LIMITS } from '../constants/whiteboard.constants';
import { useCreateSnapshot } from '../queries/whiteboard.mutations';
import { snapshotLabelSchema, type SnapshotLabelValues } from '../schemas/whiteboard.schemas';
import { whiteboardErrorMessage } from '../utils/whiteboard-errors';

export interface SaveSnapshotSheetProps {
  onClose: () => void;
  visible: boolean;
  wbId: string;
}

/**
 * "Lưu phiên bản" (bản MANUAL): nhãn tuỳ chọn ≤ 100 ký tự. BE ép collab lưu state đang sống TRƯỚC khi chụp nên bản lưu = đúng cái người dùng đang thấy.
 * `WB_006` (đủ số bản thủ công) hiện ở khe `alert` của tấm (đứng yên dưới mô tả).
 * ⚠️ Ô nhập đặt THẲNG vào thân (không bọc `py-*`): tấm đã có khe 16 dưới mô tả và 12 trên hàng nút.
 */
export function SaveSnapshotSheet({ onClose, visible, wbId }: SaveSnapshotSheetProps) {
  const create = useCreateSnapshot(wbId);
  const form = useZodForm<SnapshotLabelValues, SnapshotLabelValues>(snapshotLabelSchema, {
    defaultValues: { label: '' },
  });

  const close = () => {
    create.reset();
    onClose();
  };

  const submit = form.handleSubmit((data) =>
    create.mutate(data.label || undefined, {
      onSuccess: () => {
        showToast('success', 'Đã lưu phiên bản');
        form.reset();
        close();
      },
    }),
  );

  return (
    <BottomSheet
      alert={
        create.error ? (
          <Alert description={whiteboardErrorMessage(create.error)} tone="error" />
        ) : undefined
      }
      description="Bản lưu giữ nội dung hiện tại để xem lại hoặc khôi phục sau này."
      footer={
        <Button fullWidth label="Lưu phiên bản" loading={create.isPending} onPress={submit} />
      }
      scrollable
      title="Lưu phiên bản"
      visible={visible}
      onClose={close}
    >
      <FormInput<SnapshotLabelValues>
        control={form.control}
        label="Nhãn (không bắt buộc)"
        maxLength={WB_UI_LIMITS.snapshotLabelMax}
        name="label"
        placeholder="Ví dụ: Bản gửi thầy duyệt"
        returnKeyType="done"
      />
    </BottomSheet>
  );
}
