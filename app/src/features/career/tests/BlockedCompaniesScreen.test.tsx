import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { companyBlocksService } from '../api/company-blocks.service';
import { BlockedCompaniesScreen } from '../screens/jobs/BlockedCompaniesScreen';
import { COMPANY, httpError, renderWithClient } from './jobs-fixtures';
import { resetSocketMock, setConnection } from './socket-mock';

/** app.md p6-08 §3 "Doanh nghiệp đã chặn": danh sách + Bỏ chặn có xác nhận (nói rõ không mở lại thread cũ), rỗng, offline khoá, 404 cờ tắt. */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/core/socket', () => jest.requireActual('./socket-mock'));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const list = jest.spyOn(companyBlocksService, 'list');
const unblock = jest.spyOn(companyBlocksService, 'unblock');

const BLOCKED = [{ blockedAt: '2026-09-20T00:00:00.000Z', company: COMPANY }];

beforeEach(() => {
  jest.clearAllMocks();
  resetSocketMock();
});

describe('BlockedCompaniesScreen', () => {
  it('liệt kê doanh nghiệp đã chặn kèm ngày; Bỏ chặn phải qua hộp thoại xác nhận rồi mới gọi API', async () => {
    list.mockResolvedValue(BLOCKED);
    unblock.mockResolvedValue();
    await renderWithClient(<BlockedCompaniesScreen />);

    expect(await screen.findByText('Công ty Alpha')).toBeOnTheScreen();
    expect(screen.getByText('Đã chặn 20/09/2026')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Bỏ chặn Công ty Alpha' }));
    expect(await screen.findByText('Bỏ chặn Công ty Alpha?')).toBeOnTheScreen();
    expect(screen.getByText(/không mở lại/)).toBeOnTheScreen();
    expect(unblock).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Bỏ chặn' }));
    await waitFor(() => expect(unblock).toHaveBeenCalledWith('c1'));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('success', 'Đã bỏ chặn doanh nghiệp'),
    );
  });

  it('Huỷ hộp thoại ⇒ không gọi API', async () => {
    list.mockResolvedValue(BLOCKED);
    await renderWithClient(<BlockedCompaniesScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Bỏ chặn Công ty Alpha' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Huỷ' }));
    expect(unblock).not.toHaveBeenCalled();
  });

  it('rỗng ⇒ "Bạn chưa chặn doanh nghiệp nào"; offline ⇒ khoá nút Bỏ chặn', async () => {
    list.mockResolvedValue([]);
    const { screen: view } = await renderWithClient(<BlockedCompaniesScreen />);
    expect(await screen.findByText('Bạn chưa chặn doanh nghiệp nào')).toBeOnTheScreen();
    await view.unmount();

    list.mockResolvedValue(BLOCKED);
    setConnection('offline');
    await renderWithClient(<BlockedCompaniesScreen />);
    expect(await screen.findByRole('button', { name: 'Bỏ chặn Công ty Alpha' })).toBeDisabled();
  });

  it('lỗi bỏ chặn ⇒ toast lỗi, không kẹt hộp thoại; 404 cờ tắt ⇒ "Chưa khả dụng"', async () => {
    list.mockResolvedValue(BLOCKED);
    unblock.mockRejectedValue(httpError(500, 'SYS_500'));
    const { screen: view } = await renderWithClient(<BlockedCompaniesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Bỏ chặn Công ty Alpha' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Bỏ chặn' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', expect.any(String)));
    await waitFor(() => expect(screen.queryByText('Bỏ chặn Công ty Alpha?')).toBeNull());
    await view.unmount();

    list.mockRejectedValue(httpError(404, 'CFG_005'));
    await renderWithClient(<BlockedCompaniesScreen />);
    expect(await screen.findByText('Chưa khả dụng')).toBeOnTheScreen();
  });
});
