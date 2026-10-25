import { registerProfileRow } from '@/shared/profile';

import { CareerMeRow } from './components/CareerMeRow';

// p6-06: lối vào "Nghề nghiệp" ở màn Tôi đi qua khe chung `@/shared/profile` — `features/me` không import `career` (`feature-structure.md`).
// Module này chỉ có tác dụng phụ (đăng ký); nơi lắp ráp import nó ở `app/(app)/me/_layout.tsx` (cạnh `@/features/boards/register-profile`).
// Đăng ký lại cùng `id` chỉ ghi đè nên an toàn với Fast Refresh.
registerProfileRow('career.home', () => <CareerMeRow />);
