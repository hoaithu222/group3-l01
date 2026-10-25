import { memo } from 'react';

import { useQueryParams } from '@/shared/hooks';

import { OBJECT_ID_PATTERN } from '../constants/economy.constants';
import UserFinder from './UserFinder';
import UserWalletPanel from './UserWalletPanel';

/**
 * Nhóm "Ví người dùng" (admin.md p7-02 §2.2): chưa chọn ai (hoặc `?userId=` sai dạng — URL do người dùng sửa được) → `UserFinder`; đã chọn → ví + sổ cái của người đó.
 * `key={userId}` để đổi người là mọi trạng thái cục bộ (cursor sổ cái, ngăn kéo, modal) về sạch.
 */
const WalletLookup = memo(function WalletLookup() {
  const { getParam } = useQueryParams();
  const raw = getParam('userId');
  return OBJECT_ID_PATTERN.test(raw) ? <UserWalletPanel key={raw} userId={raw} /> : <UserFinder />;
});

export default WalletLookup;
