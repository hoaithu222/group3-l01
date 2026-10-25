import { View } from 'react-native';

import { useClearErrorOnEdit } from '@/shared/form/useClearErrorOnEdit';
import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';

import { useUnlockForm } from '../../hooks/useUnlockForm';
import { loginSchema, type LoginFormValues } from '../../schemas/auth.schemas';

export interface AppUnlockFormProps {
  /** Email của tài khoản đang bị khoá — điền sẵn nhưng vẫn SỬA ĐƯỢC (đổi tài khoản). */
  defaultEmail: string;
}

/**
 * Ô mật khẩu của lớp phủ khoá — nhánh dự phòng khi sinh trắc học/mã máy không
 * dùng được, hoặc mất mạng (lúc đó nhánh NÀY báo lỗi mạng, còn sinh trắc/mã
 * máy vẫn mở được — `app.md` BIO-18).
 */
export function AppUnlockForm({ defaultEmail }: AppUnlockFormProps) {
  const { errorMessage, isPending, reset, submit } = useUnlockForm();
  const form = useZodForm(loginSchema, {
    defaultValues: { email: defaultEmail, password: '' },
  });

  const onSubmit = form.handleSubmit((values: LoginFormValues) => submit(values));
  // Lỗi máy chủ (sai mật khẩu, mất mạng) không tự tắt — xoá ngay khi người dùng sửa lại ô nhập.
  useClearErrorOnEdit(form.watch, errorMessage !== null, reset);

  return (
    <View className="gap-md">
      <FormInput<LoginFormValues>
        autoCapitalize="none"
        autoComplete="email"
        control={form.control}
        keyboardType="email-address"
        label="Email"
        name="email"
        placeholder="ban@congty.vn"
        // "Tiếp" NHẢY sang ô mật khẩu; `submit` giữ bàn phím mở (mặc định `blurAndSubmit` cụp xuống).
        returnKeyType="next"
        submitBehavior="submit"
        textContentType="emailAddress"
        onSubmitEditing={() => form.setFocus('password')}
      />

      <FormInput<LoginFormValues>
        autoCapitalize="none"
        autoComplete="current-password"
        control={form.control}
        label="Mật khẩu"
        name="password"
        placeholder="••••••••"
        returnKeyType="done"
        secure
        textContentType="password"
        onSubmitEditing={onSubmit}
      />

      {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}

      <Button fullWidth label="Mở khoá" loading={isPending} onPress={onSubmit} />
    </View>
  );
}
