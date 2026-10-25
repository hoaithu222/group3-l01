import { z } from 'zod';

import { FormModal, TextareaField, ToggleField, useZodForm } from '@/shared/ui';

import { useRevokeMember } from '../../service/workspace-members.queries';
import type { AdminMemberRow } from '../../types/workspace-members.types';

// Cùng ngưỡng với `ConfirmWithReasonModal` (khớp `reasonSchema` phía BE) —
// KHÔNG dùng thẳng `ConfirmWithReasonModal`: modal này cần thêm 1 trường
// (`ban`, admin.md p1-02 §2.2 "checkbox Chặn quay lại bằng link") mà
// `ConfirmWithReasonModal` không có chỗ nhận field phụ, giống lý do
// `AnonymizeUserModal` cũng tự dựng trên `FormModal` thay vì dùng lại nó.
const schema = z.object({
  reason: z.string().trim().min(10, 'Lý do tối thiểu 10 ký tự').max(500, 'Lý do tối đa 500 ký tự'),
  ban: z.boolean(),
});
type Values = z.infer<typeof schema>;

const DEFAULT_VALUES: Values = { reason: '', ban: false };

export interface RevokeMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  member: AdminMemberRow;
}

/**
 * Thu hồi thành viên cấp nền tảng (admin.md p1-02 §2.2) —
 * `POST /admin/workspaces/:id/members/:userId/revoke { reason, ban }`.
 * Không gọi được với OWNER (BE `WS_015`) — `WorkspaceMemberTable` đã khoá nút
 * ở hàng OWNER nên modal này không cần tự kiểm lại.
 */
export default function RevokeMemberModal({
  open,
  onOpenChange,
  workspaceId,
  member,
}: RevokeMemberModalProps) {
  const revokeMember = useRevokeMember(workspaceId);
  const form = useZodForm<Values>(schema, { defaultValues: DEFAULT_VALUES });

  return (
    <FormModal<Values>
      confirmLabel="Thu hồi"
      form={form}
      open={open}
      size="sm"
      title={`Thu hồi khỏi nhóm — ${member.user.name}`}
      onConfirm={async (data) => {
        if (!data) return;
        await revokeMember.mutateAsync({ userId: member.user.id, reason: data.reason, ban: data.ban });
        form.reset(DEFAULT_VALUES);
      }}
      onOpenChange={(next) => {
        if (!next) form.reset(DEFAULT_VALUES);
        onOpenChange(next);
      }}
    >
      <div className="text-body-14 text-fg-2">
        Người dùng mất quyền nhóm, kênh riêng tư, nhóm chat của nhóm và cuộc gọi đang tham gia ngay lập
        tức.
      </div>
      <TextareaField
        label="Lý do"
        maxLength={500}
        name="reason"
        placeholder="Ghi rõ lý do — sẽ lưu vào nhật ký quản trị"
        required
        rows={3}
        showCount
      />
      <ToggleField label="Chặn quay lại bằng link" name="ban" toggleLabel="Chặn" />
    </FormModal>
  );
}
