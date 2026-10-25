import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';

import type { ContributionMember, ContributionWeights, PeriodKey } from '../api/contribution.types';
import { useMemberTasks } from '../queries/activity.queries';
import {
  COMPONENT_KEYS,
  COMPONENT_LABELS,
  componentRaw,
  formatScore,
  formatShare,
  redistributionNote,
  weightsUsedText,
} from '../utils/contribution-format';
import { contributionErrorMessage } from '../utils/contribution-errors';
import { ComponentLine } from './ComponentLine';
import { MemberTaskRow } from './MemberTaskRow';

export interface MemberBreakdownContentProps {
  boardId: string;
  member: ContributionMember;
  period: PeriodKey;
  timezone: string;
  /** Trọng số ĐÃ CẤU HÌNH của bảng — để nói "20 % đúng hạn được chia lại…". */
  weights: ContributionWeights;
}

/**
 * Ruột của chi tiết một thành viên (app.md §3 `MemberBreakdownSheet`) — dùng chung cho tấm (điện thoại) và panel bên phải (máy tính bảng):
 * số gốc từng thành phần, câu công thức áp số do SERVER dựng ("60 × 8/8 + 20 × 3/4 + 20 × 8,0/10 = 91,0"), trọng số đã chia lại (nếu có), rồi danh
 * sách thẻ được tính (cursor 50/trang, "Tải thêm"). Danh sách dựng bằng `.map()` chứ không `FlatList`: nội dung nằm trong vùng cuộn của tấm/panel.
 */
export function MemberBreakdownContent({
  boardId,
  member,
  period,
  timezone,
  weights,
}: MemberBreakdownContentProps) {
  const tasks = useMemberTasks(boardId, member.user.id, period);
  const items = tasks.data?.pages.flatMap((page) => page.items) ?? [];
  const note = redistributionNote(member, weights);

  return (
    <View className="gap-md pb-md">
      <View className="gap-sm">
        {/* Ảnh đại diện mở đầu hàng điểm: ở panel máy tính bảng (không có tiêu đề tấm) đây là chỗ DUY NHẤT nói "của ai". */}
        <View className="flex-row items-center gap-sm">
          <Avatar
            name={member.user.name}
            size="md"
            source={member.user.avatarUrl ? { uri: member.user.avatarUrl } : undefined}
          />
          <View className="flex-1 flex-row items-baseline justify-between gap-xs">
            <Text className="text-header-md font-semibold text-fg-1">{`${formatScore(member.score)} điểm`}</Text>
            <Text className="text-body-md text-fg-2">{`${formatShare(member.share)} của nhóm`}</Text>
          </View>
        </View>
        {COMPONENT_KEYS.map((key) => (
          <ComponentLine
            key={key}
            label={COMPONENT_LABELS[key]}
            raw={componentRaw(key, member)}
            value={member.components[key]}
          />
        ))}
        {note ? <Text className="text-caption-sm text-fg-2">{note}</Text> : null}
      </View>

      <View className="gap-3xs rounded-sm bg-bg-2 p-sm">
        <Text className="text-label-md font-semibold text-fg-1">Công thức áp số</Text>
        <Text className="text-body-md text-fg-1">{member.explanation}</Text>
        {weightsUsedText(member) ? (
          <Text className="text-caption-sm text-fg-2">{`Trọng số áp dụng: ${weightsUsedText(member)}`}</Text>
        ) : null}
      </View>

      {/* `Section tone="default"` = đúng kiểu tiêu đề nhóm cũ (16 semibold `fg-1`, mốc `header`, khe 8), dựng từ bộ chung. */}
      <Section title="Thẻ được tính" tone="default">
        {tasks.isLoading ? (
          <View className="gap-sm">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-16 rounded-xs" />
            ))}
          </View>
        ) : tasks.isError && items.length === 0 ? (
          // Cùng khuôn trạng thái lỗi của mọi danh sách khác (`EmptyState` gọn + "Thử lại") — không phải hộp cảnh báo đỏ giữa nội dung.
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void tasks.refetch() }]}
            description={contributionErrorMessage(tasks.error)}
            icon="alert-warning"
            size="compact"
            title="Không tải được danh sách thẻ"
            tone="danger"
          />
        ) : items.length === 0 ? (
          <EmptyState
            description="Chưa có thẻ nào được tính cho thành viên này trong kỳ đang xem."
            icon="checkmark-square"
            size="compact"
            title="Chưa có thẻ nào được tính"
          />
        ) : (
          <View>
            {items.map((task) => (
              <MemberTaskRow key={task.taskId} task={task} timezone={timezone} />
            ))}
            {tasks.hasNextPage ? (
              // Canh giữa: `Button` không `fullWidth` ôm sát chữ, để trần là viên thuốc nhỏ dạt trái dưới danh sách.
              <View className="items-center pt-sm">
                <Button
                  label="Tải thêm"
                  loading={tasks.isFetchingNextPage}
                  variant="secondary"
                  onPress={() => void tasks.fetchNextPage()}
                />
              </View>
            ) : null}
          </View>
        )}
      </Section>
    </View>
  );
}
