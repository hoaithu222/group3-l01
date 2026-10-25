import { useState } from 'react';

import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { Input } from '@/shared/ui/input';

/** Cùng ngưỡng `reasonSchema` của `remove` (p1-02): lý do ≥ 10 ký tự. */
const REASON_MIN_LENGTH = 10;
const DEFAULT_REASON = 'Thu hồi quyền khách';

export interface RevokeGuestSheetProps {
  loading: boolean;
  name: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  visible: boolean;
}

/**
 * "Thu hồi quyền khách ngay" (app.md p3-04 §3) — nêu HẬU QUẢ trước khi bấm (app.md
 * §7: tránh "Kick"). Đi qua `POST …/members/:userId/remove` có sẵn của p1-02 (be.md
 * README §5: "remove (có)") nên vẫn cần lý do ≥ 10 ký tự; điền sẵn một câu mặc định
 * để thu hồi nhanh khi hết việc, người mời vẫn sửa được.
 */
export function RevokeGuestSheet({
  loading,
  name,
  onClose,
  onConfirm,
  visible,
}: RevokeGuestSheetProps) {
  return (
    <RevokeGuestSheetContent
      key={visible ? 'open' : 'closed'}
      loading={loading}
      name={name}
      visible={visible}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

/**
 * State `reason` khởi tạo lại mỗi lần mở (qua `key`) — không giữ lý do của lượt trước.
 *
 * ✅ Hàng nút đáy [Thu hồi quyền khách / Huỷ] qua `SheetActions tone="danger"`, cùng khuôn `MemberModerationSheet` (lý do ≥ 10 ký tự
 * cho cùng đường `remove`) — bản cũ chỉ có MỘT nút đỏ ở đáy, đường lui duy nhất là ✕ góc trên, xa ngón cái.
 * ⚠️ `layout="column"`: nhãn "Thu hồi quyền khách" (19 ký tự) ở nửa hàng máy 360dp bị cắt thành "Thu hồi quyền…". Đang gửi thì khoá
 * "Huỷ" và nền mờ: đóng tấm giữa lúc yêu cầu đang bay là việc vẫn xảy ra mà người dùng tưởng đã huỷ.
 */
function RevokeGuestSheetContent({
  loading,
  name,
  onClose,
  onConfirm,
  visible,
}: RevokeGuestSheetProps) {
  const [reason, setReason] = useState(DEFAULT_REASON);
  const valid = reason.trim().length >= REASON_MIN_LENGTH;

  return (
    <BottomSheet
      description="Khách mất quyền vào mọi kênh được chỉ định ngay lập tức và tự rời các nhóm chat của nhóm. Tin nhắn cũ vẫn giữ lại."
      dismissOnBackdrop={!loading}
      footer={
        <SheetActions
          layout="column"
          primary={{
            disabled: !valid,
            label: 'Thu hồi quyền khách',
            loading,
            onPress: () => onConfirm(reason.trim()),
          }}
          secondary={{ disabled: loading, label: 'Huỷ', onPress: onClose }}
          tone="danger"
        />
      }
      scrollable
      title={`Thu hồi quyền khách của ${name}?`}
      visible={visible}
      onClose={onClose}
    >
      <Input
        label="Lý do"
        message={valid ? undefined : `Nhập ít nhất ${REASON_MIN_LENGTH} ký tự.`}
        placeholder="Ví dụ: Đã hết thời gian hợp tác"
        value={reason}
        onChangeText={setReason}
      />
    </BottomSheet>
  );
}
