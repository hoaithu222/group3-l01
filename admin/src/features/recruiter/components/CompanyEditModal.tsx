import { memo } from 'react';

import { FormModal, TextareaField, TextField, useZodForm } from '@/shared/ui';

import { COMPANY_LIMITS, REASON_LIMITS } from '../constants/recruiter.constants';
import { companyEditSchema, type CompanyEditFormValues } from '../schemas/company-admin.schema';
import { useCompanyPatch } from '../service/recruiter.queries';
import type { CompanyView } from '../types/company.types';

export interface CompanyEditModalProps {
  /** Nơi dùng chỉ dựng modal KHI ĐANG MỞ — mỗi lần mở là một lần mount mới nên form luôn nạp đúng giá trị hiện tại, không giữ lý do của lần trước. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: CompanyView;
}

const initial = (c: CompanyView): CompanyEditFormValues => ({
  name: c.name,
  website: c.website,
  taxCode: c.taxCode ?? '',
  reason: '',
});

/**
 * Sửa tên / MST / website (`recruiter:update`) — vận hành sửa được cả khi đã duyệt (HR bị khoá, phải "liên hệ vận hành"). Chỉ gửi trường ĐỔI để nhật ký
 * `company.admin-update` ghi đúng những gì đổi; MST để trống = xoá MST (`null`). Trùng tên/MST với doanh nghiệp khác → `RECR_004` (interceptor toast).
 */
const CompanyEditModal = memo(function CompanyEditModal({
  open,
  onOpenChange,
  company,
}: CompanyEditModalProps) {
  const patch = useCompanyPatch();
  const form = useZodForm<CompanyEditFormValues>(companyEditSchema, {
    defaultValues: initial(company),
  });

  return (
    <FormModal<CompanyEditFormValues>
      confirmLabel="Lưu thông tin"
      form={form}
      open={open}
      size="sm"
      title={`Sửa thông tin — ${company.name}`}
      onConfirm={async (data) => {
        if (!data) return;
        const nextTax = data.taxCode === '' ? null : data.taxCode;
        const changed = {
          ...(data.name !== company.name && { name: data.name }),
          ...(data.website !== company.website && { website: data.website }),
          ...(nextTax !== company.taxCode && { taxCode: nextTax }),
        };
        // Không có gì đổi → không tốn một lượt PATCH (và không ghi nhật ký rỗng).
        if (Object.keys(changed).length > 0) {
          await patch.mutateAsync({
            companyId: company.id,
            expectedVersion: company.version,
            reason: data.reason,
            ...changed,
          });
        }
        onOpenChange(false);
      }}
      onOpenChange={onOpenChange}
    >
      <TextField label="Tên doanh nghiệp" maxLength={COMPANY_LIMITS.nameMax} name="name" required />
      <TextField
        label="Website"
        maxLength={COMPANY_LIMITS.websiteMax}
        name="website"
        placeholder="https://congty.vn"
        required
      />
      <TextField
        description="10 số (hoặc 10 số-3 số chi nhánh). Để trống nếu chưa có."
        label="Mã số thuế"
        name="taxCode"
      />
      <TextareaField
        label="Lý do"
        maxLength={REASON_LIMITS.max}
        name="reason"
        placeholder="Ghi rõ lý do sửa — sẽ lưu vào nhật ký quản trị"
        required
        rows={3}
        showCount
      />
    </FormModal>
  );
});

export default CompanyEditModal;
