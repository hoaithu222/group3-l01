import { Dialog } from '@/shared/ui/modal';

export interface ConsentPromptDialogProps {
  busy: boolean;
  /** Lỗi của lần trả lời gần nhất (mạng…) — hộp thoại vẫn mở để thử lại. */
  error: string | null;
  /** `LATE` = cuộc họp ĐANG được ghi mà mình chưa đồng ý (vào sau/nối lại); `REQUEST` = chủ trì vừa hỏi ý kiến. */
  kind: 'LATE' | 'REQUEST';
  /** Số giây còn lại của yêu cầu (`REQUEST`); `null` = không đếm ngược. */
  secondsLeft: number | null;
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Hỏi ý kiến người tham gia về việc ghi hình (app.md p2-06 §3 `ConsentPromptModal` + `LateJoinConsentModal`, §7 UX):
 *  · nói rõ HẬU QUẢ (lưu 90 ngày, người trong cuộc họp xem được); hai nút NGANG HÀNG, không mặc định chọn "Đồng ý";
 *  · KHÔNG đóng bằng chạm ra ngoài — phải chọn một trong hai (`dismissOnBackdrop={false}`, nút Back cũng coi như chưa chọn);
 *  · `REQUEST`: đếm ngược tới hạn yêu cầu — hết hạn thì nơi gọi đóng + báo "Yêu cầu đã hết hạn";
 *  · `LATE`: "Chỉ xem và nghe" → mic/camera khoá kèm nhãn "Cần đồng ý ghi hình" (bấm để mở lại hộp thoại này).
 */
export function ConsentPromptDialog({ busy, error, kind, secondsLeft, visible, onAccept, onDecline }: ConsentPromptDialogProps) {
  const late = kind === 'LATE';
  const base = late
    ? 'Cuộc họp đang được ghi hình. Đồng ý để bật mic và camera; bản ghi lưu 90 ngày và người trong cuộc họp có thể xem.'
    : 'Chủ trì muốn ghi hình cuộc họp. Bản ghi lưu 90 ngày và người trong cuộc họp có thể xem.';
  const countdown = !late && secondsLeft !== null ? ` Còn ${String(Math.max(0, secondsLeft))} giây để trả lời.` : '';

  return (
    <Dialog
      description={`${base}${countdown}${error ? `\n${error}` : ''}`}
      dismissOnBackdrop={false}
      primaryAction={{ disabled: busy, label: 'Đồng ý', loading: busy, onPress: onAccept }}
      secondaryAction={{ disabled: busy, label: late ? 'Chỉ xem và nghe' : 'Không đồng ý', onPress: onDecline }}
      title={late ? 'Cuộc họp đang được ghi hình' : 'Cho phép ghi hình cuộc họp?'}
      visible={visible}
      onClose={() => undefined}
    />
  );
}
