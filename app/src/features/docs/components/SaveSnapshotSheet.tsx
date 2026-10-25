import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';
import { showToast } from '@/shared/utils/toast.utils';

import { DOCS_LIMITS } from '../constants/docs.constants';
import { useCreateSnapshot } from '../queries/docs.mutations';
import { snapshotLabelSchema, type SnapshotLabelValues } from '../schemas/docs.schemas';
import { docsErrorMessage } from '../utils/docs-errors';

export interface SaveSnapshotSheetProps {
  docId: string;
  visible: boolean;
  onClose: () => void;
}

/**
 * "Lưu phiên bản" (bản MANUAL): nhãn tuỳ chọn ≤ 100 ký tự. BE ép collab lưu state đang sống TRƯỚC khi chụp nên bản lưu = đúng cái người dùng
 * đang thấy. `DOC_007` (đủ 100 bản thủ công) hiện trong tấm.
 */
export function SaveSnapshotSheet({ docId, onClose, visible }: SaveSnapshotSheetProps) {
  const create = useCreateSnapshot(docId);
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
      // Lỗi máy chủ (`DOC_007` đủ 100 bản…) ghim dưới mô tả (khe `alert`); thân tấm chỉ còn ô nhãn.
      alert={
        create.error ? (
          <Alert description={docsErrorMessage(create.error)} tone="error" />
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
        maxLength={DOCS_LIMITS.snapshotLabelMax}
        name="label"
        placeholder="Ví dụ: Bản gửi thầy duyệt"
        returnKeyType="done"
      />
    </BottomSheet>
  );
}
