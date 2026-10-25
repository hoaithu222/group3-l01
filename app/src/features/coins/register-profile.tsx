import { registerProfileRow } from '@/shared/profile';

import { CoinsMeRow } from './components/CoinsMeRow';

// p7-02: lối vào "Xu và cửa hàng" ở màn Tôi đi qua khe chung `@/shared/profile` — `features/me` không import `coins` (`feature-structure.md`).
// Module này chỉ có tác dụng phụ (đăng ký); nơi lắp ráp import nó ở `app/(app)/me/_layout.tsx` (cạnh `@/features/o2o/register-profile`).
// Đăng ký lại cùng `id` chỉ ghi đè nên an toàn với Fast Refresh.
registerProfileRow('coins.home', () => <CoinsMeRow />);
