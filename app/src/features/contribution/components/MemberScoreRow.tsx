import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';

import type { ContributionMember, ContributionWeights } from '../api/contribution.types';
import {
  COMPONENT_KEYS,
  COMPONENT_LABELS,
  componentRaw,
  formatScore,
  formatShare,
  redistributionNote,
} from '../utils/contribution-format';
import { ComponentLine } from './ComponentLine';

export interface MemberScoreRowProps {
  member: ContributionMember;
  /** Trọng số ĐÃ CẤU HÌNH — để nói "20 % đúng hạn được chia lại…" đúng con số người đọc thấy ở thẻ công thức. */
  weights: ContributionWeights;
  onPress: (member: ContributionMember) => void;
}

/**
 * Hàng thành viên trên ĐIỆN THOẠI (app.md §2 `MemberScoreRow`): ảnh + tên (+ nhãn CHỮ "Đã rời nhóm" — người đã rời vẫn hiện, không ẩn khỏi kỳ họ
 * có đóng góp), điểm "91,0" và "% nhóm", rồi ba thành phần MỖI cái có số gốc + phần trăm. Thành phần chưa có dữ liệu hiện chữ và câu chia lại
 * trọng số, không hiện 0. Chạm cả hàng mở tấm chi tiết. Không có nút sửa điểm ở đâu cả — bảng chỉ đọc.
 */
export function MemberScoreRow({ member, weights, onPress }: MemberScoreRowProps) {
  const note = redistributionNote(member, weights);

  return (
    <Card className="gap-sm" onPress={() => onPress(member)}>
      <View className="flex-row items-center gap-sm">
        <Avatar
          name={member.user.name}
          size="md"
          source={member.user.avatarUrl ? { uri: member.user.avatarUrl } : undefined}
        />
        <View className="flex-1 items-start gap-3xs">
          <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={1}>
            {member.user.name}
          </Text>
          {member.user.membership === 'LEFT' ? <Badge label="Đã rời nhóm" size="sm" variant="neutral" /> : null}
        </View>
        <View className="items-end">
          <Text className="text-header-sm font-semibold text-fg-1">{formatScore(member.score)}</Text>
          <Text className="text-caption-sm text-fg-2">{`${formatShare(member.share)} nhóm`}</Text>
        </View>
      </View>
      {COMPONENT_KEYS.map((key) => (
        <ComponentLine key={key} label={COMPONENT_LABELS[key]} raw={componentRaw(key, member)} value={member.components[key]} />
      ))}
      {note ? <Text className="text-caption-sm text-fg-2">{note}</Text> : null}
    </Card>
  );
}
