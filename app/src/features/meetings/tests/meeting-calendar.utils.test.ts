import { attendeeActions, hasAnyAttendeeAction } from '../utils/attendee-actions';
import { addMinutesToTime, minutesBetween } from '../utils/meeting-duration.utils';
import {
  countByDay,
  monthGridDays,
  monthWeekCount,
  shiftMonth,
} from '../utils/meeting-month.utils';
import { toDayKey } from '../utils/meeting-time.utils';
import { formatElapsed, waitingStatus } from '../utils/meeting-waiting.utils';
import { timezoneOptions } from '../utils/meeting-zone.utils';
import { makeActions, makeListItem, makeMeeting } from './fixtures';

/** Hàm thuần của lịch THÁNG, phòng chờ, quyền trên hàng người tham dự, thời lượng nhanh, danh sách múi giờ. */

describe('lưới tháng', () => {
  it('tháng 9/2026 (mùng 1 là thứ ba) cần 5 hàng, bắt đầu từ thứ hai 31/8 và kết thúc chủ nhật 4/10', () => {
    const days = monthGridDays(new Date(2026, 8, 15));
    expect(monthWeekCount(new Date(2026, 8, 15))).toBe(5);
    expect(days).toHaveLength(35);
    expect(toDayKey(days[0] as Date)).toBe('2026-08-31');
    expect(toDayKey(days[34] as Date)).toBe('2026-10-04');
  });

  it('số hàng co theo tháng: 2/2027 vừa đúng 4 hàng, 8/2026 (mùng 1 là thứ bảy) cần 6 hàng', () => {
    expect(monthWeekCount(new Date(2027, 1, 10))).toBe(4);
    expect(monthWeekCount(new Date(2026, 7, 10))).toBe(6);
  });

  it('shiftMonth kẹp ngày cuối tháng, không tràn sang tháng sau (31/1 + 1 tháng = 28/2)', () => {
    expect(toDayKey(shiftMonth(new Date(2026, 0, 31), 1))).toBe('2026-02-28');
    expect(toDayKey(shiftMonth(new Date(2026, 0, 15), -1))).toBe('2025-12-15');
  });

  it('countByDay đếm theo ngày giờ máy và KHÔNG đếm cuộc họp đã huỷ', () => {
    const at = (h: number) => new Date(2026, 8, 30, h).toISOString();
    const counts = countByDay([
      makeListItem({ id: 'a', startAt: at(9) }),
      makeListItem({ id: 'b', startAt: at(14) }),
      makeListItem({ id: 'c', startAt: at(16), status: 'CANCELLED' }),
    ]);
    expect(counts.get('2026-09-30')).toBe(2);
  });
});

describe('waitingStatus — phòng chờ', () => {
  const meeting = makeMeeting(); // startAt 02:00Z, joinOpensAt 01:50Z, phòng nội bộ
  const at = (iso: string) => Date.parse(iso);

  it('trước khi phòng chờ mở: đếm ngược + nói khi nào mở', () => {
    const status = waitingStatus(meeting, at('2026-09-30T01:00:00.000Z'));
    expect(status?.headline).toBe('Bắt đầu sau 1 giờ 0 phút');
    expect(status?.hint).toMatch(/^Phòng chờ mở lúc \d{2}:\d{2} \(10 phút trước giờ họp\)\.$/);
  });

  it('đã tới joinOpensAt: phòng chờ mở, vẫn đếm ngược tới giờ họp', () => {
    const status = waitingStatus(meeting, at('2026-09-30T01:55:00.000Z'));
    expect(status?.headline).toBe('Bắt đầu sau 5 phút');
    expect(status?.hint).toBe('Phòng chờ đã mở — bạn có thể vào trước giờ họp.');
  });

  it('quá giờ họp mà chủ trì chưa bắt đầu: "Đã tới giờ họp" + đang chờ chủ trì', () => {
    const status = waitingStatus(meeting, at('2026-09-30T02:03:00.000Z'));
    expect(status).toEqual({
      headline: 'Đã tới giờ họp',
      hint: 'Đang chờ chủ trì bắt đầu cuộc họp.',
    });
  });

  it('LIVE: đếm thời gian đã diễn ra theo startedAt', () => {
    const live = makeMeeting({ startedAt: '2026-09-30T02:00:00.000Z', status: 'LIVE' });
    expect(waitingStatus(live, at('2026-09-30T02:14:22.000Z'))?.headline).toBe(
      'Đang diễn ra 00:14:22',
    );
  });

  it('họp ngoài (Zoom) không có phòng chờ nội bộ ⇒ không có dòng phụ; ENDED/CANCELLED ⇒ không có gì để chờ', () => {
    const zoom = makeMeeting({ platform: 'ZOOM' });
    expect(waitingStatus(zoom, at('2026-09-30T01:00:00.000Z'))?.hint).toBeUndefined();
    expect(waitingStatus(makeMeeting({ status: 'ENDED' }), 0)).toBeNull();
    expect(waitingStatus(makeMeeting({ status: 'CANCELLED' }), 0)).toBeNull();
  });

  it('formatElapsed', () => {
    expect(formatElapsed(3_723_000)).toBe('01:02:03');
    expect(formatElapsed(-1)).toBe('00:00:00');
  });
});

