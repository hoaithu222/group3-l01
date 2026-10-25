import { useState } from 'react';
import { Text, View } from 'react-native';

import { LinkButton } from '@/shared/ui/button';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type { RoadmapPhaseDto } from '../../api/roadmap.types';
import type { PhaseStats } from '../../types/roadmap-insights.types';
import { MetaTag } from '../common/MetaTag';
import { ProgressBar } from '../common/ProgressBar';

export interface PhaseHeaderProps {
  /** Số buổi tuỳ chọn trong tháng — ghi rõ để "8 buổi" không bị hiểu là 8 buổi bắt buộc. */
  optionalCount: number;
  phase: RoadmapPhaseDto;
  stats: PhaseStats | undefined;
  tone: IconTileTone;
  unit: string;
}

/** Tóm tắt dài hơn chừng này ký tự thì thu gọn 3 dòng + "Xem thêm" (tóm tắt tháng của giáo trình dài 1–2 câu liệt kê). */
const SUMMARY_COLLAPSE_CHARS = 140;

/**
 * Thẻ đầu của THÁNG đang chọn: giai đoạn · tên tháng · tóm tắt (thu gọn được) · tiến độ tháng theo màu tháng.
 * Thay dòng "● Giai đoạn 1 — Nền móng giao diện" mảnh cũ — người học không biết tháng này học gì và đã đi được bao xa.
 */
export function PhaseHeader({ optionalCount, phase, stats, tone, unit }: PhaseHeaderProps) {
  const [expanded, setExpanded] = useState(false);
  const summary = phase.summary?.trim() ?? '';
  const collapsible = summary.length > SUMMARY_COLLAPSE_CHARS;
  const total = stats?.total ?? 0;
  const done = stats?.done ?? 0;

  return (
    <View className="gap-sm rounded-md bg-bg-1 p-md">
      <View className="gap-3xs">
        {phase.stageLabel ? <Text className="text-caption-lg text-fg-2">{phase.stageLabel}</Text> : null}
        <Text accessibilityRole="header" className="text-header-sm font-semibold text-fg-1">
          {phase.title}
        </Text>
      </View>

      {summary ? (
        <View className="items-start gap-2xs">
          <Text className="text-body-md text-fg-2" numberOfLines={collapsible && !expanded ? 3 : undefined}>
            {summary}
          </Text>
          {collapsible ? (
            <LinkButton
              label={expanded ? 'Thu gọn' : 'Xem thêm'}
              size="sm"
              onPress={() => setExpanded((current) => !current)}
            />
          ) : null}
        </View>
      ) : null}

      {total > 0 ? (
        <View className="gap-xs">
          <View className="flex-row flex-wrap items-center justify-between gap-xs">
            <Text className="text-caption-lg text-fg-2">
              {`Đã học ${String(done)}/${String(total)} ${unit}${optionalCount > 0 ? ` · ${String(optionalCount)} tuỳ chọn` : ''}`}
            </Text>
            {stats?.state === 'done' ? (
              <MetaTag icon="checkmark-circle" label="Hoàn thành tháng" tone="success" />
            ) : stats?.state === 'current' ? (
              <MetaTag icon="flash" label="Đang học tháng này" tone="brand" />
            ) : null}
          </View>
          <ProgressBar
            accessibilityLabel={`Tháng ${String(phase.index)}: đã học ${String(done)} trên ${String(total)} ${unit}`}
            percent={(done / total) * 100}
            tone={stats?.state === 'done' ? 'success' : tone}
          />
        </View>
      ) : null}
    </View>
  );
}
