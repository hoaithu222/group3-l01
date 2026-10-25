import { useState } from 'react';

import { Input } from '@/shared/ui/input';
import { Dialog } from '@/shared/ui/modal';

import type { TaskCommentView } from '../../api/task-detail.types';

const MIN_REASON_LENGTH = 10;

export interface CommentDeleteDialogProps {
  comment: TaskCommentView | null;
  currentUserId: string;
  onClose: () => void;
  onConfirm: (comment: TaskCommentView, reason?: string) => void;
}

/**
 * Xoá bình luận: của MÌNH thì chỉ xác nhận; của NGƯỜI KHÁC (OWNER/ADMIN) BẮT BUỘC nhập lý do — BE trả 400 nếu
 * thiếu và ghi audit `task-comment.remove` + activity `COMMENT_DELETED_BY_ADMIN` (be.md §4, §5).
 */
export function CommentDeleteDialog({
  comment,
  currentUserId,
  onClose,
  onConfirm,
}: CommentDeleteDialogProps) {
  const [reason, setReason] = useState('');
  const others = comment !== null && comment.author.id !== currentUserId;
  // BE: `reasonSchema` = 10–500 ký tự sau trim (`common-schemas.ts`).
  const needsReason = others && reason.trim().length < MIN_REASON_LENGTH;

  const close = () => {
    setReason('');
    onClose();
  };

  return (
    <Dialog
      description={
        others
          ? 'Bình luận của người khác sẽ bị xoá và ghi nhật ký. Vui lòng nêu lý do.'
          : 'Bình luận sẽ bị xoá vĩnh viễn.'
      }
      primaryAction={{
        disabled: needsReason,
        label: 'Xoá',
        onPress: () => {
          if (comment) onConfirm(comment, others ? reason.trim() : undefined);
          close();
        },
      }}
      secondaryAction={{ label: 'Huỷ', onPress: close }}
      title="Xoá bình luận?"
      variant="warning"
      visible={comment !== null}
      onClose={close}
    >
      {others ? (
        <Input
          accessibilityLabel="Lý do xoá"
          hint={`Tối thiểu ${MIN_REASON_LENGTH} ký tự`}
          maxLength={500}
          placeholder="Lý do xoá"
          value={reason}
          onChangeText={setReason}
        />
      ) : null}
    </Dialog>
  );
}