describe('attendeeActions — quyền trên một hàng người tham dự', () => {
  const host = {
    myActions: makeActions({ canManageAttendees: true, canManageRoles: true }),
    myRole: 'HOST',
    status: 'SCHEDULED',
  } as const;
  const coHost = {
    myActions: makeActions({ canManageAttendees: true }),
    myRole: 'CO_HOST',
    status: 'SCHEDULED',
  } as const;

  it('HOST: đổi vai, giao chủ trì, xoá cả ATTENDEE lẫn CO_HOST; không ai đụng được HOST', () => {
    expect(attendeeActions(host, { role: 'ATTENDEE' })).toEqual({
      coHost: 'grant',
      remove: true,
      transfer: true,
    });
    expect(attendeeActions(host, { role: 'CO_HOST' })).toEqual({
      coHost: 'revoke',
      remove: true,
      transfer: true,
    });
    expect(hasAnyAttendeeAction(attendeeActions(host, { role: 'HOST' }))).toBe(false);
  });

  it('CO_HOST: chỉ xoá được ATTENDEE (BE trả MEET_002 nếu xoá CO_HOST), không đổi vai/giao chủ trì', () => {
    expect(attendeeActions(coHost, { role: 'ATTENDEE' })).toEqual({
      coHost: null,
      remove: true,
      transfer: false,
    });
    expect(hasAnyAttendeeAction(attendeeActions(coHost, { role: 'CO_HOST' }))).toBe(false);
  });

  it('server chưa cho (không có cờ) hoặc ENDED/CANCELLED (danh sách đóng băng) ⇒ không có việc nào', () => {
    const attendee = { myActions: makeActions(), myRole: 'ATTENDEE', status: 'SCHEDULED' } as const;
    expect(hasAnyAttendeeAction(attendeeActions(attendee, { role: 'ATTENDEE' }))).toBe(false);
    expect(
      hasAnyAttendeeAction(attendeeActions({ ...host, status: 'ENDED' }, { role: 'ATTENDEE' })),
    ).toBe(false);
  });
});

describe('thời lượng nhanh và danh sách múi giờ', () => {
  it('addMinutesToTime / minutesBetween chỉ trong một ngày', () => {
    expect(addMinutesToTime('09:30', 45)).toBe('10:15');
    expect(addMinutesToTime('23:30', 45)).toBeNull(); // qua nửa đêm — form không nhận
    expect(minutesBetween('09:00', '10:30')).toBe(90);
    expect(minutesBetween('10:00', '09:00')).toBe(-60);
    expect(minutesBetween('x', '09:00')).toBeNull();
  });

  it('múi giờ thiết bị đứng đầu; múi giờ đang chọn ngoài bảng vẫn có mặt; không trùng', () => {
    const options = timezoneOptions('Africa/Nairobi', 'Asia/Tokyo');
    expect(options[0]?.value).toBe('Asia/Tokyo');
    expect(options[1]?.value).toBe('Africa/Nairobi');
    expect(options.filter((o) => o.value === 'Asia/Tokyo')).toHaveLength(1);
    expect(options.some((o) => o.value === 'Asia/Ho_Chi_Minh')).toBe(true);
  });
});
