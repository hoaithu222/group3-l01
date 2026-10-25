import { memo, useState } from 'react';
import type { AxiosError } from 'axios';

import { extractErrorCode } from '@/core/api/error.handler';
import type { CompanyView } from '@/features/recruiter';
import { Avatar, Button, Callout, Form, FormActions, useZodForm } from '@/shared/ui';
import { showToast } from '@/shared/utils/toast.utils';

import { PORTAL_ERROR } from '../constants/portal.constants';
import { useCompanyAssetUpload } from '../hooks/useCompanyAssetUpload';
import { companyProfileFormSchema, type CompanyProfileFormValues } from '../schemas/company.schema';
import { useResubmitCompany, useUpdateCompany } from '../service/company.queries';
import { hasChanges, toProfileDefaults, toUpdatePayload } from '../utils/company-payload';
import CompanyFormFields from './CompanyFormFields';

export interface CompanyProfileFormProps {
  company: CompanyView;
  /** Chỉ OWNER sửa được hồ sơ và gửi duyệt lại. */
  isOwner: boolean;
}

/**
 * Form hồ sơ doanh nghiệp (admin.md p6-08 §2.7): tên/MST/website KHOÁ khi đã duyệt (ghi "Liên hệ vận hành để thay đổi"), mô tả · ngành · quy mô · logo sửa được. `expectedVersion` gửi kèm mỗi lần lưu;
 * `RES_003` = người khác vừa sửa → banner "Dữ liệu đã thay đổi", GIỮ nguyên nội dung đang nhập để so rồi lưu lại. Doanh nghiệp bị TỪ CHỐI (OWNER): "Gửi duyệt lại" (lưu thay đổi nếu có rồi chuyển
 * về chờ duyệt). Thành viên không phải OWNER thấy hồ sơ chỉ đọc.
 */
const CompanyProfileForm = memo(function CompanyProfileForm({ company, isOwner }: CompanyProfileFormProps) {
  const update = useUpdateCompany();
  const resubmit = useResubmitCompany();
  const logoUpload = useCompanyAssetUpload('IMAGE');
  const [conflict, setConflict] = useState(false);
  const identityLocked = company.status === 'APPROVED' || company.status === 'SUSPENDED';
  const form = useZodForm<CompanyProfileFormValues>(companyProfileFormSchema, {
    defaultValues: toProfileDefaults(company),
  });

  /** Lưu thay đổi (nếu có). `true` = thành công hoặc không có gì để lưu; `false` = lỗi (đã báo). */
  const save = async (values: CompanyProfileFormValues): Promise<boolean> => {
    setConflict(false);
    const payload = toUpdatePayload(values, company, identityLocked);
    if (!hasChanges(payload)) return true;
    try {
      await update.mutateAsync(payload);
      form.reset({ ...values, logo: null });
      return true;
    } catch (err) {
      if (extractErrorCode(err as AxiosError) === PORTAL_ERROR.versionConflict) setConflict(true);
      return false;
    }
  };

  const handleSubmit = async (values: CompanyProfileFormValues) => {
    // Không có gì đổi: nói rõ thay vì im lặng (và không tốn một lượt PATCH/phiên bản).
    if (!hasChanges(toUpdatePayload(values, company, identityLocked))) {
      showToast('info', 'Hồ sơ không có thay đổi để lưu');
      return;
    }
    await save(values);
  };

  const handleResubmit = form.handleSubmit(async (values) => {
    if (await save(values)) await resubmit.mutateAsync(company.id).catch(() => undefined);
  });

  return (
    <div className="flex flex-col gap-3">
      {company.logoUrl ? (
        <div className="flex items-center gap-3">
          <Avatar name={company.name} shape="square" size="lg" src={company.logoUrl} />
          <span className="text-caption-12 text-fg-3">Logo hiện tại</span>
        </div>
      ) : null}
      {conflict ? (
        <Callout
          description="Người khác vừa sửa hồ sơ này. Nội dung bạn nhập vẫn giữ nguyên — kiểm tra lại rồi lưu."
          intent="warning"
          title="Dữ liệu đã thay đổi"
        />
      ) : null}
      <Form form={form} readOnly={!isOwner} onSubmit={handleSubmit}>
        <CompanyFormFields identityLocked={identityLocked} onLogoUpload={logoUpload.onUpload} />
        {isOwner ? (
          <FormActions>
            <Button
              disabled={logoUpload.uploading}
              loading={form.formState.isSubmitting}
              size="md"
              type="submit"
              variant={company.status === 'REJECTED' ? 'stroke' : 'primary'}
            >
              Lưu hồ sơ
            </Button>
            {company.status === 'REJECTED' ? (
              <Button
                disabled={logoUpload.uploading}
                loading={resubmit.isPending}
                size="md"
                type="button"
                variant="primary"
                onClick={() => void handleResubmit()}
              >
                Gửi duyệt lại
              </Button>
            ) : null}
          </FormActions>
        ) : null}
      </Form>
    </div>
  );
});

export default CompanyProfileForm;
