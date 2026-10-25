import { Stack } from 'expo-router';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp RIÊNG cho khu "Nghề nghiệp" (p6-06) trong tab Tôi — gộp `index`, `skills/*`, `people/*` thành MỘT màn con của ngăn xếp `me`
 * (thiếu file này thì các màn con bị đẩy thành route ngang hàng của `me/_layout.tsx`). Mỗi màn tự dựng `AppBar`.
 */
export default function CareerLayout() {
  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}
