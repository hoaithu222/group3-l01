import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { PATHS } from '@/shell/config';
import { AuthHeroProvider } from '@/features/auth/components/AuthHeroProvider';
import { AuthScreenLayout } from '@/features/auth/components/AuthScreenLayout';
import { BiometricLoginButton } from '@/features/auth/components/BiometricLoginButton';
import { GoogleLoginButton } from '@/features/auth/components/GoogleLoginButton';
import { ReadySheen } from '@/features/auth/components/ReadySheen';
import { useAutoBiometricPrompt } from '@/features/auth/hooks/useAutoBiometricPrompt';
import { useBiometricLogin } from '@/features/auth/hooks/useBiometricLogin';
import { useGoogleLogin } from '@/features/auth/hooks/useGoogleLogin';
import { useClearErrorOnEdit } from '@/shared/form/useClearErrorOnEdit';
import { useLogin } from '@/features/auth/hooks/useLogin';
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas/auth.schemas';
import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { Button, LinkButton } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';

export function LoginScreen() {
  const router = useRouter();
  const { errorMessage, isPending, login, reset } = useLogin();
  const google = useGoogleLogin();
  const form = useZodForm(loginSchema, {
    defaultValues: { email: '', password: '' },
  });

  /**
   * `available` cần biết email đang gõ dở để so với email đã gắn (`app.md` §4:
   * "ô email trống hoặc trùng email đã gắn"). `watch` khiến cả màn vẽ lại mỗi
   * ký tự gõ — chấp nhận được ở đây vì màn Đăng nhập chỉ có hai ô nhập.
   */
  const typedEmail = form.watch('email');
  const typedPassword = form.watch('password');
  const biometric = useBiometricLogin(typedEmail);
  const { claim: claimAutoBiometricPrompt } = useAutoBiometricPrompt(
    biometric.available,
    biometric.trigger,
  );

  const submit = form.handleSubmit((values) => login(values));

  /** Ô mật khẩu đang nhận bàn phím ⇒ quyển sách đầu màn GẬP lại ("che mắt"), rời ô thì mở ra (`AuthHeroProvider`). */
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleBiometricPress = () => {
    // Giành "lượt" trước bộ đếm tự động — bấm tay ngay trước khi hộp quét TỰ
    // ĐỘNG kịp bật sẽ không mở thêm một hộp quét thứ hai.
    claimAutoBiometricPrompt();
    void biometric.trigger();
  };

  // Lỗi mật khẩu, lỗi sinh trắc học và lỗi Google cùng đổ vào MỘT dải `Alert` duy nhất —
  // cả ba đều là lỗi "thuộc về form đăng nhập", không phải ba luồng riêng.
  const displayError = errorMessage ?? biometric.errorMessage ?? google.errorMessage;

  // Lỗi máy chủ không tự tắt — xoá ngay khi người dùng sửa lại ô nhập, đừng để báo điều không còn đúng.
  const { clearError: clearBiometricError } = biometric;
  const { reset: resetGoogle } = google;
  const clearErrors = useCallback(() => {
    reset();
    clearBiometricError();
    resetGoogle();
  }, [clearBiometricError, reset, resetGoogle]);
  useClearErrorOnEdit(form.watch, displayError !== null, clearErrors);

  return (
    <AuthHeroProvider closed={passwordFocused} hasError={displayError !== null}>
      <AuthScreenLayout subtitle="Đăng nhập để tiếp tục" title="Chào mừng trở lại">
        <View className="gap-md">
          {/* ⛔ Không truyền `error` từ `formState`: `FormInput` tự lấy lỗi từ
            `fieldState` của chính trường đó. Bới `formState.errors` theo tên là
            chỗ rất dễ gõ sai tên trường, và khi sai thì lỗi "không hiện" một
            cách im lặng. */}
          <FormInput<LoginFormValues>
            autoCapitalize="none"
            autoComplete="email"
            control={form.control}
            keyboardType="email-address"
            label="Email"
            name="email"
            placeholder="ban@congty.vn"
            // Bàn phím hiện nút "Tiếp" và NHẢY sang ô mật khẩu — `returnKeyType` một mình chỉ đổi
            // nhãn phím; thiếu `setFocus` thì bấm "Tiếp" là đóng bàn phím, không sang đâu cả.
            returnKeyType="next"
            submitBehavior="submit"
            textContentType="emailAddress"
            onSubmitEditing={() => form.setFocus('password')}
          />

          {/* Ô mật khẩu + "Quên mật khẩu?" là MỘT cụm (`gap-xs`, sát hơn nhịp `gap-md` giữa các ô): liên kết thuộc về
            ô ngay trên nó, đứng cách đều hai ô thì mắt đọc thành một dòng lơ lửng giữa form. */}
          <View className="gap-xs">
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
              // `FormInput` gọi `onBlur` này SAU `field.onBlur` của RHF — kiểm tra "đã chạm" vẫn chạy đúng.
              onBlur={() => setPasswordFocused(false)}
              onFocus={() => setPasswordFocused(true)}
              // Gửi form ngay từ bàn phím, không phải cụp bàn phím rồi mới bấm nút.
              onSubmitEditing={submit}
            />

            {/* Ngay dưới ô mật khẩu, canh PHẢI — vị trí quen thuộc để người dùng thấy lối thoát ngay khi vừa gõ
              sai, không phải cuộn xuống cuối form mới thấy.

              ⚠️ `self-end` (không phải `items-end`) mới căn được `LinkButton`: `pressable` của nó mang cứng
              `self-start` (`link-button.styles.ts`) và luôn thắng `alignItems` của `View` cha — phải tự canh CHÍNH
              cái `View` bọc bằng `self-end` trên chính nó, canh từ cha không có tác dụng. */}
            <View className="self-end">
              <LinkButton
                label="Quên mật khẩu?"
                onPress={() => router.push(PATHS.FORGOT_PASSWORD)}
              />
            </View>
          </View>

          {/* Lỗi từ máy chủ (sai mật khẩu, tài khoản bị khoá) hiện Ở ĐÂY chứ không
            phải bằng toast: nó thuộc về form, và nó phải còn nguyên trên màn
            hình trong lúc người dùng sửa lại — toast tự tắt sau 5 giây. Dải
            này còn hứng cả lỗi sinh trắc học (AUTH_013/014/015…). */}
          {displayError ? <Alert description={displayError} tone="error" /> : null}

          {/**
           * ⛔ Cây JSX ở đây PHẢI giữ nguyên hình dạng dù nút sinh trắc học có
           * hiện hay không — `Button` "Đăng nhập" (trong lớp bọc ánh quét) luôn
           * là CON ĐẦU TIÊN của cùng một `<View>`, chỉ phần tử THỨ HAI xuất
           * hiện/biến mất theo `biometric.available`. Đổi cấu trúc bọc ngoài
           * theo điều kiện sẽ khiến React tháo-dựng lại nút gửi mỗi lần
           * `available` đổi — hoạt ảnh loading/press giữa chừng bị cắt ngang.
           *
           * Ba luồng đăng nhập (mật khẩu, sinh trắc học, Google) KHÔNG được chạy chồng: mỗi nút khoá khi
           * các nút kia đang chạy, nếu không hai lượt cùng `completeSignIn` và điều hướng hai lần.
           */}
          <View className="flex-row items-center gap-sm">
            {/* Lớp bọc nhận `flex-1` thay nút và mang ĐÚNG viên thuốc của nút (`rounded-full`) để ánh quét không lòi ra
              ngoài; nút `self-stretch` kín bề ngang lớp bọc. Nút `md` cao 48dp, không `hitSlop` ⇒ `overflow-hidden` không
              cắt vùng chạm nào. Hai ô đều có chữ ⇒ quét một lượt (`ReadySheen`). */}
            <View className="flex-1 overflow-hidden rounded-full">
              <Button
                disabled={biometric.isPending || google.isPending}
                label="Đăng nhập"
                loading={isPending}
                pressableClassName="self-stretch"
                onPress={submit}
              />
              <ReadySheen ready={typedEmail !== '' && typedPassword !== ''} />
            </View>
            {biometric.available ? (
              <BiometricLoginButton
                capability={biometric.capability}
                disabled={isPending || google.isPending}
                loading={biometric.isPending}
                onPress={handleBiometricPress}
              />
            ) : null}
          </View>

          {google.available ? (
            <GoogleLoginButton
              disabled={isPending || biometric.isPending}
              loading={google.isPending}
              onPress={google.login}
            />
          ) : null}

          <View className="flex-row items-center justify-center gap-2xs">
            <Text className="text-body-lg text-fg-2">Chưa có tài khoản?</Text>
            <LinkButton label="Đăng ký" onPress={() => router.push(PATHS.REGISTER)} />
          </View>
        </View>
      </AuthScreenLayout>
    </AuthHeroProvider>
  );
}
