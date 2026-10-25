import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { AuthScreenLayout } from '@/features/auth/components/AuthScreenLayout';
import { useClearErrorOnEdit } from '@/shared/form/useClearErrorOnEdit';
import { useGoToLogin } from '@/features/auth/hooks/useGoToLogin';
import { useForgotPassword } from '@/features/auth/hooks/usePasswordRecovery';
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from '@/features/auth/schemas/auth.schemas';
import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { Button, LinkButton } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';
import { PATHS } from '@/shell/config';

import {
  FORGOT_PASSWORD_SENT_MESSAGE,
  FORGOT_PASSWORD_SENT_TITLE,
} from '../constants/auth.messages';

export function ForgotPasswordScreen() {
  const router = useRouter();
  const goToLogin = useGoToLogin();
  const { errorMessage, isPending, isSuccess, requestReset, reset } = useForgotPassword();
  const form = useZodForm(forgotPasswordSchema, { defaultValues: { email: '' } });

  const submit = form.handleSubmit((values) => requestReset(values));
  // Đổi email sau khi đã gửi thì câu "đã gửi hướng dẫn" nói về địa chỉ CŨ — gỡ nó đi, đừng để lệch.
  useClearErrorOnEdit(form.watch, isSuccess || errorMessage !== null, reset);

  return (
    <AuthScreenLayout
      subtitle="Nhập email đã đăng ký, chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu."
      title="Quên mật khẩu"
    >
      <View className="gap-md">
        <FormInput<ForgotPasswordFormValues>
          autoCapitalize="none"
          autoComplete="email"
          control={form.control}
          keyboardType="email-address"
          label="Email"
          name="email"
          placeholder="ban@congty.vn"
          returnKeyType="send"
          textContentType="emailAddress"
          onSubmitEditing={submit}
        />

        {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}

        {/* Câu TRUNG TÍNH và ĐỨNG LẠI (không toast): đây là hướng dẫn bước kế tiếp, và nó không được
            xác nhận email có tài khoản hay không — xem `FORGOT_PASSWORD_SENT_MESSAGE`. */}
        {isSuccess ? (
          <Alert
            description={FORGOT_PASSWORD_SENT_MESSAGE}
            title={FORGOT_PASSWORD_SENT_TITLE}
            tone="success"
          />
        ) : null}

        <Button
          fullWidth
          label={isSuccess ? 'Gửi lại hướng dẫn' : 'Gửi hướng dẫn'}
          loading={isPending}
          onPress={submit}
        />

        {/* Luôn hiện, không chỉ sau khi gửi: người dùng có thể đã có mã từ lượt trước. Không có deep
            link (app cài từ APK, mail mở trong trình duyệt) thì nhập mã tay là đường DUY NHẤT.

            ⚠️ Mỗi `LinkButton` cần RIÊNG một `<View className="items-center">` bọc ngoài — `pressable` của nó
            mang cứng `self-start` (`link-button.styles.ts`), luôn thắng `items-center` của `View` cha, nên đặt
            thẳng vào đây thì liên kết dạt sang trái thay vì nằm giữa. Xem `RestoreAccountScreen.tsx`. */}
        <View className="items-center gap-lg">
          <View className="items-center">
            <LinkButton
              label="Đã có mã? Nhập mã đặt lại mật khẩu"
              onPress={() => router.push(PATHS.RESET_PASSWORD)}
            />
          </View>
          <View className="items-center">
            <LinkButton label="Quay lại đăng nhập" onPress={goToLogin} />
          </View>
        </View>
      </View>
    </AuthScreenLayout>
  );
}
