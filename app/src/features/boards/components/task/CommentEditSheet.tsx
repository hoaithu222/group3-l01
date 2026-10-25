import { useMemo, useState } from 'react';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';

import type { TaskCommentView } from '../../api/task-detail.types';
import { FALLBACK_TASK_LIMITS } from '../../constants/task-detail.constants';
import { useMentionInput, type MentionInputState } from '../../hooks/useMentionInput';
import { useEditComment } from '../../queries/task-comment-mutations.queries';
import { getErrorCode } from '../../utils/error-details';
import { serializeMentions } from '../../utils/mention-compose';
import { parseForEdit } from '../../utils/mention-content';
import { MentionTextInput } from './MentionTextInput';

export interface CommentEditSheetProps {
  boardId: string;
  comment: TaskCommentView | null;
  resolveName: (userId: string) => string | undefined;
  taskId: string;
  onClose: () => void;
}

const EDIT_ERRORS: Record<string, string> = {
  RES_003: 'Bình luận vừa được sửa ở nơi khác. Đóng rồi mở lại để lấy bản mới.',
  TASK_014: 'Có người được nhắc tên không thuộc nhóm.',
  TASK_015: 'Đã quá 15 phút nên không sửa được bình luận này nữa.',
};

/**
 * Cả tấm sửa — dựng BÊN TRONG component giữ state vì nút "Lưu" (khe `footer` của `BottomSheet`) phải đọc chữ đang sửa.
 * Tấm chỉ tồn tại khi có bình luận nên `visible` luôn bật; đóng = nơi gọi đặt `comment` về `null` (sau hiệu ứng trượt).
 */
function EditSheet({
  boardId,
  comment,
  resolveName,
  taskId,
  onClose,
}: CommentEditSheetProps & { comment: TaskCommentView }) {
  const [state, setState] = useState<MentionInputState>(() =>
    parseForEdit(comment.content, (id) => {
      const snapshot = comment.mentions.find((mention) => mention.targetId === id)?.label;
      return snapshot ?? resolveName(id);
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const edit = useEditComment(taskId);
  const input = useMentionInput({ boardId, enabled: true, onChange: setState, state });

  const serialized = useMemo(() => serializeMentions(state.text, state.picks), [state]);
  const length = [...serialized.content].length;
  const valid = state.text.trim() !== '' && length <= FALLBACK_TASK_LIMITS.commentMax;

  const save = () => {
    setError(null);
    edit.mutate(
      { comment, content: serialized.content.trim(), mentions: serialized.mentions },
      {
        onError: (failure) =>
          setError(EDIT_ERRORS[getErrorCode(failure) ?? ''] ?? toErrorMessage(failure)),
        onSuccess: onClose,
      },
    );
  };

  return (
    <BottomSheet
      // Lỗi lưu ghim dưới tiêu đề (không cuộn mất) — chữ đang sửa giữ nguyên để người dùng thử lại.
      alert={error ? <Alert description={error} tone="error" /> : undefined}
      footer={
        <Button disabled={!valid} fullWidth label="Lưu" loading={edit.isPending} onPress={save} />
      }
      scrollable
      title="Sửa bình luận"
      visible
      onClose={onClose}
    >
      <MentionTextInput autoFocus input={input} placeholder="Sửa bình luận" text={state.text} />
    </BottomSheet>
  );
}

/**
 * Sửa bình luận trong 15 phút (app.md §2 `CommentItem` menu Sửa): dùng cùng ô nhập nhắc tên với ô soạn.
 * Sửa chỉ đổi chữ + lời nhắc; tệp đính kèm giữ nguyên (`patchCommentSchema` không có tệp).
 *
 * `key` theo id bình luận để mỗi lần mở nạp lại chữ gốc (không cần effect). Không có bình luận ⇒ không dựng tấm nào
 * (tương đương `visible={false}`: `Modal` đóng không vẽ con) — nút "Lưu" ở `footer` nhờ vậy đọc thẳng state của form.
 */
export function CommentEditSheet(props: CommentEditSheetProps) {
  const { comment } = props;
  return comment ? <EditSheet key={comment.id} {...props} comment={comment} /> : null;
}
