import { registerHomeWidget } from '@/shared/home-widgets';

import { HomeFocusWidget } from './components/home/HomeFocusWidget';

// Thống kê "giờ tập trung" ở Trang chủ đi qua khe chung `@/shared/home-widgets` — `features/home` không import `pomodoro`
// (`feature-structure.md`). Module này chỉ có tác dụng phụ (đăng ký); import ở `app/(app)/_layout.tsx` (module scope, trước lần vẽ
// đầu của Trang chủ). Đăng ký lại cùng `id` chỉ ghi đè nên an toàn với Fast Refresh. Widget TỰ kiểm cờ `pomodoro` và tự ẩn.
// `order` 30: cuối dải thống kê — sau "Ôn tập hôm nay" (5) của `study`, chuỗi/hoạt động (10) và cấp độ/thành tích (20) của
// `gamification`, xu (25) của `coins`.
registerHomeWidget('pomodoro.focus', () => <HomeFocusWidget />, { order: 30 });
