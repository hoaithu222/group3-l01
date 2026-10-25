import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { formatRelative } from '@/shared/utils/format/date.utils';

import { WhoReadSheet } from '../components/WhoReadSheet';

/**
 * Tấm "Đã xem" của nhóm: mỗi người một hàng, tên + giờ xem đọc thành MỘT câu cho trình đọc màn hình ("An: 3 giờ trước"); danh sách
 * rỗng có lời nói rõ thay cho một tấm trắng.
 */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

const READERS = [
  { avatarUrl: null, name: 'An', readAt: '2026-09-30T01:00:00.000Z', userId: 'u-an' },
  { avatarUrl: null, name: 'Bình', readAt: '2026-09-29T02:00:00.000Z', userId: 'u-binh' },
];

describe('WhoReadSheet', () => {
  it('mỗi người đã xem một hàng: tên + giờ xem đọc liền một câu', async () => {
    await render(<WhoReadSheet readers={READERS} visible onClose={jest.fn()} />, {
      wrapper: Wrapper,
    });

    for (const reader of READERS) {
      expect(screen.getByText(reader.name)).toBeOnTheScreen();
      expect(
        screen.getByLabelText(`${reader.name}: ${formatRelative(reader.readAt)}`),
      ).toBeOnTheScreen();
    }
  });

  it('danh sách rỗng ⇒ trạng thái rỗng nói rõ, không phải tấm trắng', async () => {
    await render(<WhoReadSheet readers={[]} visible onClose={jest.fn()} />, { wrapper: Wrapper });

    expect(screen.getByText('Chưa có ai xem tin nhắn này.')).toBeOnTheScreen();
  });
});
