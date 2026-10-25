import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CsvImportSheet } from '../components/editor/CsvImportSheet';
import { FALLBACK_STUDY_LIMITS } from '../constants/study.constants';

/** Tấm nhập CSV: hướng dẫn + ví dụ khi trống → xem trước hợp lệ/lỗi → thêm. (Luồng qua màn soạn: `SetEditorScreen.import.test.tsx`.) */
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

function sheet(onImport = jest.fn(), capacity = 500) {
  return (
    <CsvImportSheet
      capacity={capacity}
      limits={{ ...FALLBACK_STUDY_LIMITS }}
      visible
      onClose={jest.fn()}
      onImport={onImport}
    />
  );
}

describe('CsvImportSheet', () => {
  it('ô còn trống ⇒ hướng dẫn kèm ví dụ; nút thêm chưa dùng được', async () => {
    await render(sheet(), { wrapper: Wrapper });

    expect(screen.getByText('Mỗi dòng một thẻ')).toBeOnTheScreen();
    expect(screen.getByText('"hello, world",xin chào')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Thêm thẻ' })).toBeDisabled();
  });

  it('"Dùng ví dụ này" ⇒ điền ví dụ, hướng dẫn nhường chỗ cho bản xem trước 3 thẻ; thêm đúng 3 thẻ', async () => {
    const onImport = jest.fn();
    await render(sheet(onImport), { wrapper: Wrapper });

    await fireEvent.press(screen.getByText('Dùng ví dụ này'));

    expect(await screen.findByText('3 thẻ hợp lệ')).toBeOnTheScreen();
    expect(screen.getByText(/Phân cách bằng dấu phẩy · đã bỏ dòng tiêu đề/)).toBeOnTheScreen();
    expect(screen.getByText('hello, world')).toBeOnTheScreen();
    expect(screen.queryByText('Mỗi dòng một thẻ')).toBeNull();

    await fireEvent.press(screen.getByText('Thêm 3 thẻ'));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it('dòng lỗi báo kèm SỐ DÒNG; thẻ vượt sức chứa được nói rõ và không được thêm', async () => {
    await render(sheet(jest.fn(), 1), { wrapper: Wrapper });

    await fireEvent.changeText(
      screen.getByLabelText('Nội dung'),
      'a\t1\nb\t2\n\tthiếu thuật ngữ\nc',
    );

    expect(await screen.findByText('1 thẻ hợp lệ')).toBeOnTheScreen();
    expect(screen.getByText('2 dòng bị bỏ qua')).toBeOnTheScreen();
    expect(screen.getByText('Dòng 3: Thiếu thuật ngữ.')).toBeOnTheScreen();
    expect(screen.getByText('Dòng 4: "c" chưa có định nghĩa.')).toBeOnTheScreen();
    expect(screen.getByText(/Bộ chỉ còn chỗ cho 1 mục — 1 thẻ cuối/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Thêm 1 thẻ' })).toBeEnabled();
  });

  it('chỉ toàn dòng lỗi ⇒ "Chưa có thẻ hợp lệ" và nút thêm vẫn khoá', async () => {
    await render(sheet(), { wrapper: Wrapper });

    await fireEvent.changeText(screen.getByLabelText('Nội dung'), '\tchỉ có định nghĩa');

    expect(await screen.findByText('Chưa có thẻ hợp lệ')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Thêm thẻ' })).toBeDisabled();
  });
});
