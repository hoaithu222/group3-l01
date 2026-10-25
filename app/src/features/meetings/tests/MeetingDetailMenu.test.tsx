import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Share } from 'react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { meetingsService } from '../api/meetings.service';
import { MeetingDetailMenu } from '../components/detail/MeetingDetailMenu';
import { makeActions, makeMeeting } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * Hai khe AppBar của chi tiết cuộc họp: "Chia sẻ" (icon) + menu "⋯" gom Sửa → Huỷ/Rời/Xoá (đỏ, cuối). Mọi mục theo `myActions` của
 * server; hành động không hoàn tác luôn qua hộp xác nhận. Hành vi thay cho hàng nút Sửa/Huỷ/Rời/Xoá từng xếp trong thân màn.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meetings.service', () => ({
  meetingsService: { cancel: jest.fn(), leaveAttendance: jest.fn(), remove: jest.fn() },
}));

/** `ActionMenu` đóng tấm rồi MỚI chạy `onPress` (chờ hiệu ứng đóng) — nên các assert về hành động phải `waitFor`. */
beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => jest.restoreAllMocks());

async function menu(
  actions: Parameters<typeof makeActions>[0],
  overrides: Parameters<typeof makeMeeting>[0] = {},
) {
  await renderWithProviders(
    <MeetingDetailMenu meeting={makeMeeting({ id: 'm9', myActions: makeActions(actions), ...overrides })} />,
  );
}

const openMenu = () => fireEvent.press(screen.getByRole('button', { name: 'Tuỳ chọn cuộc họp' }));

describe('MeetingDetailMenu', () => {
  it('không có quyền nào ⇒ không có nút "⋯" (không mở ra tấm rỗng); vẫn có "Chia sẻ" khi còn ai để mời', async () => {
    await menu({});
    expect(screen.queryByRole('button', { name: 'Tuỳ chọn cuộc họp' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Chia sẻ lời mời họp' })).toBeOnTheScreen();
  });

  it('họp đã huỷ/kết thúc hoặc chỉ xem tóm tắt: không có nút Chia sẻ', async () => {
    await menu({}, { status: 'CANCELLED' });
    expect(screen.queryByRole('button', { name: 'Chia sẻ lời mời họp' })).toBeNull();
  });

  it('Chia sẻ mở bảng chia sẻ hệ thống với tiêu đề + mã + link', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await menu({});
    await fireEvent.press(screen.getByRole('button', { name: 'Chia sẻ lời mời họp' }));

    expect(share).toHaveBeenCalledTimes(1);
    const message = share.mock.calls[0]?.[0].message ?? '';
    expect(message).toContain('Họp giao ban');
    expect(message).toContain('Mã họp: abc-defg-hij');
    expect(message).toContain('/m/abc-defg-hij');
  });

  it('đủ quyền: Sửa trước, rồi Huỷ / Rời / Xoá (thứ tự phá huỷ ở cuối); Sửa mở form sửa đúng cuộc họp', async () => {
    await menu({ canCancel: true, canDelete: true, canEdit: true, canLeaveAttendance: true });
    await openMenu();

    const labels = ['Sửa cuộc họp', 'Huỷ cuộc họp', 'Rời cuộc họp', 'Xoá cuộc họp'];
    for (const label of labels) expect(screen.getByText(label)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Sửa cuộc họp'));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        params: { meetingId: 'm9' },
        pathname: '/meetings/[meetingId]/edit',
      }),
    );
  });

  it('họp ĐANG DIỄN RA (canEditLimited): vẫn có "Sửa cuộc họp"', async () => {
    await menu({ canEditLimited: true }, { status: 'LIVE' });
    await openMenu();
    expect(screen.getByText('Sửa cuộc họp')).toBeOnTheScreen();
    expect(screen.queryByText('Huỷ cuộc họp')).toBeNull();
  });

  it('Xoá: hỏi lại — "Giữ lại" không gọi API; "Xoá" gọi đúng expectedVersion rồi quay lại màn trước', async () => {
    jest.mocked(meetingsService.remove).mockResolvedValue(undefined);
    await menu({ canDelete: true }, { version: 4 });
    await openMenu();
    await fireEvent.press(screen.getByText('Xoá cuộc họp'));

    expect(await screen.findByText('Xoá cuộc họp?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Giữ lại'));
    expect(meetingsService.remove).not.toHaveBeenCalled();

    await openMenu();
    await fireEvent.press(screen.getByText('Xoá cuộc họp'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(meetingsService.remove).toHaveBeenCalledWith('m9', 4, undefined));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith('success', 'Đã xoá cuộc họp.');
  });

  it('Rời: xác nhận rồi gọi API rời danh sách và quay lại', async () => {
    jest.mocked(meetingsService.leaveAttendance).mockResolvedValue(undefined);
    await menu({ canLeaveAttendance: true });
    await openMenu();
    await fireEvent.press(screen.getByText('Rời cuộc họp'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Rời' }));

    await waitFor(() => expect(meetingsService.leaveAttendance).toHaveBeenCalledWith('m9'));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith('success', 'Bạn đã rời cuộc họp.');
  });

  it('Huỷ: mở hộp "Huỷ cuộc họp?" có ô lý do (bắt buộc khi server đòi) — chưa gọi API cho tới khi xác nhận', async () => {
    await menu({ canCancel: true, cancelRequiresReason: true });
    await openMenu();
    await act(async () => fireEvent.press(screen.getByText('Huỷ cuộc họp')));

    expect(await screen.findByText('Huỷ cuộc họp?')).toBeOnTheScreen();
    expect(screen.getByLabelText(/Lý do huỷ \(bắt buộc\)/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Huỷ cuộc họp' })).toBeDisabled(); // chưa nhập lý do
    expect(meetingsService.cancel).not.toHaveBeenCalled();
  });
});
