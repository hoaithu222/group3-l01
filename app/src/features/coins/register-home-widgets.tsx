import { registerHomeWidget } from '@/shared/home-widgets';

import { HomeCoinsWidget } from './components/home/HomeCoinsWidget';

// p7-02: widget số dư xu ở Trang chủ đi qua khe chung `@/shared/home-widgets` — `features/home` không import `coins` (`feature-structure.md`). Module này chỉ có
// tác dụng phụ (đăng ký); import ở `shell/home-widgets/register-stats-widgets.ts` (nơi `app/(app)/_layout.tsx` nạp trước lần vẽ đầu của Trang chủ). Đăng ký lại
// cùng `id` chỉ ghi đè nên an toàn với Fast Refresh. Widget TỰ kiểm cờ `coins` và tự ẩn. `order` 25: sau "Cấp độ và thành tích" (20), trước "Giờ tập trung" (30).
registerHomeWidget('coins.balance', () => <HomeCoinsWidget />, { order: 25 });
