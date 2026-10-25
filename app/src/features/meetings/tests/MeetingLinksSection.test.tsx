import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { MeetingLinksSection } from '../components/detail/MeetingLinksSection';
import { makeActions, makeMeeting } from './fixtures';

/**
 * "Trao đổi & tài liệu" của chi tiết cuộc họp (p2-06 app.md §1): MỖI lối vào là một dòng bấm được trong MỘT thẻ, mọi dòng theo cờ server,
 * nháp biên bản không lộ cho người xem, không lối vào nào ⇒ không vẽ cả khối.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

beforeEach(() => jest.clearAllMocks());

describe('MeetingLinksSection', () => {
  it('chủ trì, chưa công bố: "Viết biên bản" mở trình soạn; có bản ghi → "Bản ghi cuộc họp (2)" mở danh sách', async () => {
    const meeting = makeMeeting({ myActions: makeActions({ canEditRecap: true, canViewRecap: true }), myRole: 'HOST', readyRecordingCount: 2, status: 'ENDED' });
    await render(<MeetingLinksSection meeting={meeting} />);

    expect(screen.getByText('Trao đổi & tài liệu')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Viết biên bản'));
    expect(router.push).toHaveBeenLastCalledWith({ params: { meetingId: meeting.id }, pathname: '/meetings/[meetingId]/recap-edit' });
    await fireEvent.press(screen.getByText('Bản ghi cuộc họp (2)'));
    expect(router.push).toHaveBeenLastCalledWith({ params: { meetingId: meeting.id }, pathname: '/meetings/[meetingId]/recordings' });
  });

  it('chủ trì, đã công bố → "Xem & sửa biên bản" mở màn xem (có nút Sửa ở đó)', async () => {
    const meeting = makeMeeting({ hasPublishedRecap: true, myActions: makeActions({ canEditRecap: true, canViewRecap: true }), myRole: 'HOST', status: 'ENDED' });
    await render(<MeetingLinksSection meeting={meeting} />);
    await fireEvent.press(screen.getByText('Xem & sửa biên bản'));
    expect(router.push).toHaveBeenCalledWith({ params: { meetingId: meeting.id }, pathname: '/meetings/[meetingId]/recap' });
  });

  it('người tham dự: chỉ "Xem biên bản" khi ĐÃ công bố; chưa công bố + chưa có bản ghi → không có khối nào', async () => {
    const published = makeMeeting({ hasPublishedRecap: true, myActions: makeActions({ canViewRecap: true }), status: 'ENDED' });
    await render(<MeetingLinksSection meeting={published} />);
    expect(screen.getByText('Xem biên bản')).toBeOnTheScreen();
    expect(screen.queryByText(/Viết biên bản|Xem & sửa/)).toBeNull();
  });

  it('không có gì để mở (chưa công bố, chưa có bản ghi, không có nhóm chat) → không vẽ cả khối', async () => {
    await render(<MeetingLinksSection meeting={makeMeeting({ status: 'ENDED' })} />);
    expect(screen.queryByText('Trao đổi & tài liệu')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('người chỉ xem metadata (OWNER không tham dự, cuộc họp ATTENDEES) → không có khối, kể cả khi có cờ/bản ghi', async () => {
    await render(<MeetingLinksSection meeting={makeMeeting({ conversationId: 'c1', isMetadataOnly: true, myActions: makeActions({ canViewRecap: true }), readyRecordingCount: 1 })} />);
    expect(screen.queryByText('Trao đổi & tài liệu')).toBeNull();
  });

  it('có nhóm chat: dòng đầu tiên, mở đúng hội thoại; nhóm chat + biên bản nằm CHUNG một khối', async () => {
    const meeting = makeMeeting({ conversationId: 'conv-1', hasPublishedRecap: true, myActions: makeActions({ canViewRecap: true }), status: 'ENDED' });
    await render(<MeetingLinksSection meeting={meeting} />);

    expect(screen.getAllByText('Trao đổi & tài liệu')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Nhóm chat của cuộc họp'));
    expect(router.push).toHaveBeenCalledWith({ params: { conversationId: 'conv-1' }, pathname: '/messages/[conversationId]' });
    expect(screen.getByText('Xem biên bản')).toBeOnTheScreen();
  });
});
