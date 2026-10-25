import { ConfirmSheet } from '@/shared/ui/bottom-sheet';

export interface BusyConflictDialogProps {
  /** Đang gọi lại `join` với `force: true` — nút "Chuyển sang đây" khoá + vòng quay. */
  loading?: boolean;
  /**
   * `true` ⇒ chính cuộc họp NÀY đang mở ở thiết bị khác của bạn (BE `sameCallOtherDevice`). `false` ⇒ bạn đang ở MỘT cuộc gọi/họp khác.
   * Hai ca khác câu hỏi, cùng một hành động: xác nhận là ngắt phiên kia và vào bằng máy này.
   */
  sameDevice: boolean;
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Hỏi chuyển `CALL_004` (app.md p2-05 §4.1 bước 3): đang bận nơi khác ⇒ hỏi có chuyển sang không. Tấm xác nhận (chặn luồng, phải quyết định)
 * chứ không toast: toast tự tắt sau vài giây trong khi người dùng còn đang đọc câu hỏi. Chuyển sang là hành động CÓ HẬU QUẢ (ngắt phiên kia)
 * nên mặc định KHÔNG bao giờ tự `force` — luôn qua tấm này.
 *
 * ✅ `ConfirmSheet` (cùng khuôn các tấm của phòng họp) thay `Dialog` giữa màn; nút xếp DỌC vì "Chuyển sang đây" không vừa nửa hàng ở 320dp.
 */
export function BusyConflictDialog({ loading = false, sameDevice, visible, onCancel, onConfirm }: BusyConflictDialogProps) {
  return (
    <ConfirmSheet
      actionsLayout="column"
      confirmLabel="Chuyển sang đây"
      description={
        sameDevice
          ? 'Bạn đang tham gia cuộc họp này trên thiết bị khác. Chuyển sang thiết bị này sẽ ngắt phiên trên thiết bị kia.'
          : 'Bạn đang trong một cuộc gọi khác. Chuyển sang cuộc họp này sẽ rời cuộc gọi đó.'
      }
      icon="arrow-data-transfer-vertical"
      loading={loading}
      title={sameDevice ? 'Chuyển sang thiết bị này?' : 'Chuyển sang cuộc họp này?'}
      visible={visible}
      onClose={onCancel}
      onConfirm={onConfirm}
    />
  );
}
