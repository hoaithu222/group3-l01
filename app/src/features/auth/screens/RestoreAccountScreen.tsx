import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { AuthScreenLayout } from '@/features/auth/components/AuthScreenLayout';
import { useClearErrorOnEdit } from '@/shared/form/useClearErrorOnEdit';
import { useGoToLogin } from '@/features/auth/hooks/useGoToLogin';
import { useRestoreAccount } from '@/features/auth/hooks/useRestoreAccount';
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas/auth.schemas';
import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { Button, LinkButton } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';

import {
  RESTORE_ACCOUNT_ALERT_TITLE,
  RESTORE_ACCOUNT_SUBTITLE,
  RESTORE_ACCOUNT_TITLE,
  restoreAccountNotice,
} from '../constants/restore-account.messages';

/** Tham số route có thể lặp (`?email=a&email=b`) và thành mảng — lấy phần tử đầu, bỏ chuỗi rỗng. */
function firstParam(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first ? first : undefined;
}

/**
 * "Khôi phục tài khoản" (p0-01) — huỷ yêu cầu xoá để dùng lại tài khoản.
 *
 * Tới đây từ hai đường, cùng một màn: đăng nhập bị `AUTH_012` (`email` đã nhập được điền sẵn) và
 * ngay sau khi vừa yêu cầu xoá (`email` + `until` = mốc xoá). Cả hai tham số chỉ để HIỂN THỊ/điền
 * sẵn — không có bí mật nào đi qua URL; mật khẩu luôn phải gõ lại.
 */
export function RestoreAccountScreen() {
  const params = useLocalSearchParams<{ email?: string; until?: string }>();
  const goToLogin = useGoToLogin();
  const { errorMessage, isPending, reset, restore } = useRestoreAccount();

  const form = useZodForm(loginSchema, {
    defaultValues: { email: firstParam(params.email) ?? '', password: '' },
  });

  const submit = form.handleSubmit((values) => restore(values));
  useClearErrorOnEdit(form.watch, errorMessage !== null, reset);

  return (
    <AuthScreenLayout subtitle={RESTORE_ACCOUNT_SUBTITLE} title={RESTORE_ACCOUNT_TITLE}>
      <View className="gap-md">
        <Alert
          description={restoreAccountNotice(firstParam(params.until))}
          title={RESTORE_ACCOUNT_ALERT_TITLE}
          tone="warning"
        />

        <FormInput<LoginFormValues>
          autoCapitalize="none"
          autoComplete="email"
          control={form.control}
          keyboardType="email-address"
          label="Email"
          name="email"
          placeholder="ban@congty.vn"
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
          onSubmitEditing={submit}
        />

        {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}

        <Button fullWidth label="Huỷ yêu cầu xoá" loading={isPending} onPress={submit} />

        <View className="items-center">
          <LinkButton label="Quay lại đăng nhập" onPress={goToLogin} />
        </View>
      </View>
    </AuthScreenLayout>
  );
}
