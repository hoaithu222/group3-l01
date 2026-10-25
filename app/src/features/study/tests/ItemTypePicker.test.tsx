import { render, userEvent, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ItemTypePicker } from '../components/editor/ItemTypePicker';

/** Cùng lý do với `tests/ui/bottom-sheet.test.tsx`: thư viện bàn phím gọi native lúc nạp module, và `useSafeAreaInsets` cần provider. */
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

/**
 * "Thêm mục" khi tạo nội dung bài học/bộ thẻ: tấm `padded={false}` nên hàng phải nằm trong `SheetList` (lề 16dp — không kiểm được
 * trong Jest, xem `tests/ui/sheet-list.test.tsx`). Test giữ phần kiểm được: đủ năm loại kèm mô tả, chọn một loại thì gọi `onPick`
 * đúng loại và đóng tấm.
 */
describe('ItemTypePicker', () => {
  it('liệt kê đủ năm loại mục kèm dòng mô tả', async () => {
    const screen = await render(<ItemTypePicker visible onClose={jest.fn()} onPick={jest.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText('Thêm mục')).toBeOnTheScreen();
    expect(screen.getByText('Thẻ ghi nhớ')).toBeOnTheScreen();
    expect(screen.getByText('Trắc nghiệm')).toBeOnTheScreen();
    expect(screen.getByText('Nhiều đáp án đúng')).toBeOnTheScreen();
    expect(screen.getByText('Đúng / Sai')).toBeOnTheScreen();
    expect(screen.getByText('Điền vào chỗ trống')).toBeOnTheScreen();
    expect(screen.getByText('Mặt trước – mặt sau, lật thẻ để học')).toBeOnTheScreen();
  });

  it('chọn một loại thì đóng tấm và gọi onPick đúng loại đó', async () => {
    const onClose = jest.fn();
    const onPick = jest.fn();
    const screen = await render(<ItemTypePicker visible onClose={onClose} onPick={onPick} />, {
      wrapper: Wrapper,
    });

    await userEvent.press(screen.getByText('Trắc nghiệm'));

    await waitFor(() => expect(onPick).toHaveBeenCalledWith('MULTIPLE_CHOICE'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });
});
