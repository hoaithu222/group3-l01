import { useCallback, useState } from 'react';

import { FormModal, TextField, useZodForm } from '@/shared/ui';

import { createPhaseQuickSchema, type CreatePhaseQuickValues } from '../schemas/phase.schema';
import { useCreatePhase } from '../service/roadmap.queries';
import { newRoadmapIdempotencyKey } from '../service/roadmap.service';

interface CreatePhaseModalProps {
  subjectId: string;
  onClose: () => void;
}

/** Modal thu gọn "+ Thêm tháng" — mount mới mỗi lần mở (mẫu `CreateLessonModal` trong `PhasePanel`). */
export default function CreatePhaseModal({ subjectId, onClose }: CreatePhaseModalProps) {
  const form = useZodForm<CreatePhaseQuickValues>(createPhaseQuickSchema, {
    defaultValues: { title: '' },
  });
  const create = useCreatePhase();
  const [idempotencyKey] = useState(newRoadmapIdempotencyKey);

  const handleSubmit = useCallback(
    async (data?: CreatePhaseQuickValues) => {
      if (!data) return;
      await create.mutateAsync({ subjectId, title: data.title, idempotencyKey });
      onClose();
    },
    [create, idempotencyKey, onClose, subjectId],
  );

  return (
    <FormModal<CreatePhaseQuickValues>
      confirmLabel="Tạo tháng"
      form={form}
      open
      size="sm"
      title="Thêm tháng"
      onConfirm={handleSubmit}
      onOpenChange={(next) => !next && onClose()}
    >
      <TextField
        label="Tiêu đề tháng"
        name="title"
        placeholder="Tháng 1 — Nền móng giao diện"
        required
      />
      <p className="text-caption-12 text-fg-4">
        Sửa giai đoạn, tóm tắt, màu, dự án cuối tháng sau khi tạo.
      </p>
    </FormModal>
  );
}
