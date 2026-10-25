import { Alert } from '@/shared/ui/alert';
import { Button, LinkButton } from '@/shared/ui/button';

import type { PendingAlert } from '../api/wellbeing.types';
import { ALERT_COPY } from '../constants/wellbeing-copy.constants';

export interface WellbeingAlertCardProps {
  alert: PendingAlert;
  /** Đang gửi "Đã hiểu"/"Nhắc lại sau" — khoá hai nút để không bấm đúp. */
  busy?: boolean;
  className?: string;
  onDismiss: () => void;
  onSnooze: () => void;
  /** Có ⇒ nút ✕ "Ẩn lúc này" (thẻ nổi: chỉ ẩn trong phiên, cảnh báo vẫn chờ). Không có ⇒ thẻ nằm trong màn, chỉ tắt bằng hai nút. */
  onClose?: () => void;
  /** Có ⇒ hiện "Xem chi tiết" (thẻ nổi mở màn Sức khoẻ; trong chính màn đó thì không cần). */
  onOpen?: () => void;
}

/**
 * Thẻ cảnh báo MỀM (app.md p7-03 `BurnoutAlertToast`): một lời nhắc nghỉ ngơi, hai nút "Đã hiểu" / "Nhắc lại sau". Dựng trên `Alert` chung, tông `info` (xanh dịu) —
 * ⛔ không `error`/`warning`: không dùng đỏ báo động cho một lời nhắc chăm sóc bản thân. Lời chỉ nói gợi ý (nghỉ/ngủ sớm/giãn việc), KHÔNG nêu mức hay số: thẻ nổi có thể
 * hiện giữa lớp học trước mặt người khác. Không tự tắt (cảnh báo có hành động, đọc dở mà biến mất là mất việc) — khác toast 5 giây.
 */
export function WellbeingAlertCard({
  alert,
  busy = false,
  className,
  onClose,
  onDismiss,
  onOpen,
  onSnooze,
}: WellbeingAlertCardProps) {
  return (
    <Alert
      actions={
        <>
          <Button disabled={busy} label="Đã hiểu" size="sm" onPress={onDismiss} />
          <Button
            disabled={busy}
            label="Nhắc lại sau"
            size="sm"
            variant="tertiary"
            onPress={onSnooze}
          />
          {onOpen ? <LinkButton label="Xem chi tiết" onPress={onOpen} /> : null}
        </>
      }
      className={className}
      description={ALERT_COPY[alert.suggestion ?? 'DEFAULT']}
      title="Một lời nhắc nhẹ"
      tone="info"
      onClose={onClose}
    />
  );
}
