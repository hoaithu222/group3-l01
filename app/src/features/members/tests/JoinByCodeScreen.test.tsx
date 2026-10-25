import * as Clipboard from 'expo-clipboard';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { JoinByCodeScreen } from '../screens/JoinByCodeScreen';
import { renderWithProviders } from './test-utils';

/**
 * `JoinByCodeScreen` — đường VÀO song song với deep link khi không bấm được link (máy ảo, dev). Chỉ điều hướng tới đúng
 * hai route mà deep link dùng; xem trước/tham gia do màn đích lo nên ở đây KHÔNG có lời gọi API nào để mock.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn(), setStringAsync: jest.fn() }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const mockedGetString = jest.mocked(Clipboard.getStringAsync);

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-aBcDe';
const INVALID = 'Liên kết hoặc mã mời không hợp lệ.';

const field = () => screen.getByLabelText('Liên kết hoặc mã mời');
const next = () => screen.getByRole('button', { name: 'Tiếp tục' });

beforeEach(() => jest.clearAllMocks());

describe('JoinByCodeScreen', () => {
  it('hiện tiêu đề, mô tả và ba hành động (dán · quét · tiếp tục)', async () => {
    await renderWithProviders(<JoinByCodeScreen />);

    expect(screen.getByText('Tham gia nhóm')).toBeOnTheScreen();
    expect(
      screen.getByText('Dán liên kết mời hoặc nhập mã mời mà quản trị viên gửi cho bạn.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Dán từ bộ nhớ tạm' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Quét mã QR' })).toBeOnTheScreen();
    expect(next()).toBeOnTheScreen();
  });

  it.each([
    ['link mời chung', `https://superapp.vcijsc.com/invite/${TOKEN}`, { code: TOKEN }, '/invite/[code]'],
    ['token trần', TOKEN, { code: TOKEN }, '/invite/[code]'],
    ['scheme riêng', `superapp://invite/${TOKEN}`, { code: TOKEN }, '/invite/[code]'],
    ['lời mời email', `http://localhost:8081/invite/e/${TOKEN}`, { token: TOKEN }, '/invite/e/[token]'],
  ])('%s → push đúng route đích, giữ NGUYÊN token', async (_name, input, params, pathname) => {
    await renderWithProviders(<JoinByCodeScreen />);

    await fireEvent.changeText(field(), `  ${input}\n`);
    await fireEvent.press(next());

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({ params, pathname });
  });

  it('phím "Đi" của bàn phím làm đúng việc của nút Tiếp tục', async () => {
    await renderWithProviders(<JoinByCodeScreen />);

    await fireEvent.changeText(field(), TOKEN);
    await fireEvent(field(), 'submitEditing');

    expect(router.push).toHaveBeenCalledWith({ params: { code: TOKEN }, pathname: '/invite/[code]' });
  });

  it.each([
    ['nội dung lạ', 'không phải link mời'],
    ['token thiếu một ký tự', TOKEN.slice(1)],
    ['link của route khác', `https://superapp.vcijsc.com/w/${TOKEN}`],
    ['ô trống', ''],
  ])('%s → báo lỗi ngay dưới ô, KHÔNG điều hướng; sửa lại thì lỗi biến mất', async (_name, input) => {
    await renderWithProviders(<JoinByCodeScreen />);

    if (input) await fireEvent.changeText(field(), input);
    await fireEvent.press(next());

    expect(await screen.findByText(INVALID)).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();

    await fireEvent.changeText(field(), TOKEN);
    expect(screen.queryByText(INVALID)).toBeNull();
  });

  it('"Dán từ bộ nhớ tạm" điền ô bằng nội dung clipboard (đã cắt khoảng trắng), chưa tự điều hướng', async () => {
    mockedGetString.mockResolvedValue(`\n  Link mời: https://x.y/invite/${TOKEN} \n`);
    await renderWithProviders(<JoinByCodeScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Dán từ bộ nhớ tạm' }));

    await waitFor(() =>
      expect(field()).toHaveDisplayValue(`Link mời: https://x.y/invite/${TOKEN}`),
    );
    expect(router.push).not.toHaveBeenCalled();

    // Dán xong bấm Tiếp tục: bóc được token dù ô còn chữ "Link mời: " đứng trước.
    await fireEvent.press(next());
    expect(router.push).toHaveBeenCalledWith({ params: { code: TOKEN }, pathname: '/invite/[code]' });
  });

  it('clipboard trống hoặc đọc lỗi → toast, ô giữ nguyên', async () => {
    await renderWithProviders(<JoinByCodeScreen />);
    await fireEvent.changeText(field(), 'đang gõ dở');

    mockedGetString.mockResolvedValueOnce('   ');
    await fireEvent.press(screen.getByRole('button', { name: 'Dán từ bộ nhớ tạm' }));
    await waitFor(() => expect(showToast).toHaveBeenLastCalledWith('info', 'Bộ nhớ tạm đang trống.'));

    mockedGetString.mockRejectedValueOnce(new Error('clipboard unavailable'));
    await fireEvent.press(screen.getByRole('button', { name: 'Dán từ bộ nhớ tạm' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenLastCalledWith('error', 'Không đọc được bộ nhớ tạm.'),
    );
    expect(field()).toHaveDisplayValue('đang gõ dở');
  });

  it('"Quét mã QR" mở màn quét', async () => {
    await renderWithProviders(<JoinByCodeScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Quét mã QR' }));

    expect(router.push).toHaveBeenCalledWith('/workspaces/scan');
  });
});
