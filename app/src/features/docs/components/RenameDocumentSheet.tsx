import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';
import { showToast } from '@/shared/utils/toast.utils';

import { DOCS_LIMITS } from '../constants/docs.constants';
import { useUpdateDocument } from '../queries/docs.mutations';
import { renameDocumentSchema, type RenameDocumentValues } from '../schemas/docs.schemas';
import { docsErrorMessage } from '../utils/docs-errors';

export interface RenameDocumentSheetProps {
  doc: { id: string; title: string; version: number };
  visible: boolean;
  onClose: () => void;
}

/**
 * Đổi tên tài liệu (cần quyền `manage`). Gửi kèm `expectedVersion` của METADATA đang thấy: ai đổi tên/khôi phục xen giữa → 409 `RES_003`
 * (câu tiếng Việt trong tấm; `useUpdateDocument` tự tải lại chi tiết để lần thử sau dùng đúng phiên bản).
 */
export function RenameDocumentSheet({ doc, onClose, visible }: RenameDocumentSheetProps) {
  const update = useUpdateDocument(doc.id);
  const form = useZodForm<RenameDocumentValues, RenameDocumentValues>(renameDocumentSchema, {
    defaultValues: { title: doc.title },
    values: { title: doc.title },
  });

  const close = () => {
    update.reset();
    onClose();
  };

  const submit = form.handleSubmit((data) => {
    if (data.title === doc.title) {
      close();
      return;
    }
    update.mutate(
      { expectedVersion: doc.version, title: data.title },
      {
        onSuccess: () => {
          showToast('success', 'Đã đổi tên tài liệu');
          close();
        },
      },
    );
  });

  return (
    <BottomSheet
      // Lỗi máy chủ (`RES_003`…) ghim dưới tiêu đề (khe `alert`); thân tấm chỉ còn ô nhập.
      alert={
        update.error ? (
          <Alert description={docsErrorMessage(update.error)} tone="error" />
        ) : undefined
      }
      footer={<Button fullWidth label="Lưu" loading={update.isPending} onPress={submit} />}
      scrollable
      title="Đổi tên tài liệu"
      visible={visible}
      onClose={close}
    >
      <FormInput<RenameDocumentValues>
        control={form.control}
        label="Tiêu đề"
        maxLength={DOCS_LIMITS.titleMax}
        name="title"
        placeholder="Tên tài liệu"
        required
        returnKeyType="done"
      />
    </BottomSheet>
  );
}
