import { router } from 'expo-router';

import { Dialog } from '@/shared/ui/modal';

import { callStoreApi } from '../store/call.store';
import type { CallFailure } from '../utils/call-errors';

/**
 * Hộp thoại cho lỗi gọi có HƯỚNG XỬ LÝ riêng (app.md p2-01 §3 `CallErrorDialogs`): đang ở cuộc gọi khác → "Quay lại cuộc
 * gọi", nhóm đang họp → "Vào phòng họp". Lỗi còn lại chỉ cần đọc: một nút "Đã hiểu". `Dialog` (chặn luồng, phải quyết định)
 * chứ không toast — toast tự tắt sau 5 giây, người dùng đang nhìn nút gọi chưa kịp đọc.
 */
export interface CallErrorDialogsProps {
  failure: CallFailure | null;
  onClose: () => void;
  /** Mở phòng/chi tiết cuộc họp — do nơi lắp ráp nối (feature `meetings`), `calls` không import chéo. */
  onOpenMeeting?: (meetingId: string) => void;
}

const TITLES: Record<CallFailure['kind'], string> = {
  ALREADY_ENDED: 'Cuộc gọi đã kết thúc',
  ANSWERED_ELSEWHERE: 'Đã trả lời ở thiết bị khác',
  ARCHIVED: 'Kênh đã lưu trữ',
  FEATURE_OFF: 'Chưa thể gọi',
  FULL: 'Cuộc gọi đã đầy',
  IN_OTHER_CALL: 'Bạn đang trong cuộc gọi khác',
  INVALID_TARGET: 'Không chọn được người này',
  MEETING_LIVE: 'Nhóm đang họp',
  NOT_HOST: 'Không phải chủ phòng',
  NOT_IN_ROOM: 'Không còn trong phòng',
  NO_ACCESS: 'Không thể gọi',
  OFFLINE: 'Không có kết nối mạng',
  OTHER: 'Không gọi được',
  RATE_LIMITED: 'Bạn gọi quá nhanh',
  READ_ONLY: 'Không thể gọi',
  REMOVED: 'Bạn đã được mời ra khỏi phòng',
  SCREEN_BUSY: 'Đang có người chia sẻ',
  STATE_CHANGED: 'Trạng thái đã thay đổi',
};

export function CallErrorDialogs({ failure, onClose, onOpenMeeting }: CallErrorDialogsProps) {
  if (!failure) return null;

  const backToCall = failure.kind === 'IN_OTHER_CALL';
  const openMeeting = failure.kind === 'MEETING_LIVE' && failure.meetingId && onOpenMeeting;

  const primary = backToCall
    ? {
        label: 'Quay lại cuộc gọi',
        onPress: () => {
          onClose();
          const callId = failure.activeCallId ?? callStoreApi.get().callId;
          if (callId) router.push({ params: { callId }, pathname: '/call/[callId]' });
        },
      }
    : openMeeting
      ? {
          label: 'Vào phòng họp',
          onPress: () => {
            onClose();
            if (failure.meetingId) onOpenMeeting(failure.meetingId);
          },
        }
      : { label: 'Đã hiểu', onPress: onClose };

  return (
    <Dialog
      description={failure.message}
      primaryAction={primary}
      secondaryAction={backToCall || openMeeting ? { label: 'Đóng', onPress: onClose } : undefined}
      title={TITLES[failure.kind]}
      variant={backToCall || openMeeting ? 'warning' : 'error'}
      visible
      onClose={onClose}
    />
  );
}
