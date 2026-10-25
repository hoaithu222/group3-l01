import { Dialog } from '@/shared/ui/modal';

export interface PomodoroDialogsProps {
  /** Tôi là chủ phòng — câu hỏi rời phòng nói rõ quyền điều khiển sẽ chuyển. */
  isHost: boolean;
  leaveOpen: boolean;
  onCloseLeave: () => void;
  onConfirmLeave: () => void;
  onConfirmSwitch: () => void;
  onDismissSwitch: () => void;
  switchOpen: boolean;
}

/**
 * Hai hộp thoại xác nhận của màn phòng: "Rời phòng học?" (bấm Rời / nút back cứng — bấm nhầm là mất chỗ) và "Chuyển sang máy này?" (`CALL_004`: đang ở phòng
 * này trên máy khác hoặc trong một cuộc gọi khác; đồng ý ⇒ vào lại với `force`).
 */
export function PomodoroDialogs(props: PomodoroDialogsProps) {
  return (
    <>
      <Dialog
        description={
          props.isHost
            ? 'Bạn đang là chủ phòng — sau ít phút quyền điều khiển sẽ chuyển cho người khác. Đồng hồ vẫn chạy.'
            : 'Bạn sẽ ngừng nghe phòng. Đồng hồ vẫn chạy cho những người còn lại.'
        }
        primaryAction={{ label: 'Rời phòng', onPress: props.onConfirmLeave }}
        secondaryAction={{ label: 'Ở lại', onPress: props.onCloseLeave }}
        title="Rời phòng học?"
        visible={props.leaveOpen}
        onClose={props.onCloseLeave}
      />
      <Dialog
        description="Bạn đang trong một cuộc gọi hoặc phòng này ở thiết bị khác. Vào ở đây sẽ ngắt bên kia."
        primaryAction={{ label: 'Chuyển sang đây', onPress: props.onConfirmSwitch }}
        secondaryAction={{ label: 'Không', onPress: props.onDismissSwitch }}
        title="Chuyển sang máy này?"
        visible={props.switchOpen}
        onClose={props.onDismissSwitch}
      />
    </>
  );
}
