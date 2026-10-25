import { meetingFormSchema, type MeetingFormValues } from '../schemas/meeting-form.schema';
import { buildCreatePayload, defaultFormValues } from '../utils/meeting-form-payload';

/** Zod của form lịch họp (app.md p2-04 §8): `endAt ≤ startAt`, URL bắt buộc khi Zoom, ≤ 3 nhắc; luật khớp `createMeetingSchema` của BE. */

const NOW = Date.parse('2026-09-30T00:00:00.000Z');

function values(overrides: Partial<MeetingFormValues> = {}): MeetingFormValues {
  return {
    ...defaultFormValues({ dayKey: '2026-10-05', workspaceId: 'ws-1' }),
    date: '2026-10-05',
    endTime: '10:00',
    startTime: '09:00',
    timezone: 'Asia/Ho_Chi_Minh',
    title: 'Họp giao ban',
    ...overrides,
  };
}

/** Lỗi theo trường (`path[0]` → thông điệp đầu tiên). */
function errorsOf(
  v: MeetingFormValues,
  mode: 'create' | 'edit' = 'create',
): Record<string, string> {
  const result = meetingFormSchema({ mode, now: () => NOW }).safeParse(v);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [String(i.path[0]), i.message]));
}

describe('meetingFormSchema', () => {
  it('form hợp lệ không có lỗi', () => {
    expect(errorsOf(values())).toEqual({});
  });

  it('giờ kết thúc phải sau giờ bắt đầu (endAt ≤ startAt ⇒ lỗi ở ô "Kết thúc")', () => {
    expect(errorsOf(values({ endTime: '09:00' })).endTime).toBe(
      'Giờ kết thúc phải sau giờ bắt đầu',
    );
    expect(errorsOf(values({ endTime: '08:30' })).endTime).toBe(
      'Giờ kết thúc phải sau giờ bắt đầu',
    );
  });

  it('không đặt lịch trong quá khứ khi TẠO, nhưng SỬA họp đã bắt đầu thì được', () => {
    const past = values({ date: '2026-09-29' });
    expect(errorsOf(past).startTime).toBe('Không thể đặt lịch họp trong quá khứ');
    expect(errorsOf(past, 'edit').startTime).toBeUndefined();
  });

  it('nền tảng ngoài (Zoom) BẮT BUỘC link https://; phòng nội bộ thì không cần', () => {
    expect(errorsOf(values({ externalUrl: '', platform: 'ZOOM' })).externalUrl).toMatch(
      /https:\/\//,
    );
    expect(
      errorsOf(values({ externalUrl: 'http://zoom.us/j/1', platform: 'ZOOM' })).externalUrl,
    ).toBeDefined();
    expect(errorsOf(values({ externalUrl: 'https://zoom.us/j/1', platform: 'ZOOM' }))).toEqual({});
    expect(errorsOf(values({ externalUrl: '', platform: 'INTERNAL' }))).toEqual({});
  });

  it('họp trực tiếp (OFFLINE) không đi kèm nền tảng ngoài (BE MEET_015)', () => {
    const errors = errorsOf(
      values({ externalUrl: 'https://zoom.us/j/1', format: 'OFFLINE', platform: 'ZOOM' }),
    );
    expect(errors.platform).toBe('Họp trực tiếp không dùng nền tảng trực tuyến');
  });

  it('tối đa 3 mốc nhắc, 200 người tham dự, 10 đồng chủ trì', () => {
    expect(errorsOf(values({ reminderMinutes: [5, 10, 15, 30] })).reminderMinutes).toBe(
      'Tối đa 3 mốc nhắc',
    );
    expect(errorsOf(values({ reminderMinutes: [5, 10, 15] }))).toEqual({});
    const many = (n: number) => Array.from({ length: n }, (_, i) => `u${String(i)}`);
    expect(errorsOf(values({ attendeeIds: many(201) })).attendeeIds).toBeDefined();
    expect(errorsOf(values({ coHostIds: many(11) })).coHostIds).toBeDefined();
  });

  it('tiêu đề trống (chỉ dấu cách) và chưa chọn nhóm bị chặn', () => {
    expect(errorsOf(values({ title: '   ' })).title).toBe('Nhập tiêu đề');
    expect(errorsOf(values({ workspaceId: '' })).workspaceId).toBe('Chọn nhóm');
  });
});

describe('buildCreatePayload', () => {
  it('giờ nhập là giờ tường theo MÚI GIỜ CỦA CUỘC HỌP: 09:00 Tokyo = 00:00Z', () => {
    const payload = buildCreatePayload(values({ timezone: 'Asia/Tokyo' }));
    expect(payload.startAt).toBe('2026-10-05T00:00:00.000Z');
    expect(payload.endAt).toBe('2026-10-05T01:00:00.000Z');
    expect(payload.timezone).toBe('Asia/Tokyo');
  });

  it('họp ONLINE không gửi địa điểm; phòng nội bộ không gửi link; mời người + nhóm chat đi theo body tạo', () => {
    const payload = buildCreatePayload(
      values({
        attendeeIds: ['u1', 'u2'],
        coHostIds: ['u2'],
        createChatGroup: true,
        externalUrl: 'https://x.y',
        location: 'Phòng 3',
        notifyVia: 'BOTH',
      }),
    );
    expect(payload.location).toBeUndefined();
    expect(payload.externalUrl).toBeUndefined();
    expect(payload).toMatchObject({
      attendeeIds: ['u1', 'u2'],
      coHostIds: ['u2'],
      createChatGroup: true,
      notifyVia: 'BOTH',
    });
  });
});
