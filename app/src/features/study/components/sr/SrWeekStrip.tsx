import dayjs from 'dayjs';
import { View } from 'react-native';

import type { SrSummary } from '../../api/sr.types';
import { SrWeekBar } from './SrWeekBar';

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

/**
 * Lịch 7 ngày tới (app.md p4-02 §3 `SrReview` rỗng: "lịch 7 ngày"): mỗi ngày một cột + SỐ thẻ bằng chữ. `dueNext7Days` của BE
 * KHÔNG gồm hôm nay và đủ 7 phần tử (ngày 0 thẻ vẫn có mặt) — nên cột ĐẦU luôn là NGÀY MAI, gọi là "Mai" và nhấn nhẹ hơn các cột
 * còn lại (người học muốn biết ngay "mai ôn bao nhiêu"). Cột mọc lên lúc hiện (`SrWeekBar`), tắt khi "Giảm chuyển động".
 */
export function SrWeekStrip({ days }: { days: SrSummary['dueNext7Days'] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <View accessibilityLabel="Lịch ôn 7 ngày tới" className="flex-row gap-xs">
      {days.map((day, index) => {
        const date = dayjs(day.date, 'YYYY-MM-DD');
        const weekday = WEEKDAY[date.day()] ?? '';
        const dated = `${weekday} ${date.format('DD/MM')}`;
        const tomorrow = index === 0;
        return (
          <SrWeekBar
            key={day.date}
            caption={tomorrow ? 'Mai' : weekday}
            count={day.count}
            highlight={tomorrow}
            index={index}
            label={`${tomorrow ? 'Mai, ' : ''}${dated}: ${day.count} thẻ`}
            max={max}
          />
        );
      })}
    </View>
  );
}
