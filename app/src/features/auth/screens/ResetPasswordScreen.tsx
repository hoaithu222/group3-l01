import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { PASSWORD_RULE_HINT } from '@/core/api/auth/password-policy';
import { AuthScreenLayout } from '@/features/auth/components/AuthScreenLayout';
import { useClearErrorOnEdit } from '@/shared/form/useClearErrorOnEdit';
import { useGoToLogin } from '@/features/auth/hooks/useGoToLogin';
import { useResetPassword } from '@/features/auth/hooks/usePasswordRecovery';
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from '@/features/auth/schemas/auth.schemas';
import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { Button, LinkButton } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';
import { PATHS } from '@/shell/config';

export function ResetPasswordScreen() {
  /**
   * Mã đặt lại có thể tới theo HAI đường, và cả hai đều phải chạy:
   *
   *  1. **Deep link** — người dùng bấm liên kết trong e-mail, hệ điều hành mở
   *     app tại `baseapp://reset-password?token=abc`. Expo Router đưa `token`
   *     vào đây. Đây là đường mượt nhất và nên là đường chính.
   *
   *  2. **Nhập tay** — người dùng đọc e-mail trên máy tính, hoặc deep link
   *     không hoạt động (app cài từ file APK, e-mail bị chuyển tiếp, ứng dụng
   *     mail mở liên kết trong trình duyệt nội bộ của nó). Lúc đó ô nhập mã là
   *     đường DUY NHẤT — bỏ nó đi là một phần người dùng bị kẹt hoàn toàn.
   */
  const params = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const goToLogin = useGoToLogin();
  const { errorMessage, isPending, reset, resetPassword } = useResetPassword();

  const form = useZodForm(resetPasswordSchema, {
    defaultValues: { token: params.token ?? '', password: '', confirmPassword: '' },
  });

  const submit = form.handleSubmit((values) => resetPassword(values));
  useClearErrorOnEdit(form.watch, errorMessage !== null, reset);

  return (
    <AuthScreenLayout
      subtitle="Nhập mã trong e-mail và mật khẩu mới của bạn."
      title="Đặt lại mật khẩu"
    >
      <View className="gap-md">
        {/* Tới bằng deep link thì mã đã điền sẵn — ẩn ô đi cho đỡ rối, vì lúc
            đó nó chỉ là một chuỗi vô nghĩa với người dùng. */}
        {params.token ? null : (
          <FormInput<ResetPasswordFormValues>
            autoCapitalize="none"
            control={form.control}
            label="Mã đặt lại"
            name="token"
            placeholder="Dán mã từ e-mail"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => form.setFocus('password')}
          />
        )}

        <FormInput<ResetPasswordFormValues>
          autoCapitalize="none"
          autoComplete="new-password"
          control={form.control}
          label="Mật khẩu mới"
          message={PASSWORD_RULE_HINT}
          name="password"
          placeholder="Tối thiểu 8 ký tự"
          returnKeyType="next"
          secure
          submitBehavior="submit"
          textContentType="newPassword"
          onSubmitEditing={() => form.setFocus('confirmPassword')}
        />

        <FormInput<ResetPasswordFormValues>
          autoCapitalize="none"
          autoComplete="new-password"
          control={form.control}
          label="Nhập lại mật khẩu mới"
          name="confirmPassword"
          placeholder="Gõ lại mật khẩu mới ở trên"
          returnKeyType="done"
          secure
          textContentType="newPassword"
          onSubmitEditing={submit}
        />

        {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}

        <Button fullWidth label="Đổi mật khẩu" loading={isPending} onPress={submit} />

        {/* Mã hết hạn/đã dùng: ô mã bị ẩn khi tới bằng deep link, nên phải có lối xin mã mới ngay tại
            đây — `dismissTo` lùi về "Quên mật khẩu" nếu đã ở trong ngăn xếp, không thì thay màn này.

            ⚠️ Mỗi `LinkButton` cần RIÊNG một `<View className="items-center">` bọc ngoài — `pressable` của nó
            mang cứng `self-start` (`link-button.styles.ts`), luôn thắng `items-center` của `View` cha, nên đặt
            thẳng vào đây thì liên kết dạt sang trái thay vì nằm giữa. Xem `RestoreAccountScreen.tsx`. */}
        <View className="items-center gap-lg">
          <View className="items-center">
            <LinkButton
              label="Yêu cầu mã mới"
              onPress={() => router.dismissTo(PATHS.FORGOT_PASSWORD)}
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
