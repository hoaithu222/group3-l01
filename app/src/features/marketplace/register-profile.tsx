import { registerProfileRow } from '@/shared/profile';

import { MarketplaceMeRow } from './components/MarketplaceMeRow';

// p7-02 P1: lối vào "Chợ tài liệu" ở màn Tôi đi qua khe chung `@/shared/profile` — `features/me` không import `marketplace` (`feature-structure.md`).
// Module này chỉ có tác dụng phụ (đăng ký); nơi lắp ráp import nó ở `app/(app)/me/_layout.tsx` (cạnh `@/features/coins/register-profile`).
// Đăng ký lại cùng `id` chỉ ghi đè nên an toàn với Fast Refresh.
registerProfileRow('marketplace.home', () => <MarketplaceMeRow />);
