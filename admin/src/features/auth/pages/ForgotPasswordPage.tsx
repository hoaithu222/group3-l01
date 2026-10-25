import { memo, useCallback } from 'react';
import { Link } from 'react-router-dom';

import { PATHS } from '@/app/config';
import { Button, Callout, EmailField, Form, FormActions, Text, useZodForm } from '@/shared/ui';
import { AuthPageHeading } from '../components';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '../schemas/auth.schema';
import { useForgotPassword } from '../service/auth.queries';
import { resolveAuthError } from '../utils/auth-errors';

const DEFAULTS: ForgotPasswordFormValues = { email: '' };

const ForgotPasswordPage = memo(function ForgotPasswordPage() {
  const { mutate, isPending, isError, isSuccess, error } = useForgotPassword();
  const form = useZodForm<ForgotPasswordFormValues>(forgotPasswordSchema, {
    defaultValues: DEFAULTS,
  });

  const handleSubmit = useCallback(
    (values: ForgotPasswordFormValues) => {
      // Chống gửi đúp — mỗi lượt gửi là một email và một lượt tính vào giới hạn tốc độ.
      if (isPending) return;
      mutate(values);
    },
    [isPending, mutate],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <AuthPageHeading
        description="Nhập email đã đăng ký, chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu."
        eyebrow="Khôi phục truy cập"
        title="Quên mật khẩu"
      />

      {/*
        Thành công thì báo CHUNG CHUNG, không xác nhận email có tồn tại hay
        không — nói ra là để lộ danh sách email đã đăng ký.
      */}
      {isSuccess && (
        <Callout intent="success">
          Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi tới hộp thư.
        </Callout>
      )}

      {/*
        Lỗi cũng phải HIỆN: form đã tắt toast (`skipErrorToast`), nên nếu bỏ trống chỗ này thì
        bị giới hạn tốc độ (429) hay đứt mạng là người dùng bấm gửi mà không thấy gì xảy ra.
        Câu lỗi không bao giờ nói email có tồn tại hay không (`resolveAuthError`).
      */}
      {isError && <Callout intent="error">{resolveAuthError(error, 'forgot-password')}</Callout>}

      <Form form={form} onSubmit={handleSubmit}>
        <EmailField autoFocus label="Email" name="email" placeholder="ban@congty.vn" required />
        <FormActions>
          <Button fullWidth loading={isPending} type="submit" variant="primary">
            Gửi hướng dẫn
          </Button>
        </FormActions>
      </Form>

      <Text className="text-center" size="tiny" skin="muted">
        <Link className="text-link hover:underline" to={PATHS.LOGIN}>
          Quay lại đăng nhập
        </Link>
      </Text>
    </div>
  );
});

export default ForgotPasswordPage;
