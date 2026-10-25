/**
 * Tiện ích tab "Cuộc họp" (p2-04 admin.md §2.1, §3): `statusBadge('meeting', …)` đủ 4 trạng thái có nhãn chữ + màu, gom tham số lọc từ URL,
 * và định dạng giờ theo trình duyệt + múi giờ cuộc họp.
 */
import { describe, expect, it } from 'vitest';

import { MEETING_END_REASON_LABELS, MEETING_PLATFORM_LABELS, MEETING_STATUS_FILTER_OPTIONS } from '@/features/workspace/constants/workspace-meetings.constants';
import { dateToUrl, dayBoundaryIso, formatMeetingTimes, parseMeetingStatus, toMeetingListParams, urlDateToDate } from '@/features/workspace/utils/workspace-meetings.utils';
import { statusBadge } from '@/shared/utils/format';

describe("statusBadge('meeting', …)", () => {
  it('đủ 4 trạng thái có nhãn chữ tiếng Việt và tông màu riêng (không chỉ dựa vào màu)', () => {
    expect(statusBadge('meeting', 'SCHEDULED')).toEqual({ variant: 'info', label: 'Sắp tới' });
    expect(statusBadge('meeting', 'LIVE')).toEqual({ variant: 'success', label: 'Đang diễn ra' });
    expect(statusBadge('meeting', 'ENDED')).toEqual({ variant: 'neutral', label: 'Đã kết thúc' });
    expect(statusBadge('meeting', 'CANCELLED')).toEqual({ variant: 'error', label: 'Đã huỷ' });
  });

  it('trạng thái chưa khai → nhãn chính giá trị đó, tông trung tính (không đoán màu)', () => {
    expect(statusBadge('meeting', 'PAUSED')).toEqual({ variant: 'neutral', label: 'PAUSED' });
  });

  it('ô lọc trạng thái dùng CÙNG nhãn với badge; mọi nền tảng và lý do kết thúc của BE đều có nhãn', () => {
    for (const { value, label } of MEETING_STATUS_FILTER_OPTIONS) expect(label).toBe(statusBadge('meeting', value).label);
    expect(Object.keys(MEETING_PLATFORM_LABELS).sort()).toEqual(['GOOGLE_MEET', 'INTERNAL', 'OTHER', 'TEAMS', 'ZOOM']);
    expect(Object.keys(MEETING_END_REASON_LABELS).sort()).toEqual(['EMPTY', 'FORCE_ENDED', 'HOST_ENDED', 'HOST_REMOVED', 'MAX_DURATION', 'WORKSPACE_ARCHIVED']);
  });
});

describe('gom tham số lọc từ URL', () => {
  it('parseMeetingStatus: chỉ nhận 4 trạng thái của BE', () => {
    expect(parseMeetingStatus('LIVE')).toBe('LIVE');
    for (const bad of ['', 'live', 'ACTIVE', 'SCHEDULED,LIVE']) expect(parseMeetingStatus(bad)).toBeUndefined();
  });

  it('dayBoundaryIso: đầu/cuối ngày theo giờ máy; rỗng/sai định dạng → undefined', () => {
    expect(dayBoundaryIso('2026-09-01', 'start')).toBe(new Date(2026, 8, 1, 0, 0, 0, 0).toISOString());
    expect(dayBoundaryIso('2026-09-30', 'end')).toBe(new Date(2026, 8, 30, 23, 59, 59, 999).toISOString());
    expect(dayBoundaryIso('', 'start')).toBeUndefined();
    expect(dayBoundaryIso('khong-phai-ngay', 'end')).toBeUndefined();
  });

  it('urlDateToDate / dateToUrl: đi và về cùng ngày; null hai chiều', () => {
    const d = urlDateToDate('2026-09-05')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 5]);
    expect(dateToUrl(d)).toBe('2026-09-05');
    expect(urlDateToDate('')).toBeNull();
    expect(urlDateToDate('rac')).toBeNull();
    expect(dateToUrl(null)).toBeNull();
  });

  it('toMeetingListParams: chỉ đưa khoá có giá trị hợp lệ', () => {
    expect(toMeetingListParams({ page: 2, limit: 20, status: '', from: '', to: '' })).toEqual({ page: 2, limit: 20 });
    expect(toMeetingListParams({ page: 1, limit: 50, status: 'ENDED', from: '2026-09-01', to: '' })).toEqual({
      page: 1,
      limit: 50,
      status: 'ENDED',
      from: new Date(2026, 8, 1, 0, 0, 0, 0).toISOString(),
    });
    expect(toMeetingListParams({ page: 1, limit: 20, status: 'X', from: 'x', to: 'y' })).toEqual({ page: 1, limit: 20 });
  });
});

describe('formatMeetingTimes', () => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  it('cùng ngày: "HH:mm DD/MM/YYYY – HH:mm"; qua ngày: in cả ngày kết thúc', () => {
    const same = formatMeetingTimes({ startAt: '2026-10-05T02:00:00.000Z', endAt: '2026-10-05T02:45:00.000Z', timezone: tz });
    expect(same.main).toMatch(/^\d{2}:\d{2} \d{2}\/\d{2}\/\d{4} – \d{2}:\d{2}$/);
    const span = formatMeetingTimes({ startAt: '2026-10-05T02:00:00.000Z', endAt: '2026-10-07T02:45:00.000Z', timezone: tz });
    expect(span.main).toMatch(/^\d{2}:\d{2} \d{2}\/\d{2}\/\d{4} – \d{2}:\d{2} \d{2}\/\d{2}\/\d{4}$/);
  });

  it('múi giờ cuộc họp trùng trình duyệt → không dòng phụ; khác → có "giờ <múi giờ>"; chuỗi hỏng → không dòng phụ', () => {
    const base = { startAt: '2026-10-05T02:00:00.000Z', endAt: '2026-10-05T03:00:00.000Z' };
    expect(formatMeetingTimes({ ...base, timezone: tz }).local).toBeNull();
    const other = tz === 'Asia/Tokyo' ? 'America/New_York' : 'Asia/Tokyo';
    expect(formatMeetingTimes({ ...base, timezone: other }).local).toMatch(new RegExp(`^giờ ${other} \\d{2}:\\d{2} – \\d{2}:\\d{2}$`));
    expect(formatMeetingTimes({ ...base, timezone: 'Khong/Hop-Le' }).local).toBeNull();
  });
});
