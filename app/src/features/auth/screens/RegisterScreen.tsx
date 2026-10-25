import { Text, View } from 'react-native';

import { PASSWORD_RULE_HINT } from '@/core/api/auth/password-policy';
import { AuthScreenLayout } from '@/features/auth/components/AuthScreenLayout';
import { useClearErrorOnEdit } from '@/shared/form/useClearErrorOnEdit';
import { useGoToLogin } from '@/features/auth/hooks/useGoToLogin';
import { useRegister } from '@/features/auth/hooks/useRegister';
import { registerSchema, type RegisterFormValues } from '@/features/auth/schemas/auth.schemas';
import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { Button, LinkButton } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';

export function RegisterScreen() {
  const { errorMessage, isPending, register, reset } = useRegister();
  const goToLogin = useGoToLogin();
  const form = useZodForm(registerSchema, {
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  const submit = form.handleSubmit((values) => register(values));
  // Lỗi máy chủ (email đã đăng ký…) không tự tắt — xoá ngay khi người dùng sửa lại.
  useClearErrorOnEdit(form.watch, errorMessage !== null, reset);

  return (
    <AuthScreenLayout subtitle="Điền thông tin để bắt đầu" title="Tạo tài khoản">
      <View className="gap-md">
        {/* Mỗi ô giữa form: bàn phím hiện "Tiếp" và NHẢY sang ô kế (`setFocus`). `submitBehavior="submit"`
            giữ bàn phím mở khi chuyển ô — mặc định `blurAndSubmit` cụp nó xuống rồi mới mở lại. */}
        <FormInput<RegisterFormValues>
          // `words` chứ không phải `none`: đây là TÊN NGƯỜI, viết hoa mỗi từ là
          // đúng quy ước tiếng Việt và đỡ cho người dùng vài lần bấm Shift.
          autoCapitalize="words"
          autoComplete="name"
          control={form.control}
          label="Họ và tên"
          name="name"
          placeholder="Nguyễn Văn A"
          required
          returnKeyType="next"
          submitBehavior="submit"
          textContentType="name"
          onSubmitEditing={() => form.setFocus('email')}
        />

        <FormInput<RegisterFormValues>
          autoCapitalize="none"
          autoComplete="email"
          control={form.control}
          keyboardType="email-address"
          label="Email"
          name="email"
          placeholder="ban@congty.vn"
          required
          returnKeyType="next"
          submitBehavior="submit"
          textContentType="emailAddress"
          onSubmitEditing={() => form.setFocus('password')}
        />

        <FormInput<RegisterFormValues>
          autoCapitalize="none"
          // `new-password` để trình quản lý mật khẩu GỢI Ý một mật khẩu mạnh
          // thay vì điền lại mật khẩu cũ.
          autoComplete="new-password"
          control={form.control}
          label="Mật khẩu"
          message={PASSWORD_RULE_HINT}
          name="password"
          placeholder="Tối thiểu 8 ký tự"
          required
          returnKeyType="next"
          secure
          submitBehavior="submit"
          textContentType="newPassword"
          onSubmitEditing={() => form.setFocus('confirmPassword')}
        />

        <FormInput<RegisterFormValues>
          autoCapitalize="none"
          autoComplete="new-password"
          control={form.control}
          label="Nhập lại mật khẩu"
          name="confirmPassword"
          placeholder="Gõ lại mật khẩu ở trên"
          required
          returnKeyType="done"
          secure
          textContentType="newPassword"
          onSubmitEditing={submit}
        />

        {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}

        <Button fullWidth label="Đăng ký" loading={isPending} onPress={submit} />

        <View className="flex-row items-center justify-center gap-2xs">
          <Text className="text-body-lg text-fg-2">Đã có tài khoản?</Text>
          <LinkButton label="Đăng nhập" onPress={goToLogin} />
        </View>
      </View>
    </AuthScreenLayout>
  );
}
