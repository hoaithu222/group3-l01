import { memo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { PATHS } from '@/app/config';
import { selectEndReason, useAuthStore } from '@/app/store';
import {
  Button,
  Callout,
  EmailField,
  Form,
  FormActions,
  PasswordField,
  Text,
  useZodForm,
} from '@/shared/ui';
import { AuthPageHeading } from '../components';
import { SESSION_END_MESSAGES } from '../constants/session-end-messages';
import { loginSchema, type LoginFormValues } from '../schemas/auth.schema';
import { useLogin } from '../service/auth.queries';
import { resolveAuthError } from '../utils/auth-errors';
import { sanitizeRedirectPath } from '../utils/redirect';

const DEFAULTS: LoginFormValues = { email: '', password: '' };

const LoginPage = memo(function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mutate, isPending, isError, error } = useLogin();
  const endReason = useAuthStore(selectEndReason);
  const form = useZodForm<LoginFormValues>(loginSchema, { defaultValues: DEFAULTS });
  const { resetField, setFocus } = form;

  // Quay lại đúng trang người dùng định vào trước khi bị đá ra đăng nhập — CHỈ nhận đường dẫn
  // nội bộ (`sanitizeRedirectPath`); `state` không phải thứ để tin tuyệt đối.
  const from = sanitizeRedirectPath((location.state as { from?: unknown } | null)?.from);

  const handleSubmit = useCallback(
    (values: LoginFormValues) => {
      // Chống gửi đúp: Enter lần hai / nhấp đúp lúc lượt trước còn bay sẽ sinh hai lượt đăng
      // nhập (hai nonce, hai phiên). Nút đã khoá khi `isPending`, nhưng Enter trong ô nhập
      // vẫn kích `submit` ở một số trình duyệt — chặn ở đây cho chắc.
      if (isPending) return;
      mutate(values, {
        onSuccess: () => navigate(from, { replace: true }),
        // Sai thông tin: xoá ô mật khẩu và đưa con trỏ về đó để gõ lại ngay. Email giữ nguyên.
        onError: () => {
          resetField('password');
          setFocus('password');
        },
      });
    },
    [isPending, mutate, navigate, from, resetField, setFocus],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <AuthPageHeading
        description="Nhập email và mật khẩu để tiếp tục."
        eyebrow="Chào mừng trở lại"
        title="Đăng nhập"
      />

      {isError && <Callout intent="error">{resolveAuthError(error, 'login')}</Callout>}

      {/* Phiên cũ kết thúc không phải do người dùng bấm đăng xuất (hết hạn, bị thu hồi, khoá). */}
      {!isError && !isPending && endReason && (
        <Callout intent="warning">{SESSION_END_MESSAGES[endReason]}</Callout>
      )}

      <Form form={form} onSubmit={handleSubmit}>
        <EmailField autoFocus label="Email" name="email" placeholder="ban@congty.vn" required />
        <PasswordField
          autoComplete="current-password"
          label="Mật khẩu"
          name="password"
          placeholder="••••••"
          required
        />

        <div className="flex justify-end">
          <Link className="text-caption-12 text-link hover:underline" to={PATHS.FORGOT_PASSWORD}>
            Quên mật khẩu?
          </Link>
        </div>

        <FormActions>
          <Button fullWidth loading={isPending} type="submit" variant="primary">
            Đăng nhập
          </Button>
        </FormActions>
      </Form>

      <Text className="text-center" size="tiny" skin="muted">
        Chưa có tài khoản?{' '}
        <Link className="text-link hover:underline" to={PATHS.REGISTER}>
          Đăng ký
        </Link>
        {' · '}
        {/* p6-08: nhà tuyển dụng tự đăng ký doanh nghiệp (cần đăng nhập trước — `AuthGuard` đưa qua đây rồi quay lại). */}
        <Link className="text-link hover:underline" to={PATHS.RECRUITER_SIGNUP}>
          Đăng ký nhà tuyển dụng
        </Link>
      </Text>
    </div>
  );
});

export default LoginPage;
