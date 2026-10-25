import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { meetingsService } from '../api/meetings.service';
import { meetingsLookupService } from '../api/meetings-lookup.service';
import { MeetingFormScreen } from '../screens/MeetingFormScreen';
import { makeActions, makeMeeting } from './fixtures';
import { apiError, renderWithProviders } from './render-helpers';

/** Form SỬA (app.md p2-04 §3, §8): 409 hiện banner GIỮ bản nhập + "Tải lại", lỗi trường từ server, 404 về lịch, họp LIVE khoá trường. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meetings.service', () => ({
  meetingsService: { create: jest.fn(), get: jest.fn(), update: jest.fn() },
}));
jest.mock('../api/meetings-lookup.service', () => ({
  meetingsLookupService: { listMyWorkspaces: jest.fn(), searchWorkspaceMembers: jest.fn() },
}));

const get = jest.mocked(meetingsService.get);
const update = jest.mocked(meetingsService.update);
const editable = makeActions({ canCancel: true, canEdit: true });

async function openAndType(title: string) {
  await renderWithProviders(<MeetingFormScreen />);
  await waitFor(() => expect(screen.getByLabelText(/Tiêu đề/)).toHaveDisplayValue('Họp giao ban'));
  await fireEvent.changeText(screen.getByLabelText(/Tiêu đề/), title);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ meetingId: 'm1' });
  jest.mocked(meetingsLookupService.listMyWorkspaces).mockResolvedValue([]);
  get.mockResolvedValue(makeMeeting({ myActions: editable, version: 2 }));
  update.mockResolvedValue(makeMeeting({ version: 3 }));
});

describe('MeetingFormScreen — sửa', () => {
  it('nạp giá trị hiện có; lưu chỉ gửi trường ĐÃ ĐỔI + expectedVersion', async () => {
    await openAndType('Tiêu đề mới');
    await fireEvent.press(screen.getByText('Lưu'));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith('m1', { expectedVersion: 2, title: 'Tiêu đề mới' });
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('409 RES_003: banner "đã được cập nhật bởi người khác", GIỮ bản nhập; "Tải lại" lấy version mới rồi lưu lại đúng expectedVersion', async () => {
    update.mockRejectedValueOnce(apiError(409, 'RES_003', { currentVersion: 3 }));
    await openAndType('Tiêu đề mới');
    await fireEvent.press(screen.getByText('Lưu'));

    expect(await screen.findByText('Cuộc họp đã được cập nhật bởi người khác')).toBeOnTheScreen();
    expect(screen.getByLabelText(/Tiêu đề/)).toHaveDisplayValue('Tiêu đề mới');

    get.mockResolvedValue(
      makeMeeting({ myActions: editable, title: 'Tiêu đề của người khác', version: 3 }),
    );
    await fireEvent.press(screen.getByText('Tải lại'));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText('Cuộc họp đã được cập nhật bởi người khác')).toBeNull(),
    );
    // Bản nhập KHÔNG bị ghi đè bởi bản của người khác.
    expect(screen.getByLabelText(/Tiêu đề/)).toHaveDisplayValue('Tiêu đề mới');

    await fireEvent.press(screen.getByText('Lưu'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenLastCalledWith('m1', { expectedVersion: 3, title: 'Tiêu đề mới' });
  });

  it('lỗi trường từ server (MEET_015) hiện ngay dưới ô "Liên kết họp", dữ liệu vẫn còn', async () => {
    get.mockResolvedValue(
      makeMeeting({
        externalUrl: 'https://zoom.us/j/1',
        myActions: editable,
        platform: 'ZOOM',
        version: 2,
      }),
    );
    update.mockRejectedValueOnce(apiError(400, 'MEET_015'));
    await openAndType('Tiêu đề mới');
    await fireEvent.press(screen.getByText('Lưu'));

    expect(
      await screen.findByText('Liên kết họp không hợp lệ với nền tảng đã chọn.'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText(/Tiêu đề/)).toHaveDisplayValue('Tiêu đề mới');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('404 khi lưu (cuộc họp đã bị xoá/gỡ quyền) ⇒ toast + về lịch', async () => {
    update.mockRejectedValueOnce(apiError(404, 'MEET_001'));
    await openAndType('Tiêu đề mới');
    await fireEvent.press(screen.getByText('Lưu'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/meetings'));
    expect(showToast).toHaveBeenCalledWith('info', 'Cuộc họp không còn khả dụng.');
  });

  it('họp ĐANG DIỄN RA: khoá múi giờ/nền tảng, ẩn nhắc lịch; vẫn sửa được tiêu đề và phòng chờ', async () => {
    get.mockResolvedValue(
      makeMeeting({ myActions: makeActions({ canEditLimited: true }), status: 'LIVE', version: 2 }),
    );
    await openAndType('Tiêu đề mới');

    expect(screen.getByRole('button', { name: /Múi giờ/ })).toBeDisabled();
    expect(screen.getByText('Zoom')).toBeDisabled();
    expect(screen.queryByText('Nhắc lịch')).toBeNull();
    expect(screen.queryByText('Tạo nhóm chat cho cuộc họp')).toBeNull();
    await fireEvent.press(screen.getByText('Tất cả'));
    await fireEvent.press(screen.getByText('Lưu'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith('m1', {
      expectedVersion: 2,
      lobbyMode: 'ALL',
      title: 'Tiêu đề mới',
    });
  });
});
