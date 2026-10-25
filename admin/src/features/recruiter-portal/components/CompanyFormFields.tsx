import { memo } from 'react';

import { COMPANY_LIMITS, COMPANY_SIZE_LABEL } from '@/features/recruiter';
import type { CompanySize } from '@/features/recruiter';
import { FileField, SelectField, TextareaField, TextField } from '@/shared/ui';
import type { UploadHandler } from '@/shared/ui';

/** Ô "Quy mô" cho phép chưa chọn (`NONE` — Radix Select không nhận giá trị rỗng) — bỏ qua khi gửi. */
const SIZE_OPTIONS = [
  { value: 'NONE', label: 'Chưa chọn' },
  ...(Object.keys(COMPANY_SIZE_LABEL) as CompanySize[]).map((value) => ({
    value,
    label: COMPANY_SIZE_LABEL[value],
  })),
];
const LOGO_MAX_MB = COMPANY_LIMITS.logoMaxBytes / (1024 * 1024);

export interface CompanyFormFieldsProps {
  /** Tên/MST/website bị khoá (đã duyệt/tạm ngưng) — chỉ vận hành đổi được. */
  identityLocked: boolean;
  onLogoUpload: UploadHandler;
}

/**
 * Các ô hồ sơ doanh nghiệp DÙNG CHUNG cho trang đăng ký và tab Công ty (tên · website · MST · mô tả · ngành · quy mô · logo). Ô bị khoá ghi rõ vì sao ("Liên hệ vận hành để thay đổi") thay
 * vì chỉ mờ đi. Logo: ảnh JPEG/PNG/WebP ≤ 2 MB, tải lên `/assets` scope `COMPANY` (giá trị của ô là id asset — xem `schemas/company.schema.ts`).
 */
const CompanyFormFields = memo(function CompanyFormFields({
  identityLocked,
  onLogoUpload,
}: CompanyFormFieldsProps) {
  const lockNote = identityLocked ? 'Đã khoá sau khi duyệt — liên hệ vận hành để thay đổi.' : undefined;
  return (
    <>
      <TextField
        description={lockNote}
        disabled={identityLocked}
        label="Tên doanh nghiệp"
        maxLength={COMPANY_LIMITS.nameMax}
        name="name"
        required
      />
      <TextField
        description={lockNote}
        disabled={identityLocked}
        label="Website"
        maxLength={COMPANY_LIMITS.websiteMax}
        name="website"
        placeholder="https://congty.vn"
        required
      />
      <TextField
        description={lockNote ?? '10 số (hoặc 10 số-3 số chi nhánh). Không bắt buộc, nhưng giúp xác minh nhanh hơn.'}
        disabled={identityLocked}
        label="Mã số thuế"
        name="taxCode"
      />
      <TextareaField
        label="Giới thiệu"
        maxLength={COMPANY_LIMITS.descriptionMax}
        name="description"
        rows={4}
        showCount
      />
      <TextField label="Ngành" maxLength={COMPANY_LIMITS.industryMax} name="industry" />
      <SelectField label="Quy mô" name="sizeRange" options={SIZE_OPTIONS} />
      <FileField
        accept="image/jpeg,image/png,image/webp"
        description={`Ảnh JPEG, PNG hoặc WebP, tối đa ${LOGO_MAX_MB} MB. Không hỗ trợ SVG.`}
        fileCardVariant="simple"
        label="Logo"
        maxSize={LOGO_MAX_MB}
        name="logo"
        variant="button"
        onUpload={onLogoUpload}
      />
    </>
  );
});

export default CompanyFormFields;
