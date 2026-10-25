import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { MockAttemptDto } from '../../api/mock-attempts.types';
import { useScoreCountUp } from '../../hooks/useScoreCountUp';
import { formatScore, scoreVerdict } from '../../utils/mock-score-utils';
import { RingGauge } from '../mock/RingGauge';
import { ScoreBreakdown } from './ScoreBreakdown';
import { ScoreMeta } from './ScoreMeta';

/**
 * Điểm + Đạt/Chưa đạt (app.md p4-02 §2 `ScoreSummary`) — TÂM ĐIỂM của màn kết quả: vòng điểm lớn (số chạy lên khi mở màn,
 * đứng yên nếu bật Giảm chuyển động) có vạch mốc ngưỡng đạt, kết quả bằng CHỮ + icon (không chỉ màu), nhận xét ngắn theo
 * mức điểm, phân rã Đúng/Sai/Bỏ trống, rồi thời gian làm / tự nộp / số lần rời app.
 *
 * ⚠️ Số đang chạy chỉ để nhìn: nhãn trợ năng của vòng đọc điểm THẬT (`formatScore(pct)`), không đọc số trung gian.
 */
export function ScoreSummary({ attempt }: { attempt: MockAttemptDto }) {
  const passed = attempt.passed === true;
  const pct = attempt.scorePct ?? 0;
  const shown = useScoreCountUp(pct);
  const verdict = scoreVerdict(pct, attempt.passPct, passed);
  const resultLabel = `${passed ? 'Đạt' : 'Chưa đạt'} (ngưỡng ${attempt.passPct}%)`;

  return (
    <Card title={attempt.setTitle}>
      <View className="items-center gap-md">
        <View accessibilityLabel={`Điểm ${formatScore(pct)} phần trăm. ${resultLabel}`} accessible>
          <RingGauge
            marker={attempt.passPct / 100}
            progress={shown / 100}
            size={176}
            strokeWidth={14}
            tone={passed ? 'success' : 'error'}
          >
            <Text className="text-display font-bold text-fg-1" maxFontSizeMultiplier={1.2}>
              {shown === pct ? formatScore(pct) : String(shown)}
              <Text className="text-header-sm font-semibold text-fg-2">%</Text>
            </Text>
          </RingGauge>
        </View>
        <View className="items-center gap-3xs">
          <View className="flex-row items-center gap-xs">
            <Icon
              color={passed ? 'success' : 'error'}
              name={passed ? 'checkmark-circle' : 'clear-circle'}
            />
            {/* `cn()` chứ không chuỗi mẫu: NativeWind áp class theo độ ưu tiên CSS, không theo thứ tự trong chuỗi. */}
            <Text className={cn('text-label-lg', passed ? 'text-success' : 'text-error')}>
              {resultLabel}
            </Text>
          </View>
          <Text className="text-center text-header-sm text-fg-1">{verdict.headline}</Text>
          <Text className="text-center text-body-md text-fg-2">{verdict.message}</Text>
        </View>
        <ScoreBreakdown attempt={attempt} />
        <ScoreMeta attempt={attempt} />
      </View>
    </Card>
  );
}
