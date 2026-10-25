import { fireEvent, render, screen } from '@testing-library/react-native';

import { RemindNowSection } from '../components/RemindNowSection';

/**
 * "Nhắc ngay" gửi thông báo cho người khác và khoá 1 giờ ⇒ phải qua hộp thoại xác nhận — bấm nhầm ngay dưới nút "Lưu
 * cài đặt" là mất cả giờ.
 */
const mockMutate = jest.fn();
jest.mock('../queries/settlement.mutations', () => ({
  useRemindNow: () => ({ error: null, isPending: false, mutate: mockMutate }),
}));
jest.mock('../hooks/useIsOffline', () => ({ useIsOffline: () => false }));

beforeEach(() => jest.clearAllMocks());

describe('RemindNowSection', () => {
  it('bấm "Nhắc ngay" chỉ mở hộp thoại, CHƯA gửi', async () => {
    await render(<RemindNowSection wsId="ws1" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Nhắc ngay' }));

    expect(screen.getByText('Nhắc nợ ngay bây giờ?')).toBeOnTheScreen();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('"Chưa gửi" đóng hộp thoại mà không gửi', async () => {
    await render(<RemindNowSection wsId="ws1" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Nhắc ngay' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Chưa gửi' }));

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('"Gửi nhắc ngay" xác nhận thì mới gọi API, đúng một lần', async () => {
    await render(<RemindNowSection wsId="ws1" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Nhắc ngay' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Gửi nhắc ngay' }));

    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
});
