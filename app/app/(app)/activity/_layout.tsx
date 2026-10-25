import { Stack } from 'expo-router';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

// p4-02 + p4-05: đăng ký widget "N thẻ cần chấm" / "N thẻ cần ôn hôm nay" vào đầu tab Hoạt động (side-effect) — `features/activity` không import
// `boards`/`study`. ⚠️ Import Ở ĐÂY (chạy khi module route được nạp, TRƯỚC lần vẽ đầu của `ActivityScreen`), không phải trong effect.
import '@/features/boards/register-activity-widgets';
import '@/features/study/register-activity-widgets';

/**
 * Ngăn xếp phân hệ Hoạt động (tab `activity`): hiện chỉ có `index`. ⛔ File này BẮT BUỘC dù chỉ một màn — thiếu `_layout.tsx`
 * thì Expo Router đặt tên route là `activity/index`, không khớp `name: 'activity'` ở `MODULE_REGISTRY`, và `AppTabBar` lặng lẽ
 * bỏ tab (không lỗi nào báo). Có `_layout.tsx` thì màn con gộp thành MỘT route `activity`, cùng cơ chế với `meetings/`, `me/`.
 */
export default function ActivityLayout() {
  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}
