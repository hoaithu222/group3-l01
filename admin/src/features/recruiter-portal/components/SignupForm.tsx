import { memo } from 'react';

import { Button, CheckboxField, Form, FormActions, Text, useZodForm } from '@/shared/ui';

import { CAREER_DATA_POLICY_URL } from '../constants/portal.constants';
import { useCompanyAssetUpload } from '../hooks/useCompanyAssetUpload';
import { registerCompanyFormSchema, type RegisterCompanyFormValues } from '../schemas/company.schema';
import type { RegisterCompanyPayload } from '../types/portal.types';
import { toRegisterPayload } from '../utils/company-payload';
import CompanyFormFields from './CompanyFormFields';

const DEFAULTS: RegisterCompanyFormValues = {
  name: '',
  website: '',
  taxCode: '',
  description: '',
  industry: '',
  sizeRange: 'NONE',
  logo: null,
  commitment: false,
};

export interface SignupFormProps {
  /** Gửi `POST /companies` (do TRANG giữ mutation để biết "đang/đã đăng ký" và không tự chuyển vào cổng giữa chừng). Ném lỗi nếu BE từ chối. */
  onRegister: (payload: RegisterCompanyPayload) => Promise<unknown>;
  /** Đang gửi — chống gửi đúp. */
  registering: boolean;
}

/**
 * Form đăng ký doanh nghiệp (admin.md p6-08 §2.8): tên · website · MST (tuỳ chọn) · giới thiệu · ngành · quy mô · logo + checkbox CAM KẾT sử dụng dữ liệu ứng viên đúng mục đích (bắt buộc — điều kiện của
 * giao diện, không có trong DTO của BE). `POST /companies` → doanh nghiệp PENDING, người đăng ký là OWNER; `RECR_004` (trùng tên/MST) và `RECR_001` (đã thuộc doanh nghiệp) do interceptor toast, form giữ nguyên
 * để sửa. Nút gửi bị khoá trong lúc logo còn đang tải (giá trị của ô chỉ có khi tải XONG — gửi giữa chừng sẽ lặng lẽ thiếu logo).
 */
const SignupForm = memo(function SignupForm({ onRegister, registering }: SignupFormProps) {
  const logoUpload = useCompanyAssetUpload('IMAGE');
  const form = useZodForm<RegisterCompanyFormValues>(registerCompanyFormSchema, {
    defaultValues: DEFAULTS,
  });

  const handleSubmit = async (values: RegisterCompanyFormValues) => {
    // Chống gửi đúp: hai lượt cùng tên — lượt sau nhận `RECR_001`/`RECR_004` dù lượt đầu thành công.
    if (registering) return;
    try {
      await onRegister(toRegisterPayload(values));
    } catch {
      // Interceptor đã toast (`RECR_001`/`RECR_004`…); giữ nguyên form để sửa.
    }
  };

  return (
    <Form form={form} onSubmit={handleSubmit}>
      <CompanyFormFields identityLocked={false} onLogoUpload={logoUpload.onUpload} />
      <CheckboxField
        checkboxLabel="Tôi cam kết chỉ dùng dữ liệu ứng viên cho mục đích tuyển dụng, không sao chép, chia sẻ hay bán lại."
        name="commitment"
        required
      />
      {CAREER_DATA_POLICY_URL ? (
        <Text size="tiny" skin="muted">
          Xem{' '}
          <a
            className="text-link hover:underline"
            href={CAREER_DATA_POLICY_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            chính sách sử dụng dữ liệu ứng viên
          </a>
          .
        </Text>
      ) : null}
      <FormActions>
        <Button
          disabled={logoUpload.uploading}
          fullWidth
          loading={form.formState.isSubmitting}
          type="submit"
          variant="primary"
        >
          Gửi đăng ký
        </Button>
      </FormActions>
    </Form>
  );
});

export default SignupForm;
