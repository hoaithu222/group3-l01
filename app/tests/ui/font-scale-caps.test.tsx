import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { QuickReactionBar } from '@/features/chat/components/actions/QuickReactionBar';
import { QUICK_REACTIONS } from '@/features/chat/chat.constants';
import { MonthDayCell } from '@/features/meetings/components/calendar/MonthDayCell';
import { TimeColumn } from '@/shared/ui/time-picker/TimeColumn';

/**
 * Khối có chiều cao CỨNG mà chứa chữ phải chặn TRẦN cỡ chữ (`maxFontSizeMultiplier`), không phải tắt phóng chữ.
 *
 * Android cho người dùng phóng cỡ chữ hệ thống tới 2× (iOS: Dynamic Type). Ô cao cứng 44dp mà chữ 16/24 phóng 2× cao 48dp
 * thì thân chữ bị cắt ngang — với tiếng Việt là dấu mất trước. ⛔ Cách chữa KHÔNG phải `allowFontScaling={false}` (phủ quyết
 * nhu cầu của người đọc kém — `docs/rules/responsive.md` điều 6) mà là chặn trần 1.3× và để người dùng vẫn phóng được tới mức đó.
 *
 * `className` không thành `style` trong Jest nên chiều cao cứng không kiểm được ở đây; cái kiểm được (và hay bị quên khi
 * sao chép ô sang màn khác) là PROP của `<Text>`.
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const CAP = 1.3;

describe('trần phóng chữ trong ô cao cứng', () => {
  it('TimeColumn — số giờ/phút trong hàng 44dp', async () => {
    await render(<TimeColumn label="Giờ" options={[8, 9, 10]} selected={9} onSelect={jest.fn()} />);

    expect(screen.getByText('09').props.maxFontSizeMultiplier).toBe(CAP);
    expect(screen.getByText('10').props.maxFontSizeMultiplier).toBe(CAP);
  });

  it('QuickReactionBar — emoji trong ô tròn 44dp', async () => {
    await render(<QuickReactionBar onSelect={jest.fn()} />);

    const first = QUICK_REACTIONS[0];
    expect(first).toBeDefined();
    expect(screen.getByText(first as string).props.maxFontSizeMultiplier).toBe(CAP);
  });

  it('MonthDayCell — số ngày trong vòng tròn 32dp', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <MonthDayCell
          count={0}
          date={new Date(2026, 8, 17)}
          inMonth
          selected={false}
          today={false}
          onPress={jest.fn()}
        />
      </SafeAreaProvider>,
    );

    expect(screen.getByText('17').props.maxFontSizeMultiplier).toBe(CAP);
  });
});
