import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

export interface ExpenseLockedNoticeProps {
  onAdjust: () => void;
}

/**
 * `WALLET_004` (409): khoản chi đã có người thanh toán nên KHÔNG sửa/xoá trực tiếp —
 * viết lại lịch sử đã trả là làm sai sổ của những người đã chuyển tiền. Lối ra hợp lệ
 * duy nhất là "Tạo khoản điều chỉnh" (`POST /expenses/:id/adjustments`).
 */
export function ExpenseLockedNotice({ onAdjust }: ExpenseLockedNoticeProps) {
  return (
    <Alert
      actions={<Button label="Tạo khoản điều chỉnh" size="sm" onPress={onAdjust} />}
      description="Để không làm sai lịch sử những người đã trả, hãy tạo khoản điều chỉnh ghi lại số đúng."
      title="Khoản chi này đã có người thanh toán"
      tone="warning"
    />
  );
}
