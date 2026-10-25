import { isMeetingRecapType, meetingRecapHref } from '../meeting-recap-route';
import type { NotificationTarget } from '../notification-target.types';

/**
 * Bảng `meeting.recap-* / recording-ready → route` (p2-06). Khoá các quyết định dễ sai mà `tsc` không thấy: nhắc biên bản đi push dưới loại
 * `meeting.reminder` (+ `kind = RECAP`) chứ không phải `meeting.recap-reminder`; `meeting.reminder` thường KHÔNG được kéo vào màn soạn biên bản;
 * thiếu `meetingId` thì trả `null` để nơi gọi rơi về đường chung/hộp thư.
 */
describe('isMeetingRecapType', () => {
  it('nhận đúng bốn loại của BE và nhắc biên bản dạng push (`meeting.reminder` + kind RECAP)', () => {
    for (const type of [
      'meeting.recap-published',
      'meeting.recap-required',
      'meeting.recap-reminder',
      'meeting.recording-ready',
    ]) {
      expect(isMeetingRecapType({ type })).toBe(true);
    }
    expect(isMeetingRecapType({ kind: 'RECAP', type: 'meeting.reminder' })).toBe(true);
  });

  it('không nhận nhắc giờ họp thường, loại họp khác hay loại lạ', () => {
    expect(isMeetingRecapType({ type: 'meeting.reminder' })).toBe(false);
    expect(isMeetingRecapType({ kind: 'OTHER', type: 'meeting.reminder' })).toBe(false);
    // `kind = RECAP` chỉ có nghĩa với loại `meeting.reminder` — không "cứu" loại khác.
    expect(isMeetingRecapType({ kind: 'RECAP', type: 'meeting.started' })).toBe(false);
    for (const type of [
      'meeting.invited',
      'meeting.started',
      'meeting.removed',
      'recap',
      'mentor.ended',
    ]) {
      expect(isMeetingRecapType({ type })).toBe(false);
    }
  });
});

describe('meetingRecapHref', () => {
  it('meeting.recap-published → màn XEM biên bản', () => {
    expect(meetingRecapHref({ meetingId: 'm1', type: 'meeting.recap-published' })).toEqual({
      params: { meetingId: 'm1' },
      pathname: '/meetings/[meetingId]/recap',
    });
  });

  it.each([
    { type: 'meeting.recap-required' },
    { type: 'meeting.recap-reminder' },
    { kind: 'RECAP', type: 'meeting.reminder' },
  ])('%o → màn SOẠN biên bản', (extra) => {
    expect(meetingRecapHref({ meetingId: 'm1', ...extra })).toEqual({
      params: { meetingId: 'm1' },
      pathname: '/meetings/[meetingId]/recap-edit',
    });
  });

  it('meeting.recording-ready: có recordingId → trình phát đúng bản ghi; thiếu → danh sách bản ghi của cuộc họp', () => {
    expect(
      meetingRecapHref({ meetingId: 'm1', recordingId: 'r7', type: 'meeting.recording-ready' }),
    ).toEqual({
      params: { meetingId: 'm1', recordingId: 'r7' },
      pathname: '/meetings/[meetingId]/recordings/[recordingId]',
    });
    expect(meetingRecapHref({ meetingId: 'm1', type: 'meeting.recording-ready' })).toEqual({
      params: { meetingId: 'm1' },
      pathname: '/meetings/[meetingId]/recordings',
    });
  });

  it('thiếu meetingId → null (không dựng đường dẫn rỗng), kể cả khi có recordingId', () => {
    for (const type of [
      'meeting.recap-published',
      'meeting.recap-required',
      'meeting.recap-reminder',
      'meeting.recording-ready',
    ]) {
      expect(meetingRecapHref({ type })).toBeNull();
    }
    expect(meetingRecapHref({ recordingId: 'r7', type: 'meeting.recording-ready' })).toBeNull();
    expect(meetingRecapHref({ kind: 'RECAP', type: 'meeting.reminder' })).toBeNull();
  });

  it('meeting.reminder thường và loại không thuộc biên bản → null (để `meetingHref` chung xử lý: chi tiết/phòng họp)', () => {
    expect(meetingRecapHref({ meetingId: 'm1', type: 'meeting.reminder' })).toBeNull();
    expect(meetingRecapHref({ meetingId: 'm1', type: 'meeting.started' })).toBeNull();
    expect(meetingRecapHref({ meetingId: 'm1', type: 'meeting.invited' })).toBeNull();
  });

  it('nhận thẳng một NotificationTarget (nối vào hrefForTarget không cần ép kiểu)', () => {
    const target: NotificationTarget = { meetingId: 'm2', type: 'meeting.recap-published' };

    expect(meetingRecapHref(target)).toEqual({
      params: { meetingId: 'm2' },
      pathname: '/meetings/[meetingId]/recap',
    });
  });
});
