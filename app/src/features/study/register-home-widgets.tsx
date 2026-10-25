import { registerHomeWidget } from '@/shared/home-widgets';

import { HomeSrTodayWidget } from './components/home/HomeSrTodayWidget';

// "Ôn tập hôm nay" ở Trang chủ đi qua khe chung `@/shared/home-widgets` — `features/home` không import `study`
// (`feature-structure.md`). Module này chỉ có tác dụng phụ (đăng ký); import ở `app/(app)/_layout.tsx` (module scope, trước lần vẽ
// đầu của Trang chủ). Đăng ký lại cùng `id` chỉ ghi đè nên an toàn với Fast Refresh. Widget TỰ kiểm cờ `study` và tự ẩn.
// `order` 5: ĐẦU dải — đây là VIỆC CẦN LÀM hôm nay (có nút "Ôn ngay", tự ẩn khi không có gì), nên đứng trước các thẻ thống kê
// "xem cho biết": chuỗi/hoạt động (10), cấp độ/thành tích (20) của `gamification`, xu (25) của `coins`, giờ tập trung (30) của `pomodoro`.
// Bản trước để 40 (cuối dải) — người dùng phải cuộn qua cả dải thống kê mới thấy việc duy nhất có hạn trong ngày.
registerHomeWidget('study.sr-today', () => <HomeSrTodayWidget />, { order: 5 });
