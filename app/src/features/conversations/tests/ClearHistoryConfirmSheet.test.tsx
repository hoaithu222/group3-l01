import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ClearHistoryConfirmSheet } from '../components/ClearHistoryConfirmSheet';

/**
 * Tấm xác nhận "Xoá cuộc trò chuyện ở phía bạn" dùng CHUNG cho `DirectInfo` và vuốt/nhấn giữ hàng danh sách — khoá đúng câu chữ và hành vi
 * để hai nơi không lệch nhau: chỉ "Xoá" mới gọi `onConfirm`; "Huỷ" chỉ đóng; đang xoá thì không huỷ được (việc vẫn xảy ra phía máy chủ).
 */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

describe('ClearHistoryConfirmSheet', () => {
  it('hiện tiêu đề (vai header) và hậu quả bằng lời thường', async () => {
    await render(<ClearHistoryConfirmSheet visible onClose={jest.fn()} onConfirm={jest.fn()} />, {
      wrapper: Wrapper,
    });

    expect(
      screen.getByRole('header', { name: 'Xoá cuộc trò chuyện ở phía bạn?' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Người khác vẫn thấy tin nhắn — chỉ phía bạn không còn thấy cuộc trò chuyện này.',
      ),
    ).toBeOnTheScreen();
  });

  it('"Xoá" gọi onConfirm; "Huỷ" chỉ đóng, không xoá', async () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();
    await render(<ClearHistoryConfirmSheet visible onClose={onClose} onConfirm={onConfirm} />, {
      wrapper: Wrapper,
    });

    await userEvent.press(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.press(screen.getByRole('button', { name: 'Xoá' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('đang xoá: nút "Xoá" báo bận, "Huỷ" bị khoá', async () => {
    await render(
      <ClearHistoryConfirmSheet loading visible onClose={jest.fn()} onConfirm={jest.fn()} />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole('button', { name: 'Xoá' })).toBeBusy();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled();
  });

  it('đóng (visible = false) thì không dựng gì', async () => {
    await render(
      <ClearHistoryConfirmSheet visible={false} onClose={jest.fn()} onConfirm={jest.fn()} />,
      { wrapper: Wrapper },
    );

    expect(screen.queryByText('Xoá cuộc trò chuyện ở phía bạn?')).toBeNull();
  });
});
