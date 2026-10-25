import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { meetingsService } from '../api/meetings.service';
import { meetingsLookupService } from '../api/meetings-lookup.service';
import { MeetingFormScreen } from '../screens/MeetingFormScreen';
import { makeMeeting } from './fixtures';
import { renderWithProviders } from './render-helpers';

/** Form TẠO (app.md p2-04 §3, §8): Idempotency-Key, Zod hiện lỗi đúng ô, múi giờ, mời người/đồng chủ trì, nhóm chat, phòng chờ. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../api/meetings.service', () => ({
  meetingsService: { create: jest.fn(), get: jest.fn(), update: jest.fn() },
}));
jest.mock('../api/meetings-lookup.service', () => ({
  meetingsLookupService: { listMyWorkspaces: jest.fn(), searchWorkspaceMembers: jest.fn() },
}));

const create = jest.mocked(meetingsService.create);

/** Ngày CỐ ĐỊNH ở tương lai ⇒ giờ gợi ý luôn 09:00–10:00, không dính "quá khứ"/nửa đêm. */
const PARAMS = { date: '2030-01-15', workspaceId: 'ws-1' };

/** "Tạo cuộc họp" vừa là tiêu đề AppBar vừa là nhãn nút — nút là phần tử cuối. */
const submitButton = () => screen.getAllByText('Tạo cuộc họp').at(-1) as never;

async function fillTitle(title = 'Họp tuần') {
  await fireEvent.changeText(await screen.findByLabelText(/Tiêu đề/), title);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue(PARAMS);
  jest
    .mocked(meetingsLookupService.listMyWorkspaces)
    .mockResolvedValue([{ avatarUrl: null, id: 'ws-1', myRole: 'MEMBER', name: 'Nhóm Toán' }]);
  jest
    .mocked(meetingsLookupService.searchWorkspaceMembers)
    .mockResolvedValue([{ avatarUrl: null, displayName: null, name: 'An', userId: 'u1' }]);
  create.mockResolvedValue(makeMeeting({ id: 'new-1' }));
});

describe('MeetingFormScreen — tạo', () => {
  it('gửi Idempotency-Key + payload đúng (giờ 09:00–10:00 theo múi giờ máy) rồi mở chi tiết', async () => {
    await renderWithProviders(<MeetingFormScreen />);
    await fillTitle();
    await fireEvent.press(submitButton());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const [workspaceId, payload, key] = create.mock.calls[0] ?? [];
    expect(workspaceId).toBe('ws-1');
    expect(String(key)).toMatch(/^meeting-create-/);
    expect(payload).toMatchObject({
      createChatGroup: false,
      notifyVia: 'APP',
      platform: 'INTERNAL',
      title: 'Họp tuần',
    });
    expect(Date.parse(payload?.endAt ?? '') - Date.parse(payload?.startAt ?? '')).toBe(3_600_000);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        params: { meetingId: 'new-1' },
        pathname: '/meetings/[meetingId]',
      }),
    );
  });

  it('tiêu đề trống ⇒ lỗi hiện ở ô tiêu đề và KHÔNG gọi API', async () => {
    await renderWithProviders(<MeetingFormScreen />);
    await screen.findByLabelText(/Tiêu đề/);
    await fireEvent.press(submitButton());

    expect(await screen.findByText('Nhập tiêu đề')).toBeOnTheScreen();
    expect(create).not.toHaveBeenCalled();
  });

  it('chọn múi giờ Tokyo: 09:00 giờ tường = 00:00Z, và form nhắc "giờ theo múi giờ này"', async () => {
    await renderWithProviders(<MeetingFormScreen />);
    await fillTitle();
    await fireEvent.press(await screen.findByRole('button', { name: /Múi giờ/ }));
    await fireEvent.press(await screen.findByText('Tokyo'));

    expect(await screen.findByText(/Giờ ở trên là giờ theo múi giờ này/)).toBeOnTheScreen();
    await fireEvent.press(submitButton());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[1]).toMatchObject({
      endAt: '2030-01-15T01:00:00.000Z',
      startAt: '2030-01-15T00:00:00.000Z',
      timezone: 'Asia/Tokyo',
    });
  });

  it('mời người + đồng chủ trì + tạo nhóm chat + nhắc qua cả hai đi đúng vào body tạo', async () => {
    await renderWithProviders(<MeetingFormScreen />);
    await fillTitle();
    await fireEvent.press(await screen.findByText('An')); // kết quả tìm ⇒ chọn làm người tham dự
    const chips = screen.getAllByText('An'); // kết quả · "Đã chọn" · dòng đồng chủ trì
    await fireEvent.press(chips[chips.length - 1] as never);
    await fireEvent.press(screen.getByRole('switch', { name: 'Tạo nhóm chat cho cuộc họp' }));
    await fireEvent.press(screen.getByText('Cả hai'));
    await fireEvent.press(submitButton());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[1]).toMatchObject({
      attendeeIds: ['u1'],
      coHostIds: ['u1'],
      createChatGroup: true,
      notifyVia: 'BOTH',
    });
  });

  it('nhắc qua nhóm chat mà chưa tạo nhóm chat ⇒ form nói trước là sẽ nhắc qua ứng dụng', async () => {
    await renderWithProviders(<MeetingFormScreen />);
    await fireEvent.press(await screen.findByText('Nhóm chat'));
    expect(
      screen.getByText('Cuộc họp chưa có nhóm chat nên nhắc sẽ gửi qua ứng dụng.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('switch', { name: 'Tạo nhóm chat cho cuộc họp' }));
    expect(
      screen.queryByText('Cuộc họp chưa có nhóm chat nên nhắc sẽ gửi qua ứng dụng.'),
    ).toBeNull();
  });

  it('họp trực tiếp (OFFLINE) ẩn nền tảng/link và đưa nền tảng về "Phòng nội bộ"; PHÒNG CHỜ chọn được cho họp nội bộ', async () => {
    await renderWithProviders(<MeetingFormScreen />);
    await fireEvent.press(await screen.findByText('Zoom'));
    expect(screen.getByLabelText(/Liên kết họp/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Trực tiếp'));
    expect(screen.queryByLabelText(/Liên kết họp/)).toBeNull();
    expect(screen.getByLabelText(/Địa điểm/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Tuỳ chọn khác')); // mở phần thu gọn
    expect(screen.getByText('Phòng chờ')).toBeOnTheScreen();
    await fillTitle();
    await fireEvent.press(submitButton());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[1]).toMatchObject({ format: 'OFFLINE', platform: 'INTERNAL' });
  });

});
