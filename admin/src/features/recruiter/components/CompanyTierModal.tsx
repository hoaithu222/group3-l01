import { memo } from 'react';

import { FormModal, NumberField, SelectField, TextareaField, useZodForm } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import {
  COMPANY_TIER_LABEL,
  COMPANY_TIERS,
  QUOTA_OVERRIDE_MAX,
  REASON_LIMITS,
} from '../constants/recruiter.constants';
import { companyTierSchema, type CompanyTierFormValues } from '../schemas/company-admin.schema';
import { useCompanyPatch } from '../service/recruiter.queries';
import type { CompanyView } from '../types/company.types';

const TIER_OPTIONS = COMPANY_TIERS.map((value) => ({ value, label: COMPANY_TIER_LABEL[value] }));

export interface CompanyTierModalProps {
  /** Nơi dùng chỉ dựng modal KHI ĐANG MỞ — mỗi lần mở là một lần mount mới nên form luôn nạp đúng giá trị hiện tại, không giữ lý do của lần trước. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: CompanyView;
  /** Hạn mức đang áp (theo gói hoặc ghi đè) — chỉ để nói cho người sửa biết đang ở đâu. */
  currentQuota: number;
}

/**
 * Đổi gói / hạn mức (`recruiter:update` — chỉ admin, `manager` không thấy nút này). Hạn mức ghi đè để TRỐNG = theo gói; lý do bắt buộc (audit
 * `company.admin-update` ghi cả giá trị cũ/mới). Gửi `expectedVersion`: `RES_003` = hồ sơ vừa đổi → hook làm mới, modal giữ mở để xem lại rồi lưu lại.
 */
const CompanyTierModal = memo(function CompanyTierModal({
  open,
  onOpenChange,
  company,
  currentQuota,
}: CompanyTierModalProps) {
  const patch = useCompanyPatch();
  const form = useZodForm<CompanyTierFormValues>(companyTierSchema, {
    defaultValues: { tier: company.tier, offerQuotaOverride: null, reason: '' },
  });

  return (
    <FormModal<CompanyTierFormValues>
      confirmLabel="Lưu gói / hạn mức"
      form={form}
      open={open}
      size="sm"
      title={`Đổi gói / hạn mức — ${company.name}`}
      onConfirm={async (data) => {
        if (!data) return;
        await patch.mutateAsync({
          companyId: company.id,
          expectedVersion: company.version,
          tier: data.tier,
          offerQuotaOverride: data.offerQuotaOverride,
          reason: data.reason,
        });
        onOpenChange(false);
      }}
      onOpenChange={onOpenChange}
    >
      <SelectField label="Gói" name="tier" options={TIER_OPTIONS} required />
      <NumberField
        description={`Để trống = theo gói. Hiện đang áp ${formatNumber(currentQuota)} lời mời/tháng. Tối đa ${formatNumber(QUOTA_OVERRIDE_MAX)}.`}
        label="Hạn mức lời mời/tháng (ghi đè)"
        max={QUOTA_OVERRIDE_MAX}
        min={0}
        name="offerQuotaOverride"
        placeholder="Theo gói"
      />
      <TextareaField
        label="Lý do"
        maxLength={REASON_LIMITS.max}
        name="reason"
        placeholder="Ghi rõ lý do đổi gói/hạn mức — sẽ lưu vào nhật ký quản trị"
        required
        rows={3}
        showCount
      />
    </FormModal>
  );
});

export default CompanyTierModal;
