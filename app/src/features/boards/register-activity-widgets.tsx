import { registerActivityWidget } from '@/shared/activity-widgets';

import { MyReviewsActivityWidget } from './components/review/MyReviewsActivityWidget';

// p4-05: thẻ "N thẻ cần chấm" ở tab Hoạt động đi qua khe chung `@/shared/activity-widgets` — `features/activity` không import `boards`
// (`feature-structure.md`). Module này chỉ có tác dụng phụ (đăng ký); import ở `app/(app)/activity/_layout.tsx`. Đăng ký lại cùng `id` chỉ ghi
// đè nên an toàn với Fast Refresh. `order` 10: việc NGƯỜI KHÁC đang chờ bạn đứng trên "thẻ cần ôn" (việc của riêng bạn) — xem `study/register-activity-widgets.tsx`.
registerActivityWidget('boards.my-reviews', () => <MyReviewsActivityWidget />, { order: 10 });
