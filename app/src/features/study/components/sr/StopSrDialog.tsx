import { Dialog } from '@/shared/ui/modal';

/**
 * Xác nhận "Ngừng ôn bộ này" (`DELETE /sr/enrollments/:setId`). ⚠️ BE CHỈ ngừng đưa thẻ MỚI — tiến độ giữ nguyên và thẻ đã học vẫn đến hạn theo lịch (be `sr.service.ts`
 * `unenroll`) — nên câu ở đây không được hứa "bộ biến mất khỏi lịch ôn" (bản cũ hứa vậy: người dùng vẫn thấy thẻ đến hạn hôm sau và tưởng nút hỏng).
 */
export function StopSrDialog({
  loading,
  onClose,
  onConfirm,
  visible,
}: {
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
  visible: boolean;
}) {
  return (
    <Dialog
      description="Bộ này sẽ không đưa thêm thẻ mới vào lịch ôn. Thẻ bạn đã học vẫn đến hạn theo lịch. Bạn có thể đăng ký ôn lại bất cứ lúc nào."
      primaryAction={{ label: 'Ngừng ôn', loading, onPress: onConfirm }}
      secondaryAction={{ label: 'Huỷ', onPress: onClose }}
      title="Ngừng ôn bộ này?"
      visible={visible}
      onClose={onClose}
    />
  );
}
