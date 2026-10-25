import dayjs from 'dayjs';

import {
  countdownText,
  groupByDay,
  isoToZoned,
  meetingZoneNote,
  toDayKey,
  zonedTimeToIso,
  zoneShortName,
} from '../utils/meeting-time.utils';
import { makeListItem } from './fixtures';

/** `meeting-time.utils` (app.md p2-04 §8 "Util"): nhóm ngày qua nửa đêm, DST múi giờ châu Âu, nhãn múi giờ (MT-19). */

/** Mốc theo giờ MÁY (test không phụ thuộc múi giờ của máy chạy). */
const local = (text: string): string => dayjs(text, 'YYYY-MM-DD HH:mm').toISOString();

describe('groupByDay', () => {
  it('họp bắt đầu 23:30 và 00:15 rơi vào HAI ngày khác nhau; nhóm sắp theo giờ, ngày sắp tăng dần', () => {
    const late = makeListItem({
      endAt: local('2026-09-30 00:30'),
      id: 'late',
      startAt: local('2026-09-29 23:30'),
    });
    const early = makeListItem({
      endAt: local('2026-09-30 01:00'),
      id: 'early',
      startAt: local('2026-09-30 00:15'),
    });
    const morning = makeListItem({
      endAt: local('2026-09-30 09:30'),
      id: 'morning',
      startAt: local('2026-09-30 09:00'),
    });

    const groups = groupByDay([morning, early, late]);

    expect(groups.map((g) => g.dayKey)).toEqual(['2026-09-29', '2026-09-30']);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['late']);
    expect(groups[1]?.items.map((i) => i.id)).toEqual(['early', 'morning']);
  });

  it('họp qua nửa đêm thuộc NGÀY BẮT ĐẦU (không nhân đôi sang ngày sau)', () => {
    const overnight = makeListItem({
      endAt: local('2026-10-01 01:00'),
      startAt: local('2026-09-30 22:00'),
    });
    const groups = groupByDay([overnight]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.dayKey).toBe(toDayKey(new Date(overnight.startAt)));
  });
});

describe('zonedTimeToIso / isoToZoned — giờ mùa hè châu Âu (DST)', () => {
  it('09:00 Paris = 08:00Z mùa đông (UTC+1) và 07:00Z mùa hè (UTC+2)', () => {
    expect(zonedTimeToIso('2026-01-15', '09:00', 'Europe/Paris')).toBe('2026-01-15T08:00:00.000Z');
    expect(zonedTimeToIso('2026-07-15', '09:00', 'Europe/Paris')).toBe('2026-07-15T07:00:00.000Z');
  });

  it('ngày chuyển giờ 29/03/2026: 01:00 → 04:00 giờ tường chỉ dài 2 GIỜ thật', () => {
    const start = zonedTimeToIso('2026-03-29', '01:00', 'Europe/Paris') ?? '';
    const end = zonedTimeToIso('2026-03-29', '04:00', 'Europe/Paris') ?? '';
    expect(Date.parse(end) - Date.parse(start)).toBe(2 * 3_600_000);
  });

  it('đổi ngược: mốc UTC → ngày/giờ tường của múi giờ họp (khớp lúc mở form sửa)', () => {
    expect(isoToZoned('2026-07-15T07:00:00.000Z', 'Europe/Paris')).toEqual({
      dayKey: '2026-07-15',
      time: '09:00',
    });
    expect(isoToZoned('2026-09-30T17:30:00.000Z', 'Asia/Tokyo')).toEqual({
      dayKey: '2026-10-01',
      time: '02:30',
    });
  });

  it('sai định dạng → null; múi giờ lạ → rơi về giờ Việt Nam thay vì ném lỗi', () => {
    expect(zonedTimeToIso('không phải ngày', '09:00', 'Europe/Paris')).toBeNull();
    expect(zonedTimeToIso('2026-09-30', '09:00', 'Mars/Olympus')).toBe('2026-09-30T02:00:00.000Z');
  });
});

describe('meetingZoneNote — nhãn múi giờ cuộc họp (MT-19)', () => {
  const startAt = '2026-09-30T02:00:00.000Z';

  it('thiết bị Tokyo, họp giờ Hà Nội ⇒ "09:00 giờ Hà Nội"', () => {
    expect(meetingZoneNote(startAt, 'Asia/Ho_Chi_Minh', 'Asia/Tokyo')).toBe('09:00 giờ Hà Nội');
  });

  it('cùng múi giờ ⇒ rỗng (không thêm dòng thừa); múi giờ hỏng ⇒ rỗng', () => {
    expect(meetingZoneNote(startAt, 'Asia/Tokyo', 'Asia/Tokyo')).toBe('');
    expect(meetingZoneNote(startAt, 'Mars/Olympus', 'Asia/Tokyo')).toBe('');
  });

  it('múi giờ ngoài bảng rút gọn lấy phần cuối mã IANA', () => {
    expect(zoneShortName('Africa/Nairobi')).toBe('Nairobi');
    expect(zoneShortName('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(meetingZoneNote(startAt, 'Africa/Nairobi', 'Asia/Tokyo')).toBe('05:00 giờ Nairobi');
  });
});

describe('countdownText', () => {
  it('chọn đơn vị lớn nhất còn ý nghĩa', () => {
    expect(countdownText(30_000)).toBe('30 giây');
    expect(countdownText(12 * 60_000)).toBe('12 phút');
    expect(countdownText((2 * 60 + 5) * 60_000)).toBe('2 giờ 5 phút');
    expect(countdownText((26 * 60 + 5) * 60_000)).toBe('1 ngày 2 giờ');
    expect(countdownText(-5000)).toBe('0 giây');
  });
});
