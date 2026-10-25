import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { MeetingActionsBar } from '../components/detail/MeetingActionsBar';
import { makeActions, makeMeeting } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * `MeetingActionsBar` = thanh đáy chỉ có nút VÀO họp, vẽ đúng nút theo `myActions` của server (bảng README p2-04 §6.2) — client không tự suy
 * quyền. Sửa/Huỷ/Xoá/Rời/Chia sẻ ở menu AppBar (`MeetingDetailMenu.test.tsx`), KHÔNG được lẫn vào đây.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const LABELS = [
  'Bắt đầu cuộc họp',
  'Bắt đầu lại',
  'Vào cuộc họp',
  'Xin vào cuộc họp',
  'Vào phòng chờ',
  'Sửa cuộc họp',
  'Huỷ cuộc họp',
];

/** Nhãn nút đang hiện, theo thứ tự trong LABELS. */
function shown(): string[] {
  return LABELS.filter((label) => screen.queryByText(label) !== null);
}

async function bar(overrides: Parameters<typeof makeMeeting>[0], joinRemainingMs = 0) {
  await renderWithProviders(
    <MeetingActionsBar joinRemainingMs={joinRemainingMs} meeting={makeMeeting(overrides)} />,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('MeetingActionsBar — bảng myActions', () => {
  it('SCHEDULED · HOST trong cửa sổ vào: chỉ "Bắt đầu" (Sửa/Huỷ đã chuyển sang menu AppBar)', async () => {
    await bar({
      myActions: makeActions({ canCancel: true, canEdit: true, canStart: true }),
      myRole: 'HOST',
    });
    expect(shown()).toEqual(['Bắt đầu cuộc họp']);
  });

  it('SCHEDULED · ATTENDEE trong cửa sổ vào: chỉ "Vào phòng chờ" (chờ chủ trì), không Sửa/Huỷ', async () => {
    await bar({
      myActions: makeActions({ canJoin: true, canRsvp: true, joinVia: 'WAIT_FOR_HOST' }),
    });
    expect(shown()).toEqual(['Vào phòng chờ']);
    expect(screen.getByRole('button', { name: 'Vào phòng chờ' })).toBeEnabled();
  });

  it('SCHEDULED · thành viên nhóm qua lobby: "Xin vào cuộc họp"', async () => {
    await bar({
      myActions: makeActions({ canJoin: true, joinVia: 'LOBBY' }),
      myRole: null,
      visibility: 'WORKSPACE',
    });
    expect(shown()).toEqual(['Xin vào cuộc họp']);
  });

  it('LIVE · HOST: chỉ "Vào" (DIRECT) — Sửa giới hạn ở menu, không có Huỷ (LIVE phải "Kết thúc")', async () => {
    await bar({
      myActions: makeActions({ canEditLimited: true, canJoin: true, joinVia: 'DIRECT' }),
      myRole: 'HOST',
      status: 'LIVE',
    });
    expect(shown()).toEqual(['Vào cuộc họp']);
  });

  it('ENDED · HOST còn trong cửa sổ bắt đầu lại: "Bắt đầu lại"', async () => {
    await bar({ myActions: makeActions({ canStart: true }), myRole: 'HOST', status: 'ENDED' });
    expect(shown()).toEqual(['Bắt đầu lại']);
  });

  it('ENDED · HOST quá hạn bắt đầu lại (server tắt canStart) ⇒ không có nút', async () => {
    await bar({ myRole: 'HOST', status: 'ENDED' });
    expect(shown()).toEqual([]);
  });

  it('OWNER/ADMIN không tham dự: chỉ có quyền Huỷ ⇒ thanh đáy KHÔNG vẽ gì (Huỷ ở menu AppBar)', async () => {
    await bar({
      myActions: makeActions({ canCancel: true, cancelRequiresReason: true }),
      myRole: null,
    });
    expect(shown()).toEqual([]);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('CANCELLED và mọi cờ tắt ⇒ không có nút nào', async () => {
    await bar({ status: 'CANCELLED' });
    expect(shown()).toEqual([]);
  });

  it('bấm Vào mở phòng họp (p2-05: route meeting-room/[meetingId]); đủ cờ Sửa/Huỷ cũng KHÔNG sinh nút Sửa/Huỷ ở đây', async () => {
    await bar({
      id: 'm9',
      myActions: makeActions({ canCancel: true, canEdit: true, canJoin: true, joinVia: 'DIRECT' }),
    });
    expect(screen.queryByText('Sửa cuộc họp')).toBeNull();
    expect(screen.queryByText('Huỷ cuộc họp')).toBeNull();
    await fireEvent.press(screen.getByText('Vào cuộc họp'));
    expect(router.push).toHaveBeenCalledWith({
      params: { meetingId: 'm9' },
      pathname: '/meeting-room/[meetingId]',
    });
    expect(showToast).not.toHaveBeenCalled(); // hết thông báo "phòng họp sẽ có ở bản sau" của p2-04
  });

  it('có cả Bắt đầu lẫn Vào: chỉ nút ĐẦU là nút chính, nút sau đứng dưới (không hai nút chính cạnh nhau)', async () => {
    await bar({ myActions: makeActions({ canJoin: true, canStart: true, joinVia: 'DIRECT' }) });
    expect(shown()).toEqual(['Bắt đầu cuộc họp', 'Vào cuộc họp']);
  });
});

describe('MeetingActionsBar — họp ngoài và phòng chờ', () => {
  it('Zoom + canOpenExternal: nút "Mở Zoom" mở đúng link https', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await bar({
      externalUrl: 'https://zoom.us/j/123',
      myActions: makeActions({ canOpenExternal: true }),
      platform: 'ZOOM',
    });
    await fireEvent.press(screen.getByText('Mở Zoom'));
    expect(open).toHaveBeenCalledWith('https://zoom.us/j/123');
  });

  it('link không phải https KHÔNG được mở (kiểm lại ở client dù BE đã kiểm)', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await bar({
      externalUrl: 'javascript:alert(1)',
      myActions: makeActions({ canOpenExternal: true }),
      platform: 'OTHER',
    });
    await fireEvent.press(screen.getByText('Mở Khác'));
    expect(open).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('error', 'Liên kết họp không hợp lệ.');
  });

  it('PHÒNG CHỜ: người tham dự họp nội bộ trước khi phòng mở thấy nút "Vào phòng chờ" bị KHOÁ + lời giải thích', async () => {
    await bar({ myActions: makeActions({ canRsvp: true }) }, 5 * 60_000);
    expect(screen.getByRole('button', { name: 'Vào phòng chờ' })).toBeDisabled();
    expect(screen.getByText(/Nút vào sẽ bật khi phòng chờ mở/)).toBeOnTheScreen();
  });

  it('khi phòng chờ đã mở mà server chưa bật canJoin thì KHÔNG tự bật nút (không tự suy quyền)', async () => {
    await bar({ myActions: makeActions({ canRsvp: true }) }, 0);
    expect(shown()).toEqual([]);
  });
});
