import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { meetingsService } from '../api/meetings.service';
import { meetingsLookupService } from '../api/meetings-lookup.service';
import type { MeetingDetailDto } from '../api/meetings.types';
import { MeetingAttendeesSection } from '../components/detail/MeetingAttendeesSection';
import { makeActions, makeAttendee, makeMeeting } from './fixtures';
import { apiError, renderWithProviders } from './render-helpers';

/** Quản lý người tham dự sau khi tạo (app.md p2-04 §3 `AttendeeList`): thêm/xoá, cấp-thu CO_HOST, giao chủ trì — theo quyền SERVER. */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meetings.service', () => ({
  meetingsService: {
    addAttendees: jest.fn(),
    listAttendees: jest.fn(),
    removeAttendee: jest.fn(),
    setRole: jest.fn(),
    transferHost: jest.fn(),
  },
}));
jest.mock('../api/meetings-lookup.service', () => ({
  meetingsLookupService: { searchWorkspaceMembers: jest.fn() },
}));

const svc = jest.mocked(meetingsService);

const ROWS = [
  makeAttendee({ name: 'Lan', role: 'HOST', userId: 'u-host' }),
  makeAttendee({ name: 'Bình', role: 'CO_HOST', userId: 'u-co' }),
  makeAttendee({ name: 'Cường', role: 'ATTENDEE', userId: 'u-c' }),
];
const HOST_ACTIONS = makeActions({ canManageAttendees: true, canManageRoles: true });

async function renderSection(overrides: Partial<MeetingDetailDto> = {}) {
  await renderWithProviders(
    <MeetingAttendeesSection
      meeting={makeMeeting({
        attendeeCount: 3,
        myActions: HOST_ACTIONS,
        myRole: 'HOST',
        ...overrides,
      })}
    />,
  );
  await screen.findByText('Cường');
}

beforeEach(() => {
  jest.clearAllMocks();
  svc.listAttendees.mockResolvedValue({
    items: ROWS,
    meta: { hasMore: false, limit: 50, nextCursor: null },
  });
  jest.mocked(meetingsLookupService.searchWorkspaceMembers).mockResolvedValue([
    { avatarUrl: null, displayName: null, name: 'An', userId: 'u1' },
    { avatarUrl: null, displayName: null, name: 'Cường', userId: 'u-c' },
  ]);
});

describe('MeetingAttendeesSection — ai thấy nút gì', () => {
  it('HOST: "Thêm người" + menu trên CO_HOST và ATTENDEE, KHÔNG có menu trên chính chủ trì', async () => {
    await renderSection();
    expect(screen.getByText('Thêm người')).toBeOnTheScreen();
    expect(screen.getByLabelText('Tuỳ chọn cho Bình')).toBeOnTheScreen();
    expect(screen.getByLabelText('Tuỳ chọn cho Cường')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Tuỳ chọn cho Lan')).toBeNull();
  });

  it('CO_HOST: thêm người được, nhưng chỉ có menu trên ATTENDEE (không xoá/đổi vai đồng chủ trì khác)', async () => {
    await renderSection({
      myActions: makeActions({ canManageAttendees: true }),
      myRole: 'CO_HOST',
    });
    expect(screen.getByText('Thêm người')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Tuỳ chọn cho Bình')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Tuỳ chọn cho Cường'));
    expect(await screen.findByText('Xoá khỏi cuộc họp')).toBeOnTheScreen();
    expect(screen.queryByText('Đặt làm đồng chủ trì')).toBeNull();
    expect(screen.queryByText('Giao quyền chủ trì')).toBeNull();
  });

  it('ATTENDEE (server không bật cờ nào): không có nút quản lý nào', async () => {
    await renderSection({ myActions: makeActions(), myRole: 'ATTENDEE' });
    expect(screen.queryByText('Thêm người')).toBeNull();
    expect(screen.queryByLabelText('Tuỳ chọn cho Cường')).toBeNull();
  });

  it('cuộc họp đã kết thúc: danh sách đóng băng làm lịch sử ⇒ không thêm/xoá dù cờ còn bật', async () => {
    await renderSection({ status: 'ENDED' });
    expect(screen.queryByText('Thêm người')).toBeNull();
    expect(screen.queryByLabelText('Tuỳ chọn cho Cường')).toBeNull();
  });

  it('cuộc họp chỉ có metadata (OWNER/ADMIN không tham dự) không hiện danh sách và không tải API', async () => {
    await renderWithProviders(
      <MeetingAttendeesSection meeting={makeMeeting({ isMetadataOnly: true })} />,
    );
    expect(screen.queryByText(/Người tham dự/)).toBeNull();
    expect(svc.listAttendees).not.toHaveBeenCalled();
  });
});

