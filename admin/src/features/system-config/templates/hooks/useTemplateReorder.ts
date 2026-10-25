import type { UniqueIdentifier } from '@dnd-kit/core';
import { useCallback, useMemo, useState } from 'react';

import { useDisclosure } from '@/shared/hooks';
import { showToast } from '@/shared/utils/toast.utils';

import { useReorderTemplates } from '../service/templates.queries';
import type { WorkspaceTemplate } from '../types/templates.types';
import { templateErrorCode } from '../utils/template-errors';
import { describeSequence, moveTemplate, orderChanges } from '../utils/template-reorder';

/**
 * Kéo-thả đổi thứ tự mẫu (dnd-kit qua `Table sortable`). Thả xong bảng hiện NGAY thứ tự mới nhưng CHƯA lưu: mở hộp thoại lý do
 * (mỗi lần ghi của BE đều cần lý do + ghi nhật ký), xác nhận mới `PUT` từng mẫu đổi vị trí; huỷ thì bảng về thứ tự cũ.
 */
export function useTemplateReorder(templates: WorkspaceTemplate[], canEdit: boolean) {
  const { isOpen, open, close } = useDisclosure();
  const { mutateAsync } = useReorderTemplates();
  const [pending, setPending] = useState<WorkspaceTemplate[] | null>(null);

  /** Thứ tự đang hiển thị — bản kéo dở nếu có, không thì bản server. */
  const rows = pending ?? templates;

  const handleReorder = useCallback(
    (activeKey: UniqueIdentifier, overKey: UniqueIdentifier) => {
      if (!canEdit) return;
      const next = moveTemplate(templates, String(activeKey), String(overKey));
      if (next.every((t, i) => t.code === templates[i].code)) return; // thả lại đúng chỗ cũ
      setPending(next);
      open();
    },
    [canEdit, templates, open],
  );

  const cancel = useCallback(() => {
    setPending(null);
    close();
  }, [close]);

  const confirm = useCallback(
    async (reason: string) => {
      if (!pending) return;
      try {
        await mutateAsync({ changes: orderChanges(pending), reason });
      } catch (err) {
        // 409: mẫu vừa bị người khác sửa — danh sách đã được tải lại, bỏ thứ tự kéo dở thay vì ghi đè.
        if (templateErrorCode(err) !== 'RES_003') throw err;
        showToast(
          'warning',
          'Mẫu vừa được người khác thay đổi — đã tải lại danh sách, hãy sắp xếp lại',
        );
      }
      setPending(null);
      close();
    },
    [pending, mutateAsync, close],
  );

  const sequence = useMemo(() => (pending ? describeSequence(pending) : ''), [pending]);

  return { rows, isOpen, sequence, handleReorder, cancel, confirm };
}
