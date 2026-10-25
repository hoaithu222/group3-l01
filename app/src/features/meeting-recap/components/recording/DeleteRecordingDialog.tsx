import { View } from 'react-native';

import { Input } from '@/shared/ui/input';
import { Dialog } from '@/shared/ui/modal';

/** Lý do tối thiểu (BE `deleteRecordingQuerySchema` — 10..500 ký tự sau khi bỏ khoảng trắng hai đầu). */
export const MIN_DELETE_REASON = 10;

export interface DeleteRecordingDialogProps {
  loading: boolean;
  /** Người xoá không phải chủ trì theo lịch (OWNER workspace) — BE bắt buộc lý do (audit). */
  needReason: boolean;
  reason: string;
  visible: boolean;
  onCancel: () => void;
  onChangeReason: (reason: string) => void;
  onConfirm: () => void;
}

/**
 * Xác nhận xoá bản ghi (app.md §3): nói rõ hậu quả — xoá vĩnh viễn, người tham dự không xem được nữa. Chủ trì xoá bản của mình không cần lý
 * do; OWNER workspace xoá hộ thì BE trả 400 "Lý do bắt buộc" ⇒ hộp thoại hiện ô lý do (≥ 10 ký tự) và chỉ gửi khi đủ.
 */
export function DeleteRecordingDialog(props: DeleteRecordingDialogProps) {
  const { loading, needReason, reason, visible } = props;
  const short = needReason && reason.trim().length < MIN_DELETE_REASON;

  return (
    <Dialog
      actionsDirection="column"
      description="Bản ghi bị xoá vĩnh viễn khỏi lưu trữ, mọi người trong cuộc họp không xem được nữa. Không hoàn tác."
      dismissOnBackdrop={!loading}
      primaryAction={{ disabled: short, label: 'Xoá bản ghi', loading, onPress: props.onConfirm }}
      secondaryAction={{ disabled: loading, label: 'Giữ lại', onPress: props.onCancel }}
      title="Xoá bản ghi cuộc họp?"
      variant="warning"
      visible={visible}
      onClose={props.onCancel}
    >
      {needReason ? (
        <View className="w-full pt-xs">
          <Input
            label="Lý do xoá"
            maxLength={500}
            message={short ? `Nhập ít nhất ${String(MIN_DELETE_REASON)} ký tự — lý do được ghi vào nhật ký.` : undefined}
            messageTone="error"
            multiline
            placeholder="Vì sao bạn xoá bản ghi này?"
            value={reason}
            onChangeText={props.onChangeReason}
          />
        </View>
      ) : null}
    </Dialog>
  );
}
