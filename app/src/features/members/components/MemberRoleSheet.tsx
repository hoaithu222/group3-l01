import { toErrorMessage } from '@/core/api/client.helpers';
import { SelectSheet, type SelectOption } from '@/shared/ui/select';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { MemberCard } from '../api';
import { usePatchMember } from '../queries/members.queries';

const ROLE_OPTIONS: SelectOption[] = [
  { label: 'Quản trị viên', value: 'ADMIN' },
  { label: 'Thành viên', value: 'MEMBER' },
];

export interface MemberRoleSheetProps {
  card: Pick<MemberCard, 'role' | 'userId'>;
  onClose: () => void;
  visible: boolean;
  wsId: string;
}

/**
 * Tấm "Đổi vai trò" của `MemberCardSheet` — tách ra để thẻ nằm dưới trần 200 dòng (`check:file-size`). Chọn là gửi ngay, như
 * trước; xong thì rung báo thành công cùng toast (`hapticSuccess`).
 *
 * ⚠️ Không thêm `Dialog` xác nhận SAU khi chọn: tấm chọn đang đóng dở mà mở lớp phủ thứ hai thì iOS có thể bỏ qua nó (một
 * view controller chỉ trình bày được một lớp mỗi lúc) — hộp xác nhận không hiện, người dùng tưởng đã đổi. Đổi vai trò hoàn
 * tác được ngay trong chính tấm này; việc KHÔNG hoàn tác (loại, chặn) vẫn đi qua `MemberModerationSheet`.
 */
export function MemberRoleSheet({ card, onClose, visible, wsId }: MemberRoleSheetProps) {
  const patchMember = usePatchMember(wsId);

  return (
    <SelectSheet
      options={ROLE_OPTIONS}
      title="Đổi vai trò"
      value={card.role}
      visible={visible}
      onChange={(value) => {
        onClose();
        patchMember.mutate(
          { userId: card.userId, payload: { role: value as 'ADMIN' | 'MEMBER' } },
          {
            onSuccess: () => {
              hapticSuccess();
              showToast('success', 'Đã đổi vai trò.');
            },
            onError: (mutationError) => showToast('error', toErrorMessage(mutationError)),
          },
        );
      }}
      onClose={onClose}
    />
  );
}
