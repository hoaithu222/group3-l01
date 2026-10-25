import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { MockAttemptSummaryDto } from '../../api/mock-attempts.types';
import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import { describeDelta } from '../../utils/mock-history-utils';
import { attemptDurationMs, formatDurationVi } from '../../utils/mock-result-utils';
import { formatScore } from '../../utils/mock-score-utils';
import { RingGauge } from './RingGauge';

export interface HistoryRowProps {
  attempt: MockAttemptSummaryDto;
  /** Điểm hơn/kém lượt trước cùng bộ; `undefined` ⇒ không có gì để so. */
  delta?: number;
  onPress: (attempt: MockAttemptSummaryDto) => void;
}

/**
 * Một lượt thi trong lịch sử (app.md p4-02 §1 `MockHistoryScreen`): VÒNG ĐIỂM nhỏ bên trái (đầy theo điểm %, xanh nếu đạt
 * / đỏ nếu chưa — và luôn kèm CHỮ "Đạt"/"Chưa đạt" trong huy hiệu), tên bộ, ngày giờ, đúng/tổng · thời gian làm, "Tự nộp", chênh lệch so với
 * lượt trước (mũi tên + chữ). Lượt đang dở thay vòng điểm bằng ô icon đồng hồ + "Đang làm dở — Tiếp tục làm bài".
 */
export function HistoryRow({ attempt, delta, onPress }: HistoryRowProps) {
  const inProgress = attempt.status === 'IN_PROGRESS';
  const passed = attempt.passed === true;
  const pct = attempt.scorePct ?? 0;
  const used = attemptDurationMs(attempt);
  const usedText = used === null ? '' : formatDurationVi(used);
  const took = usedText ? `, làm trong ${usedText}` : '';
  const summary = inProgress
    ? 'Đang làm dở'
    : `${formatScore(pct)}%, ${passed ? 'đạt' : 'chưa đạt'}, đúng ${attempt.correctCount ?? 0} trên ${attempt.total} câu${took}`;

  return (
    <View className="px-md py-2xs">
      <Pressable
        accessibilityHint={inProgress ? 'Mở để tiếp tục làm bài' : 'Mở kết quả'}
        accessibilityLabel={`${attempt.setTitle}. ${formatDateTime(attempt.startedAt)}. ${summary}`}
        accessibilityRole="button"
        // `active:opacity-80`: thẻ mờ nhẹ đúng lúc chạm (Android không có gợn sóng mặc định) — cùng mức `Card onPress`.
        className="min-h-11 rounded-md border border-border-1 bg-bg-1 p-sm active:opacity-80"
        onPress={() => onPress(attempt)}
      >
        <View className="flex-row items-center gap-sm">
          {inProgress ? (
            <IconTile name={STUDY_MODE_META.mock.icon} size="lg" tone="warning" />
          ) : (
            <RingGauge
              progress={pct / 100}
              size={48}
              strokeWidth={5}
              tone={passed ? 'success' : 'error'}
            >
              <Text className="text-label-sm font-semibold text-fg-1" maxFontSizeMultiplier={1.2}>
                {`${formatScore(pct)}%`}
              </Text>
            </RingGauge>
          )}
          <View className="flex-1 gap-3xs">
            <View className="flex-row items-center justify-between gap-sm">
              <Text className="flex-1 text-label-lg text-fg-1" numberOfLines={2}>
                {attempt.setTitle}
              </Text>
              {inProgress ? (
                <Badge label="Đang làm dở" size="sm" variant="warning" />
              ) : (
                <Badge
                  label={passed ? 'Đạt' : 'Chưa đạt'}
                  size="sm"
                  variant={passed ? 'success' : 'error'}
                />
              )}
            </View>
            <Text className="text-caption-lg text-fg-2">{formatDateTime(attempt.startedAt)}</Text>
            {inProgress ? (
              <Text className="text-label-md text-info">Tiếp tục làm bài</Text>
            ) : (
              <View className="flex-row flex-wrap items-center gap-xs">
                <Text className="text-body-md text-fg-2">
                  {`Đúng ${attempt.correctCount ?? 0}/${attempt.total} câu`}
                  {usedText ? ` · ${usedText}` : ''}
                  {attempt.submitMode === 'AUTO' ? ' · Tự nộp' : ''}
                </Text>
                {delta === undefined ? null : (
                  <View
                    accessibilityLabel={describeDelta(delta)}
                    accessible
                    className="flex-row items-center gap-3xs"
                  >
                    {delta === 0 ? null : (
                      <Icon
                        color={delta > 0 ? 'success' : 'error'}
                        name={delta > 0 ? 'arrow-up-small' : 'arrow-down-small'}
                        size={16}
                      />
                    )}
                    <Text className="text-label-sm text-fg-2">
                      {delta === 0
                        ? 'Bằng lượt trước'
                        : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} điểm`}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
          <Icon color="fg-2" name="arrow-right-small" size="sm" />
        </View>
      </Pressable>
    </View>
  );
}
