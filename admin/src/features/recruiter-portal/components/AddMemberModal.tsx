import { memo } from 'react';

import { MEMBER_ROLE_LABEL } from '@/features/recruiter';
import type { MemberRole } from '@/features/recruiter';
import { EmailField, FormModal, SelectField, useZodForm } from '@/shared/ui';

import { addMemberFormSchema, type AddMemberFormValues } from '../schemas/member.schema';
import { useAddMember } from '../service/company.queries';

const ROLE_OPTIONS = (['RECRUITER', 'OWNER'] as MemberRole[]).map((value) => ({
  value,
  label: MEMBER_ROLE_LABEL[value],
}));
const EMPTY: AddMemberFormValues = { email: '', role: 'RECRUITER' };

export interface AddMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
}

/**
 * Thêm thành viên (OWNER, doanh nghiệp đã duyệt — admin.md p6-08 §2.7): email của người ĐÃ có tài khoản + vai trò. `RECR_011` (người đó đã thuộc doanh nghiệp khác) và `USER_001` (chưa có tài khoản)
 * do interceptor toast; modal giữ mở để đổi email. Chỉ dựng modal KHI ĐANG MỞ (nơi dùng) nên form luôn sạch mỗi lần mở.
 */
const AddMemberModal = memo(function AddMemberModal({ open, onOpenChange, companyId }: AddMemberModalProps) {
  const add = useAddMember();
  const form = useZodForm<AddMemberFormValues>(addMemberFormSchema, { defaultValues: EMPTY });

  return (
    <FormModal<AddMemberFormValues>
      confirmLabel="Thêm thành viên"
      form={form}
      open={open}
      size="sm"
      title="Thêm thành viên"
      onConfirm={async (data) => {
        if (!data) return;
        await add.mutateAsync({ companyId, email: data.email, role: data.role });
      }}
      onOpenChange={onOpenChange}
    >
      <EmailField
        description="Người này cần đã có tài khoản Super App và chưa thuộc doanh nghiệp nào."
        label="Email"
        name="email"
        placeholder="hr@congty.vn"
        required
      />
      <SelectField label="Vai trò" name="role" options={ROLE_OPTIONS} required />
    </FormModal>
  );
});

export default AddMemberModal;
