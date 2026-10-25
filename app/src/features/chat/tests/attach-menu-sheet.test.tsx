import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AttachMenuSheet } from '../components/composer/AttachMenuSheet';

// `BottomSheet` đọc vùng an toàn (`SheetSurface`) và né bàn phím — cùng cách dựng với `forward-dm.test.tsx`.
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

/** ⚠️ Chỉ test HÀNH VI (NativeWind không biên dịch `className` trong Jest ⇒ lề/cỡ ô icon đã kiểm bằng mắt). `render()` của RNTL 14 là bất đồng bộ. */
function setup(visible = true) {
  const handlers = {
    onClose: jest.fn(),
    onPickDocuments: jest.fn(),
    onPickImages: jest.fn(),
    onTakePhoto: jest.fn(),
  };
  return {
    handlers,
    ui: (
      <SafeAreaProvider initialMetrics={METRICS}>
        <AttachMenuSheet visible={visible} {...handlers} />
      </SafeAreaProvider>
    ),
  };
}

describe('AttachMenuSheet', () => {
  it('ba lựa chọn, mỗi hàng có tiêu đề + mô tả ngắn', async () => {
    const { ui } = setup();
    const screen = await render(ui);

    expect(screen.getByText('Đính kèm')).toBeOnTheScreen();
    for (const label of ['Chụp ảnh', 'Ảnh / video', 'Tệp']) expect(screen.getByText(label)).toBeOnTheScreen();
    expect(screen.getByText('Mở camera để chụp và gửi ngay')).toBeOnTheScreen();
    expect(screen.getByText('Chọn từ thư viện trên máy')).toBeOnTheScreen();
    expect(screen.getByText('Tài liệu, PDF, bảng tính…')).toBeOnTheScreen();
  });

  it.each([
    ['Chụp ảnh', 'onTakePhoto'],
    ['Ảnh / video', 'onPickImages'],
    ['Tệp', 'onPickDocuments'],
  ] as const)('chạm "%s": đóng tấm rồi gọi %s đúng một lần', async (label, handler) => {
    const { handlers, ui } = setup();
    const screen = await render(ui);

    fireEvent.press(screen.getByText(label));

    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(handlers[handler]).toHaveBeenCalledTimes(1);
    const others = (['onTakePhoto', 'onPickImages', 'onPickDocuments'] as const).filter((name) => name !== handler);
    for (const name of others) expect(handlers[name]).not.toHaveBeenCalled();
  });

  it('không hiện khi `visible=false`', async () => {
    const { ui } = setup(false);
    const screen = await render(ui);

    expect(screen.queryByText('Chụp ảnh')).toBeNull();
  });
});
