import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { useClearErrorOnEdit } from '@/shared/form/useClearErrorOnEdit';
import { useResyncForm } from '@/shared/form/useResyncForm';
import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { IconTile } from '@/shared/ui/icon-tile';
import { FormInput } from '@/shared/ui/input';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { formatPhoneDisplay } from '@/shared/utils/phone.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import {
  DISPLAY_NAME_MAX_LENGTH,
  EDIT_PROFILE_INTRO,
  PHONE_HINT,
} from '../constants/edit-profile.messages';
import { useEditProfile } from '../hooks/useEditProfile';
import { editProfileSchema, type EditProfileFormValues } from '../schemas/edit-profile.schemas';

/**
 * "Sửa hồ sơ" — tên hiển thị + số điện thoại tự khai. Mở từ tab Tôi (`router.push(PATHS.ME_EDIT_PROFILE)`), nên có `onBack`.
 * Ảnh đại diện KHÔNG sửa ở đây: đổi bằng cách chạm vào ảnh ở đầu màn Tôi (`MeAvatarPicker`). Email cũng không: đổi email đòi
 * mật khẩu hiện tại và thu hồi mọi phiên (BE) — ngoài phạm vi màn này; xác minh email ở Cài đặt → Bảo mật.
 *
 * Giá trị đầu form lấy từ hồ sơ trong store; SĐT hiện dạng người Việt đọc (`0912 345 678`) nhưng LƯU E.164 — chuẩn hoá và
 * so với giá trị đang lưu nằm ở `useEditProfile`. `useResyncForm`: hồ sơ vừa được làm mới nền (vd `authService.me()` lúc mở
 * app trả về chậm) mà người dùng CHƯA sửa gì thì nạp lại ô nhập, không để họ bấm "Lưu" trên dữ liệu cũ.
 */
export function EditProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const { errorMessage, isPending, reset, save } = useEditProfile();

  const values: EditProfileFormValues = {
    name: user?.name ?? '',
    phone: user?.phone ? formatPhoneDisplay(user.phone) : '',
  };
  const form = useZodForm(editProfileSchema, { defaultValues: values });
  useResyncForm(form, values, `${values.name}|${user?.phone ?? ''}`);
  // Lỗi máy chủ (429, mất mạng…) không tự tắt — xoá ngay khi người dùng sửa lại một ô.
  useClearErrorOnEdit(form.watch, errorMessage !== null, reset);

  const submit = form.handleSubmit((next) => save(next));

  return (
    <Screen header={<AppBar title="Sửa hồ sơ" onBack={router.back} />} keyboardAware>
      <View className="gap-md py-xs">
        {/* Ô icon lớn đầu màn — cùng khuôn "Đổi mật khẩu"/"Xoá tài khoản", trang trí thuần (nghĩa nằm ở câu giới thiệu). */}
        <View className="items-center gap-sm py-xs">
          <IconTile name="user-edit" size="xl" tone="brand" />
          <Text className="text-center text-body-md text-fg-2">{EDIT_PROFILE_INTRO}</Text>
        </View>

        <FormInput<EditProfileFormValues>
          autoCapitalize="words"
          autoComplete="name"
          control={form.control}
          disabled={isPending}
          label="Tên hiển thị"
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          name="name"
          placeholder="Nguyễn Văn A"
          required
          returnKeyType="next"
          submitBehavior="submit"
          textContentType="name"
          onSubmitEditing={() => form.setFocus('phone')}
        />

        <FormInput<EditProfileFormValues>
          autoComplete="tel"
          clearable
          clearLabel="Xoá số điện thoại"
          control={form.control}
          disabled={isPending}
          keyboardType="phone-pad"
          label="Số điện thoại"
          message={PHONE_HINT}
          name="phone"
          placeholder="0912 345 678"
          returnKeyType="done"
          textContentType="telephoneNumber"
          onSubmitEditing={submit}
        />

        {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}

        <Button
          disabled={!form.formState.isDirty}
          fullWidth
          label="Lưu"
          loading={isPending}
          onPress={submit}
        />
      </View>
    </Screen>
  );
}
