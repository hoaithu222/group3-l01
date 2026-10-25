import { Stack } from 'expo-router';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp cho phân hệ Học (p4-01): `index` · `new` · `sets/[setId]/*` · `roadmap/**` (p4-07). Có `_layout.tsx` nên
 * các màn con gộp thành MỘT route `study` ở `(app)/_layout.tsx` (thiếu file này Expo Router "đẩy" từng file thành
 * tab ngang hàng — xem `app/AGENTS.md`). Tab `study` bị ẨN khỏi thanh dưới (`href: null` ở `(app)/_layout.tsx`):
 * điểm vào là hub nhóm → "Học" và Tôi → "Học tập của tôi".
 */
export default function StudyLayout() {
  // Màn thi: tắt vuốt-lùi — rời bài thi phải qua nút có chủ đích (app.md p4-02 §1).
  return (
    <Stack screenOptions={STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="attempts/[attemptId]" options={{ gestureEnabled: false }} />
      {/* p4-07: xem ảnh/SVG toàn màn — modal đè lên màn buổi học (app.md p4-07 §1 "modal toàn màn"). */}
      <Stack.Screen name="roadmap/media/[mediaId]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