describe('MeetingAttendeesSection — thao tác', () => {
  it('thêm người: người đã có bị khoá, chọn người mới rồi "Thêm 1 người" ⇒ POST /attendees + toast', async () => {
    svc.addAttendees.mockResolvedValue({ added: ['u1'], alreadyAttending: [], rejected: [] });
    await renderSection();
    await fireEvent.press(screen.getByText('Thêm người'));

    expect(await screen.findByText('Cường · Đã tham dự')).toBeDisabled();
    await fireEvent.press(await screen.findByText('An'));
    await fireEvent.press(screen.getByText('Thêm 1 người'));

    await waitFor(() => expect(svc.addAttendees).toHaveBeenCalledWith('m1', ['u1'], undefined));
    expect(showToast).toHaveBeenCalledWith('success', 'Đã thêm 1 người.');
  });

  it('server báo đầy chỗ (MEET_005) ⇒ toast lỗi, không đóng lặng lẽ', async () => {
    svc.addAttendees.mockRejectedValue(apiError(409, 'MEET_005'));
    await renderSection();
    await fireEvent.press(screen.getByText('Thêm người'));
    await fireEvent.press(await screen.findByText('An'));
    await fireEvent.press(screen.getByText('Thêm 1 người'));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('error', 'Cuộc họp đã đạt số người tham dự tối đa.'),
    );
  });

  it('cấp rồi thu vai đồng chủ trì qua menu hàng', async () => {
    svc.setRole.mockResolvedValue(makeAttendee());
    await renderSection();
    await fireEvent.press(screen.getByLabelText('Tuỳ chọn cho Cường'));
    await fireEvent.press(await screen.findByText('Đặt làm đồng chủ trì'));
    await waitFor(() => expect(svc.setRole).toHaveBeenCalledWith('m1', 'u-c', 'CO_HOST'));

    await fireEvent.press(screen.getByLabelText('Tuỳ chọn cho Bình'));
    await fireEvent.press(await screen.findByText('Bỏ vai đồng chủ trì'));
    await waitFor(() => expect(svc.setRole).toHaveBeenCalledWith('m1', 'u-co', 'ATTENDEE'));
  });

  it('xoá người: hộp thoại NÊU TÊN, xác nhận rồi mới gọi DELETE', async () => {
    svc.removeAttendee.mockResolvedValue();
    await renderSection();
    await fireEvent.press(screen.getByLabelText('Tuỳ chọn cho Cường'));
    await fireEvent.press(await screen.findByText('Xoá khỏi cuộc họp'));

    expect(await screen.findByText(/Cường sẽ không còn trong danh sách/)).toBeOnTheScreen();
    expect(svc.removeAttendee).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Xoá'));
    await waitFor(() => expect(svc.removeAttendee).toHaveBeenCalledWith('m1', 'u-c'));
  });

  it('giao chủ trì: xác nhận tên rồi gửi kèm expectedVersion của cuộc họp', async () => {
    svc.transferHost.mockResolvedValue(makeMeeting());
    await renderSection({ version: 7 });
    await fireEvent.press(screen.getByLabelText('Tuỳ chọn cho Cường'));
    await fireEvent.press(await screen.findByText('Giao quyền chủ trì'));

    expect(await screen.findByText(/Cường sẽ thành chủ trì/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Giao chủ trì'));
    await waitFor(() => expect(svc.transferHost).toHaveBeenCalledWith('m1', 'u-c', 7));
  });
});
