import { registerActivityWidget } from '@/shared/activity-widgets';

import { SrDueWidget } from './components/sr/SrDueWidget';

// p4-02: widget "N thẻ cần ôn hôm nay" ở tab Hoạt động đi qua khe chung `@/shared/activity-widgets` — `features/activity` không import `study`
// (`feature-structure.md`). Module này chỉ có tác dụng phụ (đăng ký); import ở `app/(app)/activity/_layout.tsx`. Đăng ký lại cùng `id` chỉ ghi đè
// nên an toàn với Fast Refresh. `order` 20: đứng SAU "Cần chấm" (việc người khác đang chờ bạn) — xem `boards/register-activity-widgets.tsx`.
registerActivityWidget('study.sr-due', () => <SrDueWidget />, { order: 20 });
