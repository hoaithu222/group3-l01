import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

import { WALLET_ERROR } from '../constants/wallet.constants';
import { walletErrorCode } from '../utils/wallet-errors';

export interface SettleErrorAlertProps {
  error: unknown;
  /** Làm mới số dư + gợi ý — người dùng thấy số nợ MỚI rồi tự chỉnh, không bị ép gửi lại số cũ. */
  onReload: () => void;
}

/**
 * Lỗi tạo settlement hiện TRONG form (không toast — `settlementsService.create` tắt toast). `WALLET_005`
 * (vượt nợ) là ca hay gặp nhất: nợ vừa đổi vì người khác xác nhận/xoá một khoản — kèm nút "Tải lại gợi ý".
 */
export function SettleErrorAlert({ error, onReload }: SettleErrorAlertProps) {
  if (!error) return null;

  if (walletErrorCode(error) === WALLET_ERROR.overDebt) {
    return (
      <Alert
        actions={<Button label="Tải lại gợi ý" size="sm" onPress={onReload} />}
        description={toErrorMessage(error)}
        title="Khoản nợ vừa thay đổi"
        tone="warning"
      />
    );
  }

  return <Alert description={toErrorMessage(error)} tone="error" />;
}
