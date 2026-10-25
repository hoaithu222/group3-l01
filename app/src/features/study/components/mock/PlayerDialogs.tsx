import { Dialog } from '@/shared/ui/modal';

import { describeSubmit } from '../../utils/mock-nav-utils';

export interface PlayerDialogsProps {
  /** Hộp thoại "Nộp bài?" đang mở. */
  confirming: boolean;
  /** Hộp thoại "Thoát bài thi?" đang mở. */
  exiting: boolean;
  /** Số câu còn đánh dấu xem lại — nhắc ngay lúc sắp nộp. */
  flaggedCount: number;
  submitting: boolean;
  /** Số câu chưa trả lời. */
  unanswered: number;
  onCloseConfirm: () => void;
  onCloseExit: () => void;
  onLeave: () => void;
  onSubmit: () => void;
}

/**
 * Hai hộp thoại BẮT người dùng quyết định của màn thi (app.md p4-02 §7): xác nhận nộp bài (nêu số câu bỏ trống/đang đánh
 * dấu) và xác nhận thoát (bài vẫn tính giờ khi thoát — cả nút Back phần cứng cũng phải qua đây).
 */
export function PlayerDialogs({
  confirming,
  exiting,
  flaggedCount,
  onCloseConfirm,
  onCloseExit,
  onLeave,
  onSubmit,
  submitting,
  unanswered,
}: PlayerDialogsProps) {
  return (
    <>
      <Dialog
        description={describeSubmit(unanswered, flaggedCount)}
        primaryAction={{ label: 'Nộp bài', loading: submitting, onPress: onSubmit }}
        secondaryAction={{ label: 'Làm tiếp', onPress: onCloseConfirm }}
        title="Nộp bài?"
        visible={confirming}
        onClose={onCloseConfirm}
      />
      <Dialog
        description="Bài thi vẫn tính giờ khi bạn thoát. Quay lại trước khi hết giờ để tiếp tục."
        primaryAction={{ label: 'Thoát', onPress: onLeave }}
        secondaryAction={{ label: 'Ở lại', onPress: onCloseExit }}
        title="Thoát bài thi?"
        variant="warning"
        visible={exiting}
        onClose={onCloseExit}
      />
    </>
  );
}
