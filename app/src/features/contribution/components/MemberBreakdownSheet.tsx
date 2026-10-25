import { BottomSheet } from '@/shared/ui/bottom-sheet';

import type { ContributionMember, ContributionWeights, PeriodKey } from '../api/contribution.types';
import { MemberBreakdownContent } from './MemberBreakdownContent';

export interface MemberBreakdownSheetProps {
  boardId: string;
  /** `null` = đóng. */
  member: ContributionMember | null;
  period: PeriodKey;
  timezone: string;
  weights: ContributionWeights;
  onClose: () => void;
}

/** Tấm chi tiết một thành viên (điện thoại; máy tính bảng ngang dùng panel bên phải). Nội dung ở `MemberBreakdownContent`. */
export function MemberBreakdownSheet({ boardId, member, period, timezone, weights, onClose }: MemberBreakdownSheetProps) {
  return (
    <BottomSheet
      description="Điểm được tính từ những thẻ dưới đây — chỉ để xem, không sửa được."
      scrollable
      title={member?.user.name ?? 'Chi tiết thành viên'}
      visible={member !== null}
      onClose={onClose}
    >
      {member ? (
        <MemberBreakdownContent boardId={boardId} member={member} period={period} timezone={timezone} weights={weights} />
      ) : null}
    </BottomSheet>
  );
}
