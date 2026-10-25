import { registerProfileRow } from '@/shared/profile';

import { WellbeingMeRow } from './components/WellbeingMeRow';

// p7-03: lối vào "Sức khoẻ học tập" ở màn Tôi đi qua khe chung `@/shared/profile` — `features/me` không import `wellbeing` (`feature-structure.md`).
// Module này chỉ có tác dụng phụ (đăng ký); nơi lắp ráp import nó ở `app/(app)/me/_layout.tsx` (cạnh `@/features/coins/register-profile`).
// Đăng ký lại cùng `id` chỉ ghi đè nên an toàn với Fast Refresh.
registerProfileRow('wellbeing.home', () => <WellbeingMeRow />);
