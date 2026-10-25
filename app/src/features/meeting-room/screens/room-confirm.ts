import type { RoomConfirm } from '../hooks/useRoomDialogs';

export interface ConfirmCopy {
  confirmLabel: string;
  danger: boolean;
  description: string;
  title: string;
}

/**
 * Chữ của hộp thoại xác nhận lần hai cho việc chủ trì (mời ra, tắt mic tất cả, kết thúc cho mọi người). Nói rõ HẬU QUẢ và tên người bị
 * tác động — không dùng "Bạn chắc chứ?" trống trơn. `null` (đang đóng) trả bản mặc định để hộp thoại đóng vẫn có chữ hợp lệ.
 */
export function confirmCopy(confirm: RoomConfirm | null): ConfirmCopy {
  if (confirm?.kind === 'REMOVE') {
    const also = confirm.alsoRemoveAttendee ? 'Người này cũng bị xoá khỏi danh sách tham dự. ' : '';
    return {
      confirmLabel: 'Mời ra',
      danger: true,
      description: `${also}Họ sẽ không vào lại được phiên họp này.`,
      title: `Mời ${confirm.name} ra khỏi cuộc họp?`,
    };
  }
  if (confirm?.kind === 'MUTE_ALL') {
    return {
      confirmLabel: 'Tắt mic tất cả',
      danger: false,
      description: 'Mic của mọi người trong phòng sẽ bị tắt. Mỗi người có thể tự bật lại.',
      title: 'Tắt mic của tất cả mọi người?',
    };
  }
  return {
    confirmLabel: 'Kết thúc',
    danger: true,
    description: 'Mọi người sẽ bị ngắt khỏi cuộc họp ngay. Thao tác này không hoàn tác được.',
    title: 'Kết thúc cuộc họp cho mọi người?',
  };
}
