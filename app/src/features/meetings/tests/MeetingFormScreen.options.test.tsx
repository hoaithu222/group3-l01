import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

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

describe('MeetingFormScreen — tuỳ chọn khác & chọn nhóm', () => {
  it('"Tuỳ chọn khác" THU GỌN khi tạo (kèm tóm tắt) — mở ra thì đổi được phòng chờ/biên bản/ghi hình và đi đúng vào body', async () => {
    await renderWithProviders(<MeetingFormScreen />);
    await screen.findByLabelText(/Tiêu đề/);
    expect(screen.getByText('Chỉ người được mời · Phòng chờ: Người ngoài danh sách')).toBeOnTheScreen();
    expect(screen.queryByText('Cần biên bản')).toBeNull();
    expect(screen.queryByText('Phòng chờ')).toBeNull();

    await fireEvent.press(screen.getByText('Tuỳ chọn khác'));
    await fireEvent.press(screen.getByText('Tất cả'));
    await fireEvent.press(screen.getByRole('switch', { name: 'Cần biên bản' }));
    await fireEvent.press(screen.getByRole('switch', { name: 'Cho phép ghi hình' }));
    await fillTitle();
    await fireEvent.press(submitButton());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[1]).toMatchObject({
      lobbyMode: 'ALL',
      recapRequired: true,
      recordingAllowed: false,
    });
  });

  it('thu gọn rồi mở lại vẫn giữ giá trị đã đổi (không mất khi khối bị gỡ khỏi cây)', async () => {
    await renderWithProviders(<MeetingFormScreen />);
    await screen.findByLabelText(/Tiêu đề/);
    await fireEvent.press(screen.getByText('Tuỳ chọn khác'));
    await fireEvent.press(screen.getByText('Cả nhóm'));
    await fireEvent.press(screen.getByText('Tuỳ chọn khác')); // thu lại
    expect(screen.getByText(/^Cả nhóm · Phòng chờ/)).toBeOnTheScreen();
  });

  it('"Gửi nhắc qua" và "Tạo nhóm chat" nằm ở khối liên quan (Nhắc lịch / Người tham dự), không trong phần thu gọn', async () => {
    await renderWithProviders(<MeetingFormScreen />);
    await screen.findByLabelText(/Tiêu đề/);
    expect(screen.getByText('Nhắc lịch')).toBeOnTheScreen();
    expect(screen.getByText('Gửi nhắc qua')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Tạo nhóm chat cho cuộc họp' })).toBeOnTheScreen();
  });

  it('chỉ ở trong MỘT nhóm ⇒ chọn sẵn nhóm đó (không phải chạm lại) và gửi đúng workspaceId', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ date: '2030-01-15' });
    await renderWithProviders(<MeetingFormScreen />);
    await fillTitle();
    await fireEvent.press(submitButton());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0]).toBe('ws-1');
    expect(screen.queryByText('Chọn nhóm')).toBeNull();
  });

  it('chưa chọn nhóm (nhiều nhóm) ⇒ khối Người tham dự nói "Chọn nhóm ở trên…" thay vì trống; bấm Tạo báo lỗi "Chọn nhóm"', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ date: '2030-01-15' });
    jest.mocked(meetingsLookupService.listMyWorkspaces).mockResolvedValue([
      { avatarUrl: null, id: 'ws-1', myRole: 'MEMBER', name: 'Nhóm Toán' },
      { avatarUrl: null, id: 'ws-2', myRole: 'MEMBER', name: 'Nhóm Lý' },
    ]);
    await renderWithProviders(<MeetingFormScreen />);
    await fillTitle();

    expect(await screen.findByText('Chọn nhóm ở trên để mời người tham dự.')).toBeOnTheScreen();
    await fireEvent.press(submitButton());
    expect(await screen.findByText('Chọn nhóm')).toBeOnTheScreen();
    expect(create).not.toHaveBeenCalled();
  });
});
