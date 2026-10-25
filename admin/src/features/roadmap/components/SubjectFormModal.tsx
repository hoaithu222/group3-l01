import { memo, useCallback } from 'react';

import { FormModal, useZodForm } from '@/shared/ui';

import { subjectFormSchema, type SubjectFormValues } from '../schemas/subject.schema';
import { usePatchSubject } from '../service/roadmap.queries';
import type { AdminSubjectDetail } from '../types/roadmap.types';
import { subjectToFormValues, toPatchSubjectPayload } from '../utils/subject-form.utils';
import SubjectFormFields from './SubjectFormFields';

export interface SubjectFormModalProps {
  open: boolean;
  subject: AdminSubjectDetail;
  onClose: () => void;
}

/**
 * "Sửa thông tin" mở từ `SubjectDetailPage` (admin.md §2) — tạo mới đi qua `SubjectCreatePage` (trang
 * riêng, route `subjects/new`), không qua modal này. `PATCH /admin/roadmap/subjects/:id` với CAS
 * `expectedVersion`; 409 `RES_003` → interceptor toast, modal giữ mở để tải lại và sửa tiếp.
 */
const SubjectFormModal = memo(function SubjectFormModal({ open, subject, onClose }: SubjectFormModalProps) {
  const form = useZodForm<SubjectFormValues>(subjectFormSchema, {
    defaultValues: subjectToFormValues(subject),
  });
  const patch = usePatchSubject();

  const handleSubmit = useCallback(
    async (data?: SubjectFormValues) => {
      if (!data) return;
      await patch.mutateAsync(toPatchSubjectPayload(subject, data));
      onClose();
    },
    [onClose, patch, subject],
  );

  return (
    <FormModal<SubjectFormValues>
      confirmLabel="Lưu thay đổi"
      form={form}
      open={open}
      scrollable
      size="sm"
      title="Sửa thông tin lộ trình"
      onConfirm={handleSubmit}
      onOpenChange={(next) => !next && onClose()}
    >
      <SubjectFormFields isEditing />
    </FormModal>
  );
});

export default SubjectFormModal;
