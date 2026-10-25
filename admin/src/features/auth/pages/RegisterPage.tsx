import { memo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PATHS } from '@/app/config';
import {
  Button,
  Callout,
  EmailField,
  Form,
  FormActions,
  PasswordField,
  Text,
  TextField,
  useZodForm,
} from '@/shared/ui';
import { AuthPageHeading } from '../components';
import { registerSchema, type RegisterFormValues } from '../schemas/auth.schema';
import { useRegister } from '../service/auth.queries';
import { resolveAuthError } from '../utils/auth-errors';

const DEFAULTS: RegisterFormValues = { email: '', name: '', password: '', confirmPassword: '' };

const RegisterPage = memo(function RegisterPage() {
  const navigate = useNavigate();
  const { mutate, isPending, isError, error } = useRegister();
  const form = useZodForm<RegisterFormValues>(registerSchema, { defaultValues: DEFAULTS });

  const handleSubmit = useCallback(
    (values: RegisterFormValues) => {
      // Chống gửi đúp — hai lượt đăng ký cùng email: lượt sau nhận 409 dù lượt đầu thành công.
      if (isPending) return;
      // Bỏ `confirmPassword` — trường chỉ để đối chiếu ở client, gửi lên là thừa.
      mutate(
        { email: values.email, name: values.name, password: values.password },
        { onSuccess: () => navigate(PATHS.LOGIN, { replace: true }) },
      );
    },
    [isPending, mutate, navigate],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <AuthPageHeading
        description="Điền thông tin bên dưới để bắt đầu."
        eyebrow="Bắt đầu hành trình"
        title="Tạo tài khoản"
      />

      {isError && <Callout intent="error">{resolveAuthError(error, 'register')}</Callout>}

      <Form form={form} onSubmit={handleSubmit}>
        <TextField autoFocus label="Họ tên" name="name" placeholder="Nguyễn Văn A" required />
        <EmailField label="Email" name="email" placeholder="ban@congty.vn" required />
        <PasswordField
          autoComplete="new-password"
          label="Mật khẩu"
          name="password"
          placeholder="Tối thiểu 8 ký tự"
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
            Đăng ký
          </Button>
        </FormActions>
      </Form>

      <Text className="text-center" size="tiny" skin="muted">
        Đã có tài khoản?{' '}
        <Link className="text-link hover:underline" to={PATHS.LOGIN}>
          Đăng nhập
        </Link>
      </Text>
    </div>
  );
});

export default RegisterPage;
