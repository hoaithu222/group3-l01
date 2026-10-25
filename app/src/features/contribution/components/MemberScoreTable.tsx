import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/utils/style/cn';

import type { ContributionMember } from '../api/contribution.types';
import { formatDecimal, formatPoints, formatScore, formatShare, memberSpokenLabel } from '../utils/contribution-format';

const HEADERS = ['Điểm thẻ', 'Thẻ xong', 'Trễ hạn', 'Đúng hạn', 'Điểm chấm', 'Điểm', '% nhóm'] as const;
const NO_VALUE = '—';

export interface MemberScoreTableProps {
  members: readonly ContributionMember[];
  selectedId: string | null;
  onSelect: (member: ContributionMember) => void;
}

/** Ô số liệu của một hàng — thành phần chưa có dữ liệu là gạch ngang (KHÔNG phải 0), nhãn trợ năng của cả hàng đọc rõ "Chưa có dữ liệu". */
function cells(member: ContributionMember): string[] {
  return [
    member.components.points === null ? NO_VALUE : formatPoints(member.storyPointsDone),
    String(member.tasksDone),
    String(member.tasksLate),
    member.tasksWithDue > 0 ? `${member.tasksOnTime}/${member.tasksWithDue}` : NO_VALUE,
    member.peerScoreAvg === null ? NO_VALUE : `${formatDecimal(member.peerScoreAvg)} (${member.reviewCount})`,
    formatScore(member.score),
    formatShare(member.share),
  ];
}

/**
 * Bảng điểm cho MÁY TÍNH BẢNG (app.md §2 `MemberScoreTable`): Thành viên · Điểm thẻ · Thẻ xong · Trễ hạn · Đúng hạn · Điểm chấm · Điểm · % nhóm. Chạm
 * một hàng chọn thành viên (chi tiết ở panel bên phải hoặc tấm, tuỳ bề rộng). Bảng CHỈ ĐỌC.
 *
 * ⚠️ Tự dựng bằng `View` + `Pressable` vì bộ chung (`src/shared/ui`) chưa có component bảng dữ liệu; hàng là MỘT ô trợ năng với nhãn đủ
 * điểm/tỉ lệ/số gốc (`memberSpokenLabel`), không đọc từng ô rời rạc.
 */
export function MemberScoreTable({ members, selectedId, onSelect }: MemberScoreTableProps) {
  return (
    <View className="overflow-hidden rounded-md bg-bg-1">
      <View className="flex-row items-center gap-xs border-b border-hairline border-divider-1 px-md py-xs">
        <Text className="w-1/4 text-label-sm font-semibold text-fg-2">Thành viên</Text>
        {HEADERS.map((header) => (
          <Text key={header} className="flex-1 text-right text-label-sm font-semibold text-fg-2">
            {header}
          </Text>
        ))}
      </View>
      {members.map((member) => (
        <Pressable
          key={member.user.id}
          accessibilityLabel={memberSpokenLabel(member)}
          accessibilityRole="button"
          accessibilityState={{ selected: member.user.id === selectedId }}
          className={cn(
            'min-h-[44px] flex-row items-center gap-xs border-b border-hairline border-divider-1 px-md py-xs',
            member.user.id === selectedId && 'bg-action-tint',
          )}
          onPress={() => onSelect(member)}
        >
          <View className="w-1/4 items-start gap-3xs">
            <Text className="text-label-md font-semibold text-fg-1" numberOfLines={2}>
              {member.user.name}
            </Text>
            {member.user.membership === 'LEFT' ? <Badge label="Đã rời nhóm" size="sm" variant="neutral" /> : null}
          </View>
          {cells(member).map((value, index) => (
            <Text key={HEADERS[index]} className="flex-1 text-right text-body-md text-fg-1">
              {value}
            </Text>
          ))}
        </Pressable>
      ))}
    </View>
  );
}
