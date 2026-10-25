import { View } from 'react-native';

import type { ContributionMember, ContributionWeights } from '../api/contribution.types';
import { MemberScoreRow } from './MemberScoreRow';

export interface MemberScoreListProps {
  members: readonly ContributionMember[];
  weights: ContributionWeights;
  onSelect: (member: ContributionMember) => void;
}

/**
 * Danh sách thành viên trên ĐIỆN THOẠI (app.md §2 `MemberScoreList`), đã sắp theo điểm giảm dần từ server; chạm một hàng mở tấm chi tiết.
 * Dựng bằng `.map()` chứ không `FlatList`/`FlashList`: danh sách nằm trong vùng cuộn của cả màn (còn công thức, biểu đồ hoạt động ở trên/dưới) —
 * lồng hai vùng cuộn cùng chiều là cảnh báo "VirtualizedLists should never be nested" — và một bảng chỉ có vài chục thành viên.
 */
export function MemberScoreList({ members, weights, onSelect }: MemberScoreListProps) {
  return (
    <View className="gap-sm">
      {members.map((member) => (
        <MemberScoreRow key={member.user.id} member={member} weights={weights} onPress={onSelect} />
      ))}
    </View>
  );
}
