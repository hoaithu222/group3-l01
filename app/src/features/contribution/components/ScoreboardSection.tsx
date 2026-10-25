import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { UseQueryResult } from '@tanstack/react-query';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Card } from '@/shared/ui/card';
import { Section } from '@/shared/ui/section';
import { Skeleton, SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { cn } from '@/shared/utils/style/cn';

import type { ContributionMember, ContributionReport } from '../api/contribution.types';
import { contributionErrorMessage, isAccessLost } from '../utils/contribution-errors';
import { formatPoints } from '../utils/contribution-format';
import { MemberBreakdownContent } from './MemberBreakdownContent';
import { MemberScoreList } from './MemberScoreList';
import { MemberScoreTable } from './MemberScoreTable';

export interface ScoreboardSectionProps {
  report: UseQueryResult<ContributionReport>;
  /** Máy tính bảng: bảng thay cho danh sách. */
  tablet: boolean;
  /** Máy tính bảng ngang (≥ 840dp): chi tiết nằm ở panel bên phải; hẹp hơn thì mở tấm. */
  sidePanel: boolean;
  selected: ContributionMember | null;
  onSelect: (member: ContributionMember | null) => void;
}

/**
 * Khối "Bảng điểm" (app.md §3): điện thoại `MemberScoreList` + tấm chi tiết; máy tính bảng `MemberScoreTable` (+ panel chi tiết bên phải khi đủ rộng). Ghi chú "Điểm thẻ
 * so với người nhiều nhất nhóm (N điểm)" giải thích mẫu số. Trạng thái: khung xương 4 hàng · "Kỳ này chưa có thẻ hoàn thành" · lỗi + Thử lại (mất quyền thì không có nút).
 * Đổi kỳ: giữ bảng cũ MỜ (`isPlaceholderData`) tới khi kỳ mới về.
 */
export function ScoreboardSection({ report, tablet, sidePanel, selected, onSelect }: ScoreboardSectionProps) {
  const data = report.data;
  let body: ReactNode;

  if (!data && report.isError) {
    body = isAccessLost(report.error) ? (
      <EmptyState
        description="Bạn không còn quyền xem báo cáo của bảng này."
        icon="lock"
        size="compact"
        title="Không xem được báo cáo"
        tone="warning"
      />
    ) : (
      <Alert
        actions={<Button label="Thử lại" size="xs" variant="secondary" onPress={() => void report.refetch()} />}
        description={contributionErrorMessage(report.error)}
        title="Không tải được bảng điểm"
        tone="error"
      />
    );
  } else if (!data) {
    body = (
      // Khung xương đúng dáng hàng thành viên: thẻ · ảnh + tên · hai thanh thành phần.
      <View className="gap-sm">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index}>
            <SkeletonParagraphWithIcon />
            <Skeleton className="h-2 rounded-full" />
          </Card>
        ))}
      </View>
    );
  } else if (data.members.length === 0) {
    body = (
      <EmptyState
        description="Khi có thẻ được hoàn thành, điểm đóng góp của từng thành viên sẽ hiện ở đây."
        icon="chart-1"
        size="compact"
        title="Kỳ này chưa có thẻ hoàn thành"
      />
    );
  } else {
    const weights = data.formula.weights;
    body = (
      <View className={cn('gap-sm', report.isPlaceholderData && 'opacity-60')}>
        <Text className="text-caption-sm text-fg-2">{`Điểm thẻ so với người nhiều nhất nhóm (${formatPoints(data.maxStoryPoints)} điểm).`}</Text>
        {tablet ? (
          <View className="flex-row items-start gap-md">
            <View className="flex-1">
              <MemberScoreTable members={data.members} selectedId={selected?.user.id ?? null} onSelect={onSelect} />
            </View>
            {sidePanel ? (
              <View className="w-2/5 rounded-md bg-bg-1 p-md">
                {selected ? (
                  <MemberBreakdownContent boardId={data.boardId} member={selected} period={data.period.key} timezone={data.period.timezone} weights={weights} />
                ) : (
                  <Text className="text-body-md text-fg-2">Chọn một thành viên để xem số gốc và các thẻ được tính.</Text>
                )}
              </View>
            ) : null}
          </View>
        ) : (
          <MemberScoreList members={data.members} weights={weights} onSelect={onSelect} />
        )}
      </View>
    );
  }

  return (
    <Section icon="chart-1" title="Bảng điểm">
      {body}
    </Section>
  );
}
