import { Text, View } from 'react-native';

import { useIsUserBlocked } from '@/shared/hooks/useBlockedIds';
import { useModerationActions } from '@/shared/hooks/useModerationActions';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import type { ReadOnlyReason } from '../api/conversations.types';

const REASON_TEXT: Record<ReadOnlyReason | 'SELF', string> = {
  NO_SHARED_WORKSPACE: 'Bạn chỉ nhắn được với người cùng nhóm',
  BLOCKED: 'Bạn không thể nhắn tin cho người này',
  DISSOLVED: 'Nhóm đã giải tán — bạn vẫn xem được lịch sử',
  ARCHIVED: 'Nhóm làm việc đã lưu trữ — bạn vẫn xem được lịch sử',
  SELF: 'Không thể nhắn tin cho chính bạn',
};

export interface ReadOnlyBarProps {
  reason: ReadOnlyReason | 'SELF' | null;
  /**
   * Người còn lại của hội thoại 1-1 (p1-08). Có thì khi `reason = BLOCKED` MÀ CHÍNH MÌNH là người chặn, thanh này
   * gợi ý "Bỏ chặn để nhắn" kèm nút Bỏ chặn (README §2). Người BỊ chặn không bao giờ vào nhánh đó — app không có
   * cách nào biết mình bị chặn — nên vẫn chỉ thấy câu TRUNG TÍNH "Bạn không thể nhắn tin cho người này".
   */
  peer?: { userId: string; name: string };
}

/** app.md §3 — thanh thay Composer khi không thể gửi, cùng khuôn với `Composer.tsx` nội bộ của `chat` (canWrite=false). */
export function ReadOnlyBar({ reason, peer }: ReadOnlyBarProps) {
  const blockedByMe = useIsUserBlocked(peer?.userId);
  const { unblockUser } = useModerationActions();
  const canUnblock = reason === 'BLOCKED' && peer !== undefined && blockedByMe;

  return (
    <View className="flex-row items-center gap-2xs border-t border-divider-1 bg-bg-1 px-md py-sm">
      {/* `fg-2` chứ không `fg-3`: hình phi văn bản cần ≥ 3:1 — `fg-3` tối đa 2.96:1, ổ khoá (lý do KHÔNG gửi được) gần như vô hình. */}
      <Icon color="fg-2" name="lock" size={16} />
      <Text className="flex-1 text-caption-sm text-fg-2">
        {canUnblock
          ? 'Bạn đã chặn người này. Bỏ chặn để nhắn tin.'
          : reason
            ? REASON_TEXT[reason]
            : 'Bạn không thể gửi tin ở đây.'}
      </Text>
      {canUnblock ? <Button label="Bỏ chặn" size="sm" variant="tertiary" onPress={() => unblockUser(peer.userId, peer.name)} /> : null}
    </View>
  );
}
