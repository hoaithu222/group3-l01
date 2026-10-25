import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { jobSettingsService } from '../api/career-settings.service';
import { offersService } from '../api/offers.service';
import { JobEntryCards } from '../components/jobs/JobEntryCards';
import { httpError, makeOffer, makeSettings, renderWithClient } from './jobs-fixtures';
import { resetSocketMock } from './socket-mock';

/**
 * app.md p6-08 §1 "Điểm vào": thẻ "Tìm việc" (trạng thái Open to work) + "Lời mời" (số chưa đọc, có nhãn trợ năng "N lời mời chưa đọc"); ẩn hẳn khi bảng tin tắt
 * và chưa bật (không dẫn người dùng vào màn 404).
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/core/socket', () => jest.requireActual('./socket-mock'));

const settings = jest.spyOn(jobSettingsService, 'get');
const list = jest.spyOn(offersService, 'list');

beforeEach(() => {
  jest.clearAllMocks();
  resetSocketMock();
});

describe('JobEntryCards', () => {
  it('đếm lời mời chưa mở + lời mời có tin chưa đọc; huy hiệu có nhãn trợ năng; chạm mở đúng màn', async () => {
    settings.mockResolvedValue(makeSettings({ openToWork: true }));
    list.mockResolvedValue({
      items: [
        makeOffer({ id: 'a', status: 'SENT' }),
        makeOffer({ id: 'b', status: 'SENT' }),
        makeOffer({ id: 'c', status: 'INTERESTED', unreadMessages: 2 }),
        makeOffer({ id: 'd', status: 'DECLINED' }),
      ],
      nextCursor: null,
    });
    await renderWithClient(<JobEntryCards />);

    expect(await screen.findByLabelText('3 lời mời chưa đọc')).toBeOnTheScreen();
    expect(
      screen.getByText('Đang bật — doanh nghiệp đã duyệt có thể tìm thấy bạn'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Lời mời'));
    expect(router.push).toHaveBeenCalledWith('/me/career/offers');
    await fireEvent.press(screen.getByText('Open to work'));
    expect(router.push).toHaveBeenCalledWith('/me/career/job-settings');
  });

  it('Open to work tắt ⇒ nói "Đang tắt"; không có lời mời chưa đọc ⇒ không có huy hiệu số', async () => {
    settings.mockResolvedValue(makeSettings());
    list.mockResolvedValue({ items: [makeOffer({ status: 'DECLINED' })], nextCursor: null });
    await renderWithClient(<JobEntryCards />);

    expect(await screen.findByText('Đang tắt — bật để nhận lời mời')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/lời mời chưa đọc/)).toBeNull();
  });

  it('bảng tin tắt và chưa bật ⇒ ẩn hẳn; đang bật mà bảng tin tắt ⇒ chỉ còn thẻ để TẮT (không có "Lời mời")', async () => {
    settings.mockResolvedValue(makeSettings({ recruiterEnabled: false }));
    const { client, screen: view } = await renderWithClient(<JobEntryCards />);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(settings).toHaveBeenCalled();
    expect(screen.queryByText('Open to work')).toBeNull();
    expect(list).not.toHaveBeenCalled();
    await view.unmount();

    settings.mockResolvedValue(makeSettings({ openToWork: true, recruiterEnabled: false }));
    await renderWithClient(<JobEntryCards />);
    expect(await screen.findByText('Open to work')).toBeOnTheScreen();
    expect(screen.queryByText('Lời mời')).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it('cờ career tắt (404) ⇒ không hiện gì, không ném', async () => {
    settings.mockRejectedValue(httpError(404, 'CFG_005'));
    const { client } = await renderWithClient(<JobEntryCards />);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(settings).toHaveBeenCalled();
    expect(screen.queryByText('Open to work')).toBeNull();
  });
});
