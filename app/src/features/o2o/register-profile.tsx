import { registerProfileRow } from '@/shared/profile';

import { O2oMeRow } from './components/O2oMeRow';

// p6-05: lối vào "Địa điểm & in ấn" ở màn Tôi đi qua khe chung `@/shared/profile` — `features/me` không import `o2o` (`feature-structure.md`).
// Module này chỉ có tác dụng phụ (đăng ký); nơi lắp ráp import nó ở `app/(app)/me/_layout.tsx` (cạnh `@/features/career/register-profile`).
// Đăng ký lại cùng `id` chỉ ghi đè nên an toàn với Fast Refresh.
registerProfileRow('o2o.home', () => <O2oMeRow />);
