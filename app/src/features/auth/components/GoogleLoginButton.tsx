import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Divider } from '@/shared/ui/divider';

import { GOOGLE_LOGIN_LABEL, LOGIN_SOCIAL_DIVIDER_LABEL } from '../constants/social.messages';

export interface GoogleLoginButtonProps {
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}

/**
 * Đường kẻ "HOẶC" + nút "Tiếp tục với Google" — đứng dưới nút "Đăng nhập" của form mật khẩu.
 *
 * ⛔ KHÔNG tự kiểm `available` — nơi gọi (`LoginScreen`) đọc từ `useGoogleLogin` và quyết định có vẽ cả khối này không, để
 * component chỉ vẽ. `secondary` (không phải `primary`): hành động chính của màn vẫn là đăng nhập bằng email.
 *
 * ⛔ Căn giữa bằng `pressableClassName="self-center"`, KHÔNG bằng `<View className="items-center">` bọc ngoài.
 * `pressable` của `Button` mặc định `self-start` (ôm sát nhãn chữ), mà `alignSelf` của CHÍNH nút luôn thắng
 * `alignItems` của `View` cha — bản trước bọc `items-center` nên nút vẫn dạt hẳn sang trái dưới đường kẻ "HOẶC"
 * (đã thấy trên máy), không class nào sai hay báo lỗi. Chỉ `pressableClassName` tới được lớp mang `self-start`
 * (`className` rơi vào khối NHÌN THẤY bên trong — xem `Button.tsx`). ⛔ Không dùng `fullWidth`: nút cố ý hẹp bằng
 * đúng nhãn chữ, không kéo dài bằng nút "Đăng nhập" phía trên.
 *
 * ⚠️ Đường kẻ `tone="strong"` + `thickness="thin"` (1dp `divider-2`): nền màn xác thực là `bg-base` xám nhạt, nét
 * mặc định (`divider-1` #EEEEEE, 1 pixel vật lý) chìm hẳn vào nền — chữ "HOẶC" trôi lơ lửng một mình giữa màn thay vì
 * nằm giữa hai đường kẻ. Đúng ca `strong` sinh ra cho ("đường kẻ phải ăn đứt nền xám", `Divider.tsx`).
 */
export function GoogleLoginButton({ disabled = false, loading = false, onPress }: GoogleLoginButtonProps) {
  return (
    <View className="gap-md">
      <Divider label={LOGIN_SOCIAL_DIVIDER_LABEL} thickness="thin" tone="strong" />
      <Button
        disabled={disabled}
        label={GOOGLE_LOGIN_LABEL}
        loading={loading}
        pressableClassName="self-center"
        variant="secondary"
        onPress={onPress}
      />
    </View>
  );
}
