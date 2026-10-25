import { registerHomeWidget } from '@/shared/home-widgets';

import { HomeActivityWidget } from './components/home/HomeActivityWidget';
import { HomeLevelWidget } from './components/home/HomeLevelWidget';
import { HomeStreakWidget } from './components/home/HomeStreakWidget';

// Thống kê chăm chỉ ở Trang chủ đi qua khe chung `@/shared/home-widgets` — `features/home` không import `gamification`
// (`feature-structure.md`). Module này chỉ có tác dụng phụ (đăng ký); import ở `app/(app)/_layout.tsx` (module scope, trước lần vẽ đầu
// của Trang chủ). Đăng ký lại cùng `id` chỉ ghi đè nên an toàn với Fast Refresh. Mỗi widget TỰ kiểm cờ `gamification` và tự ẩn.
// `order`: 10 = chuỗi rồi hoạt động 7 ngày (cùng số ⇒ theo thứ tự đăng ký, `sort` của JS ổn định — thứ tự dưới đây là thứ tự vẽ),
// 20 = cấp độ + thành tích. 5 (ôn tập, `study` — việc cần làm nên đứng ĐẦU), 25 (xu, `coins`) và 30 (tập trung, `pomodoro`) do
// các feature đó đăng ký.
registerHomeWidget('gamification.streak', () => <HomeStreakWidget />, { order: 10 });
registerHomeWidget('gamification.activity', () => <HomeActivityWidget />, { order: 10 });
registerHomeWidget('gamification.level', () => <HomeLevelWidget />, { order: 20 });
