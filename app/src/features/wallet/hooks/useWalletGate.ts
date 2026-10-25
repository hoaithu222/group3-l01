import { useFeature } from '@/shell/capabilities';

import { useWalletSettings } from '../queries/wallet.queries';
import { useWalletAccess } from '../queries/wallet-support.queries';
import { isWalletDenied } from '../utils/wallet-errors';

/**
 * Người này có được dùng ví của nhóm này không.
 *
 * ⚠️ Đây chỉ là ẩn để HIỂN THỊ — hàng rào thật nằm ở BE (GUEST/không phải thành
 * viên/cờ `wallet` tắt → 404). Ba nguồn tín hiệu, cái nào tới trước thắng, để màn
 * không chớp nội dung ví rồi mới báo "không xem được":
 *  1. cờ `wallet` tắt (`capabilities`) — biết ngay, không cần request;
 *  2. `myRole === 'GUEST'` (`GET /workspaces/:id`, chung cache với feature nhóm);
 *  3. `GET /wallet` trả 404.
 */
export function useWalletGate(wsId: string | undefined) {
  const enabled = useFeature('wallet');
  const access = useWalletAccess(wsId);
  const settings = useWalletSettings(wsId);

  const denied =
    enabled === false ||
    access.data?.myRole === 'GUEST' ||
    isWalletDenied(access.error) ||
    isWalletDenied(settings.error);

  return {
    denied,
    access,
    settings,
    myRole: access.data?.myRole,
    isArchived: access.data?.status === 'ARCHIVED',
    canManageSettings: settings.data?.myActions.canManageSettings ?? false,
    canRemind: settings.data?.myActions.canRemind ?? false,
  };
}
