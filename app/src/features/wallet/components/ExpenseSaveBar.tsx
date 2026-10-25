import { Button } from '@/shared/ui/button';
import { BottomActionBar } from '@/shared/ui/navigation';

export interface ExpenseSaveBarProps {
  /** Đang gọi API — nút thành vòng quay, không bấm được. */
  busy?: boolean;
  /** Form hợp lệ để gửi: tổng chia khớp, đủ số tiền/mô tả, ảnh (nếu có) đã READY. */
  canSave: boolean;
  label?: string;
  /** Mất mạng — khoá nút với nhãn "Kết nối lại để lưu" (app.md §3, cột Offline). */
  offline?: boolean;
  onSave: () => void;
}

/**
 * Thanh Lưu dính đáy. Khoá khi tổng chia SAI (không phải chỉ báo đỏ rồi vẫn cho bấm) —
 * gửi lên chỉ để nhận `WALLET_002` là một vòng mạng vô ích, và tệ hơn là một dòng lỗi
 * người dùng phải tự dịch. `BottomActionBar` tự lo vùng an toàn đáy.
 */
export function ExpenseSaveBar({
  busy = false,
  canSave,
  label = 'Lưu khoản chi',
  offline = false,
  onSave,
}: ExpenseSaveBarProps) {
  return (
    <BottomActionBar>
      <Button
        disabled={!canSave || offline}
        fullWidth
        label={offline ? 'Kết nối lại để lưu' : label}
        loading={busy}
        onPress={onSave}
      />
    </BottomActionBar>
  );
}
