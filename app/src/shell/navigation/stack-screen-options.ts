import type { NativeStackNavigationOptions } from 'expo-router';

/**
 * `screenOptions` DÙNG CHUNG cho mọi stack lồng trong `app/(app)/**` (các màn con của một phân hệ).
 *
 * · `headerShown: false` — mỗi màn tự dựng `AppBar` của bộ component; bật header của navigator là hai thanh tiêu đề
 *   chồng nhau (lý do đầy đủ ở `tab-screen-options.ts`).
 * · `animation: 'ios_from_right'` — màn con TRƯỢT NGANG vào từ phải, màn cũ lùi nhẹ: "đi sâu = sang phải", cùng một
 *   hướng với cú vuốt-lùi. ⚠️ Kiểu này chỉ có trên Android; iOS thư viện tự quy về cú đẩy native mặc định (vốn đã trượt
 *   ngang) ⇒ hai nền tảng cùng một cảm giác điều hướng.
 *
 * ⚠️ Màn cần kiểu KHÁC vẫn khai `options` riêng ở `<Stack.Screen>` (options của màn đè lên đây): `presentation: 'modal'`,
 * `gestureEnabled: false` khi đang làm bài, `slide_from_bottom` + `fullScreenModal` của cuộc gọi/phòng họp ở layout gốc.
 * ⛔ Layout stack MỚI dùng hằng số này, đừng chép lại `{ headerShown: false }` trần — thiếu `animation` là màn con của
 * phân hệ đó chuyển cảnh lệch nhịp với phần còn lại của app.
 */
export const STACK_SCREEN_OPTIONS: NativeStackNavigationOptions = {
  headerShown: false,
  animation: 'ios_from_right',
};
