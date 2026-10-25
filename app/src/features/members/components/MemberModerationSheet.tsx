import { useState } from 'react';

import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { Input } from '@/shared/ui/input';

const REASON_MIN_LENGTH = 10;

export type ModerationAction = 'REMOVE' | 'BAN' | 'UNBAN';

const TITLE: Record<ModerationAction, (name: string) => string> = {
  REMOVE: (name) => `Loại ${name} khỏi nhóm?`,
  BAN: (name) => `Chặn ${name}?`,
  UNBAN: (name) => `Gỡ chặn ${name}?`,
};

/**
 * Đoạn hậu quả (app.md p1-02 §3) — KHÔNG dùng từ "Kick"/"Ban", nói rõ điều sẽ
 * xảy ra thay vì chỉ đặt tên hành động.
 */
const CONSEQUENCE: Record<ModerationAction, string> = {
  REMOVE:
    'Người này sẽ mất quyền truy cập các kênh riêng tư và tự động rời khỏi mọi nhóm chat của nhóm. Tin nhắn cũ vẫn giữ tên hiển thị dạng "Đã rời nhóm".',
  BAN: 'Người này sẽ mất quyền truy cập các kênh riêng tư, tự động rời khỏi mọi nhóm chat của nhóm, và không thể vào lại bằng link mời cho tới khi được gỡ chặn.',
  UNBAN:
    'Người này chỉ hết bị chặn — không tự động vào lại nhóm. Cần một link mời mới để tham gia lại.',
};

const CONFIRM_LABEL: Record<ModerationAction, string> = {
  REMOVE: 'Loại khỏi nhóm',
  BAN: 'Chặn',
  UNBAN: 'Gỡ chặn',
};

/** Chỉ REMOVE/BAN mới là nút NGUY HIỂM (màu cảnh báo) — UNBAN là hành động sửa sai, trung tính. */
const CONFIRM_TONE: Record<ModerationAction, 'danger' | 'primary'> = {
  REMOVE: 'danger',
  BAN: 'danger',
  UNBAN: 'primary',
};

export interface MemberModerationSheetProps {
  action: ModerationAction | null;
  loading: boolean;
  memberName: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Xác nhận loại/chặn/gỡ chặn — tên, hậu quả, ô lý do ≥ 10 ký tự (app.md §3, §8).
 * `BottomSheet` + hàng nút đáy `SheetActions` (`tone="danger"` cho loại/chặn):
 * `Dialog` dùng chung KHÔNG có biến thể nút "nguy hiểm" cho hành động chính, mà
 * README §7 đòi "nút nguy hiểm màu cảnh báo + chữ" — nên không dùng `Dialog`.
 * Không phải `ConfirmSheet` vì có Ô NHẬP nhiều dòng: thân phải cuộn được khi bàn phím mở.
 * ⚠️ Bản cũ đặt hai `Button fullWidth` trần trong `flex-row` — hai khối `width: 100%` không co, nút xác nhận bị đẩy ra mép tấm.
 */
export function MemberModerationSheet({
  action,
  loading,
  memberName,
  onClose,
  onConfirm,
}: MemberModerationSheetProps) {
  return (
    <MemberModerationSheetContent
      key={action ?? 'closed'}
      action={action}
      loading={loading}
      memberName={memberName}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

/**
 * Nội dung tách riêng — state `reason` KHỞI TẠO LẠI mỗi lần `action` đổi (qua
 * `key` ở component cha), tránh giữ lý do của lượt xác nhận TRƯỚC khi mở lại
 * sheet cho một hành động khác.
 */
function MemberModerationSheetContent({
  action,
  loading,
  memberName,
  onClose,
  onConfirm,
}: MemberModerationSheetProps) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const reasonValid = trimmed.length >= REASON_MIN_LENGTH;

  return (
    <BottomSheet
      description={action ? CONSEQUENCE[action] : undefined}
      dismissOnBackdrop={!loading}
      footer={
        action ? (
          <SheetActions
            primary={{
              disabled: !reasonValid,
              label: CONFIRM_LABEL[action],
              loading,
              onPress: () => onConfirm(trimmed),
            }}
            // Đang gửi thì khoá "Huỷ" (cùng lý do `dismissOnBackdrop`): huỷ giữa chừng là đóng tấm mà việc vẫn xảy ra.
            secondary={{ disabled: loading, label: 'Huỷ', onPress: onClose }}
            tone={CONFIRM_TONE[action]}
          />
        ) : undefined
      }
      scrollable
      title={action ? TITLE[action](memberName) : ''}
      visible={action !== null}
      onClose={onClose}
    >
      <Input
        disabled={loading}
        label="Lý do"
        message={reason.length > 0 && !reasonValid ? 'Lý do tối thiểu 10 ký tự' : undefined}
        multiline
        placeholder="Nhập lý do (tối thiểu 10 ký tự)"
        required
        value={reason}
        onChangeText={setReason}
      />
    </BottomSheet>
  );
}
