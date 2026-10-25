import { Stack } from 'expo-router';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp phân hệ Lịch họp (p2-04): `index` (lịch/agenda) · `new` · `[meetingId]` · `[meetingId]/edit`. Có `_layout.tsx` nên
 * các màn con gộp thành MỘT route `meetings` ở `(app)/_layout.tsx` (ẩn khỏi thanh tab bằng `href: null`). Socket `meeting:*`
 * mount một lần ở `(app)/_layout.tsx`.
 */
export default function MeetingsLayout() {
  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}
