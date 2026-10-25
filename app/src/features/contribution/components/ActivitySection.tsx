import { useState } from 'react';
import { View } from 'react-native';
import type { UseQueryResult } from '@tanstack/react-query';

import { Section } from '@/shared/ui/section';

import type { ContributionMember, Heatmap } from '../api/contribution.types';
import type { HeatmapRange } from '../utils/heatmap-grid';
import { ActivityHeatmap } from './ActivityHeatmap';
import { HeatmapDaySheet } from './HeatmapDaySheet';
import { HeatmapMemberPicker } from './HeatmapMemberPicker';

export interface ActivitySectionProps {
  heat: string;
  heatmap: UseQueryResult<Heatmap>;
  members: readonly ContributionMember[];
  range: HeatmapRange | null;
  weeks: number;
  onHeat: (userId: string) => void;
}

/**
 * Khối "Hoạt động" (app.md §3 "Contribution — Hoạt động"): chọn phạm vi (cả bảng / một thành viên) + biểu đồ theo ngày + bản danh sách chữ. Mọi thành viên của nhóm
 * xem được (khách/người ngoài đã bị server chặn 404). Chỉ ngày + số đếm, không giờ.
 */
export function ActivitySection({ heat, heatmap, members, range, weeks, onHeat }: ActivitySectionProps) {
  const [listOpen, setListOpen] = useState(false);

  return (
    <Section icon="calendar" title="Hoạt động">
      <View className="gap-sm">
        <HeatmapMemberPicker members={members} value={heat} onChange={onHeat} />
        <ActivityHeatmap
          data={heatmap.data}
          error={heatmap.error}
          loading={heatmap.isLoading}
          range={range}
          weeks={weeks}
          onOpenList={() => setListOpen(true)}
          onRetry={() => void heatmap.refetch()}
        />
      </View>
      <HeatmapDaySheet days={heatmap.data?.days ?? []} visible={listOpen} onClose={() => setListOpen(false)} />
    </Section>
  );
}
