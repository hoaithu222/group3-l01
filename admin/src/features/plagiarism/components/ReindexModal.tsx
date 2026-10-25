import { memo, useState } from 'react';
import { z } from 'zod';

import { Callout, FormModal, TextareaField, useZodForm } from '@/shared/ui';
import { WorkspacePicker } from '@/shared/widgets/workspace-picker';
import type { WorkspaceOption } from '@/shared/widgets/workspace-picker';

import { useReindexPlagiarism } from '../service/plagiarism.queries';

const schema = z.object({ reason: z.string().trim().min(10, 'Lý do tối thiểu 10 ký tự').max(500) });
type Values = z.infer<typeof schema>;

export interface ReindexModalProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/**
 * "Lập chỉ mục lại" (admin.md §2.3): chọn workspace (để trống = Tất cả) + lý do bắt buộc →
 * `POST /admin/plagiarism/reindex`. BE chỉ đếm nhanh rồi xếp MỘT job nền — toast báo số tệp đã xếp hàng.
 */
const ReindexModal = memo(function ReindexModal({ onOpenChange, open }: ReindexModalProps) {
  const [workspace, setWorkspace] = useState<WorkspaceOption | null>(null);
  const form = useZodForm<Values>(schema, { defaultValues: { reason: '' } });
  const reindex = useReindexPlagiarism();

  return (
    <FormModal<Values>
      confirmLabel="Lập chỉ mục lại"
      form={form}
      open={open}
      title="Lập chỉ mục lại"
      onConfirm={async (values) => {
        if (!values) return;
        await reindex.mutateAsync({ workspaceId: workspace?.id, reason: values.reason });
        form.reset({ reason: '' });
        setWorkspace(null);
      }}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          form.reset({ reason: '' });
          setWorkspace(null);
        }
      }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-body-14 text-fg-1 font-medium">Nhóm (để trống = Tất cả)</span>
          <WorkspacePicker allLabel="Tất cả nhóm" value={workspace} onChange={setWorkspace} />
        </div>
        {!workspace && (
          <Callout
            description="Lập chỉ mục lại TOÀN HỆ THỐNG có thể tạo nhiều job nền — chỉ dùng khi thật sự cần (đổi thuật toán, sự cố chỉ mục)."
            intent="warning"
            variant="ghost"
          />
        )}
        <TextareaField label="Lý do" name="reason" placeholder="Vd: đổi thuật toán quét trùng, cần lập chỉ mục lại" rows={3} />
      </div>
    </FormModal>
  );
});

export default ReindexModal;
