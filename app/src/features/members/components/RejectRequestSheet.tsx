import { useState } from 'react';

import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { Input } from '@/shared/ui/input';

import { INVITE_MESSAGE_MAX } from '../api';

export interface RejectRequestSheetProps {
  /** Tên người bị từ chối — nói rõ ai ở tiêu đề để bấm nhầm dòng thì còn kịp thấy. */
  name: string;
  onClose: () => void;
  onConfirm: (reason: string | undefined) => void;
  visible: boolean;
}

/**
 * Từ chối yêu cầu tham gia, lý do TUỲ CHỌN (app.md p3-04 §3). Người bị từ chối xin lại được sau 24 giờ (be.md §5.5).
 *
 * ✅ Hàng nút đáy [Huỷ | Từ chối] qua `SheetActions tone="danger"` — bản cũ chỉ có MỘT nút đỏ ở đáy: đường lui duy nhất là ✕ góc
 * trên, xa ngón cái, trong khi bấm nhầm "Từ chối" là người kia phải chờ 24 giờ mới xin lại được.
 * ⚠️ Không phải `ConfirmSheet` (cùng lý do `MemberModerationSheet`): ô lý do NHIỀU DÒNG ⇒ thân phải cuộn được khi bàn phím mở, mà
 * thân của `ConfirmSheet` không cuộn — máy nhỏ mở bàn phím là ô nhập bị cắt.
 */
export function RejectRequestSheet({ name, onClose, onConfirm, visible }: RejectRequestSheetProps) {
  const [reason, setReason] = useState('');

  function confirm(): void {
    onConfirm(reason.trim() || undefined);
    setReason('');
  }

  return (
    <BottomSheet
      description="Người này có thể xin vào lại sau 24 giờ."
      footer={
        <SheetActions
          primary={{ label: 'Từ chối', onPress: confirm }}
          secondary={{ label: 'Huỷ', onPress: onClose }}
          tone="danger"
        />
      }
      scrollable
      title={`Từ chối ${name}?`}
      visible={visible}
      onClose={onClose}
    >
      <Input
        hint={`${reason.length}/${INVITE_MESSAGE_MAX}`}
        label="Lý do (tuỳ chọn)"
        labelInside
        maxLength={INVITE_MESSAGE_MAX}
        multiline
        placeholder="Vì sao bạn từ chối yêu cầu này?"
        value={reason}
        onChangeText={setReason}
      />
    </BottomSheet>
  );
}
