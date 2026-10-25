import { Text, View } from 'react-native';

import { useResponsiveValue } from '@/shared/theme';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';

import type { SrSummary } from '../../api/sr.types';
import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import { CompletionRing } from '../flashcard/CompletionRing';
import { SrWeekStrip } from './SrWeekStrip';

/**
 * Trạng thái "Đã ôn xong" (hôm nay không còn thẻ đến hạn): vòng đầy + dấu tích, "Mai ôn N thẻ" (số thật của ngày đầu trong
 * `dueNext7Days`) và lịch 7 ngày. Lịch chưa tải/lỗi thì bỏ phần lịch — không chặn thông báo chính.
 *
 * Khác `SrSessionSummary`: đây là màn người dùng MỞ RA khi không còn gì để ôn (không phải vừa xong một phiên) nên KHÔNG rung
 * (`celebrate={false}`) — chỉ vòng vẽ nhẹ. Nằm ngang: hero bên trái, lịch bên phải.
 */
export function SrCaughtUp({ summary }: { summary?: SrSummary }) {
  const size = useResponsiveValue({ base: 132, tablet: 168 });
  const tomorrow = summary?.dueNext7Days[0]?.count;

  return (
    <View className="gap-lg py-md landscape:flex-row landscape:items-center landscape:gap-xl">
      <View className="items-center gap-sm landscape:flex-1">
        <CompletionRing
          celebrate={false}
          label="Đã ôn xong các thẻ đến hạn hôm nay"
          percent={100}
          size={size}
          tone={STUDY_MODE_META.sr.tone}
        >
          <Icon color="success" name="checkmark-circle" size={48} variant="twotone" />
        </CompletionRing>
        <Text accessibilityRole="header" className="text-header-sm text-fg-1">
          Đã ôn xong
        </Text>
        <Text className="text-center text-body-lg text-fg-2">
          {`Hôm nay không còn thẻ cần ôn.${tomorrow === undefined ? '' : ` Mai ôn ${tomorrow} thẻ.`}`}
        </Text>
      </View>
      {summary ? (
        <View className="landscape:flex-1">
          <Card title="7 ngày tới">
            <SrWeekStrip days={summary.dueNext7Days} />
          </Card>
        </View>
      ) : null}
    </View>
  );
}
