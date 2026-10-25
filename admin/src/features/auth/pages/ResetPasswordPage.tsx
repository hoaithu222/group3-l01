import { memo, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { PATHS } from '@/app/config';
import { Button, Callout, Form, FormActions, PasswordField, Text, useZodForm } from '@/shared/ui';
import { AuthPageHeading } from '../components';
import { resetPasswordSchema, type ResetPasswordFormValues } from '../schemas/auth.schema';
import { useResetPassword } from '../service/auth.queries';
import { resolveAuthError } from '../utils/auth-errors';

const ResetPasswordPage = memo(function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { mutate, isPending, isError, error } = useResetPassword();

  // Mã đặt lại đi kèm trong link gửi qua email: /reset-password?token=... Chụp MỘT lần vào state.
  const [token] = useState(() => params.get('token') ?? '');

  /**
   * ⛔ Gỡ token khỏi thanh địa chỉ NGAY sau khi đọc. Token đặt lại mật khẩu là bí mật dùng
   * một lần; để nó nằm trên URL là để nó lọt vào lịch sử trình duyệt, ảnh chụp màn hình /
   * screen-share, log của proxy và header `Referer`. `replace` để nút Back không quay lại URL
   * có token. (Tải lại trang sau đó sẽ mất token — người dùng bấm lại link trong email.)
   */
  useEffect(() => {
    if (params.has('token')) navigate(PATHS.RESET_PASSWORD, { replace: true });
  }, [params, navigate]);

  const form = useZodForm<ResetPasswordFormValues>(resetPasswordSchema, {
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  const handleSubmit = useCallback(
    (values: ResetPasswordFormValues) => {
      if (isPending) return;
      // Ánh xạ TƯỜNG MINH: `confirmPassword` là ràng buộc phía client, không
      // phải dữ liệu của server. API nhận `newPassword`.
      mutate(
        { token: values.token, newPassword: values.password },
        { onSuccess: () => navigate(PATHS.LOGIN, { replace: true }) },
      );
    },
    [isPending, mutate, navigate],
  );

  // Vào thẳng URL mà không có mã thì form vô nghĩa — nói rõ thay vì để người
  // dùng điền xong mới báo lỗi.
  if (!token) {
    return (
      <div className="flex w-full flex-col gap-4">
        <AuthPageHeading eyebrow="Khôi phục truy cập" title="Liên kết không hợp lệ" />
        <Callout intent="error">
          Liên kết đặt lại mật khẩu thiếu mã xác thực hoặc đã hết hạn. Hãy yêu cầu gửi lại.
        </Callout>
        <Button asChild fullWidth variant="primary">
          <Link to={PATHS.FORGOT_PASSWORD}>Gửi lại hướng dẫn</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <AuthPageHeading
        description="Nhập mật khẩu mới cho tài khoản của bạn."
        eyebrow="Sắp xong rồi"
        title="Đặt lại mật khẩu"
      />

      {isError && (
        <Callout intent="error">
          {resolveAuthError(error, 'reset-password')}{' '}
          <Link className="underline" to={PATHS.FORGOT_PASSWORD}>
            Gửi lại hướng dẫn
          </Link>
        </Callout>
      )}

      <Form form={form} onSubmit={handleSubmit}>
        <PasswordField
          autoComplete="new-password"
          autoFocus
          description="Tối thiểu 8 ký tự."
          label="Mật khẩu mới"
          name="password"
          required
        />
        <PasswordField
          autoComplete="new-password"
          label="Nhập lại mật khẩu"
          name="confirmPassword"
          required
        />
        <FormActions>
          <Button fullWidth loading={isPending} type="submit" variant="primary">
            Đặt lại mật khẩu
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

export default ResetPasswordPage;
