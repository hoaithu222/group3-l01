import { useState } from 'react';

import { toErrorMessage } from '@/core/api/client.helpers';
import { ConfirmSheet } from '@/shared/ui/bottom-sheet';
import { Input } from '@/shared/ui/input';
import { showToast } from '@/shared/utils/toast.utils';

import type { ModerationKind } from '../../api/study.types';
import { MODERATION_REASON_MAX, MODERATION_REASON_MIN } from '../../constants/study.constants';
import { useModerateSet } from '../../queries/study-moderation.queries';

const COPY = {
  hide: {
    confirm: 'Ẩn bộ học',
    description: (title: string) =>
      `Bộ "${title}" sẽ biến khỏi danh sách của thành viên nhóm; chỉ tác giả và quản trị nhóm còn thấy. Báo cáo đang mở về bộ này sẽ được đóng. Bạn có thể khôi phục sau.`,
    done: 'Đã ẩn bộ học.',
    hint: 'Tác giả sẽ thấy lý do này và nhật ký kiểm toán cũng ghi lại.',
    icon: 'hide',
    label: 'Lý do ẩn',
    placeholder: 'Ví dụ: Nội dung không phù hợp với nhóm',
    title: 'Ẩn bộ học này?',
    tone: 'danger',
  },
  unhide: {
    confirm: 'Khôi phục',
    description: (title: string) =>
      `Bộ "${title}" sẽ hiện lại với thành viên nhóm như trước khi bị ẩn.`,
    done: 'Đã khôi phục bộ học.',
    hint: 'Lý do được ghi vào nhật ký kiểm toán.',
    icon: 'view',
    label: 'Lý do khôi phục',
    placeholder: 'Ví dụ: Đã kiểm tra lại, nội dung phù hợp',
    title: 'Khôi phục bộ học này?',
    tone: 'primary',
  },
} as const;

export interface SetModerationSheetProps {
  /** Cố định theo từng tấm: nơi gọi dựng MỘT tấm cho mỗi chiều (`hide`/`unhide`) và bật bằng `visible`. */
  kind: ModerationKind;
  setId: string;
  setTitle: string;
  visible: boolean;
  onClose: () => void;
}

/**
 * Tấm xác nhận Ẩn / Khôi phục bộ học của NHÓM (be `POST /study-sets/:id/hide|unhide`, quyền OWNER/ADMIN — server tính vào `myPermissions.hide|unhide`).
 * ⚠️ BE bắt `reason` 10–500 ký tự cho CẢ HAI chiều (khôi phục cũng vậy, không chỉ ẩn) nên tấm luôn có ô lý do và khoá nút tới khi đủ dài. Lỗi
 * (`403`, `404` bộ không còn thấy được, `409 STUDY_004` đã bị ẩn) hiện NGAY TRONG tấm, giữ lý do đã gõ; đang gửi thì khoá "Huỷ"/nền mờ/nút back
 * để không đóng tấm khi yêu cầu còn bay (việc vẫn xảy ra mà người dùng không thấy kết quả).
 */
export function SetModerationSheet({
  kind,
  onClose,
  setId,
  setTitle,
  visible,
}: SetModerationSheetProps) {
  const copy = COPY[kind];
  const moderate = useModerateSet(setId, kind);
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const tooShort = trimmed.length < MODERATION_REASON_MIN;

  function close(): void {
    if (moderate.isPending) return;
    setReason('');
    moderate.reset();
    onClose();
  }

  function submit(): void {
    moderate.mutate(
      { reason: trimmed },
      {
        onSuccess: () => {
          showToast('success', copy.done);
          setReason('');
          moderate.reset();
          onClose();
        },
      },
    );
  }

  return (
    <ConfirmSheet
      confirmDisabled={tooShort}
      confirmLabel={copy.confirm}
      description={copy.description(setTitle)}
      error={moderate.error ? toErrorMessage(moderate.error) : null}
      icon={copy.icon}
      loading={moderate.isPending}
      title={copy.title}
      tone={copy.tone}
      visible={visible}
      onClose={close}
      onConfirm={submit}
    >
      <Input
        hint={`${reason.length}/${MODERATION_REASON_MAX}`}
        label={copy.label}
        maxLength={MODERATION_REASON_MAX}
        message={
          trimmed.length > 0 && tooShort
            ? `Nhập ít nhất ${MODERATION_REASON_MIN} ký tự.`
            : `${copy.hint} Tối thiểu ${MODERATION_REASON_MIN} ký tự.`
        }
        messageTone={trimmed.length > 0 && tooShort ? 'error' : 'hint'}
        multiline
        placeholder={copy.placeholder}
        required
        value={reason}
        onChangeText={setReason}
      />
    </ConfirmSheet>
  );
}
