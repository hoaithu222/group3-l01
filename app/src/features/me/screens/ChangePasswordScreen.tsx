import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { PASSWORD_RULE_HINT } from '@/core/api/auth/password-policy';
import { useClearErrorOnEdit } from '@/shared/form/useClearErrorOnEdit';
import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { IconTile } from '@/shared/ui/icon-tile';
import { FormInput } from '@/shared/ui/input';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

import { CHANGE_PASSWORD_INTRO } from '../constants/change-password.messages';
import { useChangePassword } from '../hooks/useChangePassword';
import {
  changePasswordSchema,
  type ChangePasswordFormValues,
} from '../schemas/change-password.schemas';

/**
 * "Đổi mật khẩu" (p0-01 mục 10) — mở từ `MeSettingsScreen` (`router.push(PATHS.ME_CHANGE_PASSWORD)`),
 * nên có `onBack`. Xử lý sau khi đổi (token mới, đăng xuất các máy khác) nằm ở `useChangePassword`.
 */
export function ChangePasswordScreen() {
  const { changePassword, errorMessage, isPending, reset } = useChangePassword();
  const form = useZodForm(changePasswordSchema, {
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const submit = form.handleSubmit((values) => changePassword(values));
  // Lỗi máy chủ (sai mật khẩu hiện tại…) không tự tắt — xoá ngay khi người dùng sửa lại.
  useClearErrorOnEdit(form.watch, errorMessage !== null, reset);

  return (
    <Screen header={<AppBar title="Đổi mật khẩu" onBack={router.back} />} keyboardAware>
      <View className="gap-md py-xs">
        {/* Ô khoá lớn — cùng icon + tông `warning` với hàng "Đổi mật khẩu" ở Cài đặt (và cùng khuôn đầu màn Xoá tài khoản),
            nên vừa mở màn đã nhận ra đang ở đâu. Trang trí thuần: `IconTile` không nhãn, nghĩa nằm ở câu giới thiệu. */}
        <View className="items-center gap-sm py-xs">
          <IconTile name="lock" size="xl" tone="warning" />
          <Text className="text-center text-body-md text-fg-2">{CHANGE_PASSWORD_INTRO}</Text>
        </View>

        <FormInput<ChangePasswordFormValues>
          autoCapitalize="none"
          autoComplete="current-password"
          control={form.control}
          disabled={isPending}
          label="Mật khẩu hiện tại"
          name="currentPassword"
          placeholder="••••••••"
          required
          returnKeyType="next"
          secure
          submitBehavior="submit"
          textContentType="password"
          onSubmitEditing={() => form.setFocus('newPassword')}
        />

        <FormInput<ChangePasswordFormValues>
          autoCapitalize="none"
          autoComplete="new-password"
          control={form.control}
          disabled={isPending}
          label="Mật khẩu mới"
          message={PASSWORD_RULE_HINT}
          name="newPassword"
          placeholder="Tối thiểu 8 ký tự"
          required
          returnKeyType="next"
          secure
          submitBehavior="submit"
          textContentType="newPassword"
          onSubmitEditing={() => form.setFocus('confirmPassword')}
        />

        <FormInput<ChangePasswordFormValues>
          autoCapitalize="none"
          autoComplete="new-password"
          control={form.control}
          disabled={isPending}
          label="Nhập lại mật khẩu mới"
          name="confirmPassword"
          placeholder="Gõ lại mật khẩu mới ở trên"
          required
          returnKeyType="done"
          secure
          textContentType="newPassword"
          onSubmitEditing={submit}
        />

        {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}

        <Button fullWidth label="Đổi mật khẩu" loading={isPending} onPress={submit} />
      </View>
    </Screen>
  );
}
