import { useEffect } from 'react';

import { FormModal, SelectField, TextareaField, useZodForm } from '@/shared/ui';

import { USER_ROLE_OPTIONS } from '../constants/user.constants';
import { changeRoleSchema, type ChangeRoleFormValues } from '../schemas/user.schema';
import { useChangeRole } from '../service/user.queries';
import type { AdminUser } from '../types/user.types';

export interface ChangeRoleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser;
}

const ROLE_OPTIONS = USER_ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

/**
 * Đổi vai trò hệ thống — CHỈ vai `admin` được gọi (BE `requireRoles([ADMIN])`
 * trên `PATCH /users/:id/role`, xem `UserDetailDrawer` ẩn nút này với vai
 * khác). Bắt buộc lý do (≥ 10 ký tự) — khớp `reasonSchema`, ghi vào audit log
 * kèm `metadata: { role }`.
 */
export default function ChangeRoleModal({ open, onOpenChange, user }: ChangeRoleModalProps) {
  const changeRole = useChangeRole();
  const form = useZodForm<ChangeRoleFormValues>(changeRoleSchema, {
    defaultValues: { role: user.role, reason: '' },
  });

  // Modal thường KHÔNG unmount giữa hai lần mở (đổi user rồi mở lại) — nạp lại
  // giá trị mặc định mỗi lần mở để không giữ vai trò/lý do của người trước.
  useEffect(() => {
    if (open) form.reset({ role: user.role, reason: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user.id, user.role]);

  return (
    <FormModal<ChangeRoleFormValues>
      confirmLabel="Đổi vai trò"
      form={form}
      open={open}
      size="sm"
      title={`Đổi vai trò — ${user.name}`}
      onConfirm={async (data) => {
        if (!data) return;
        await changeRole.mutateAsync({ id: user.id, role: data.role, reason: data.reason });
      }}
      onOpenChange={onOpenChange}
    >
      <SelectField label="Vai trò mới" name="role" options={ROLE_OPTIONS} required />
      <TextareaField
        label="Lý do"
        maxLength={500}
        name="reason"
        placeholder="Ghi rõ lý do đổi vai trò — sẽ lưu vào nhật ký quản trị"
        required
        rows={3}
        showCount
      />
    </FormModal>
  );
}
