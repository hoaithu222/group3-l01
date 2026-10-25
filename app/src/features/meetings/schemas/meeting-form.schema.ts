import { z } from 'zod';

import {
  AGENDA_MAX,
  ATTENDEES_MAX,
  COHOSTS_MAX,
  LOCATION_MAX,
  REMINDERS_MAX,
  TITLE_MAX,
} from '../constants/meetings.constants';
import { zonedTimeToIso } from '../utils/meeting-time.utils';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Thời lượng tối đa BE cho phép (`LIMITS.meeting.scheduleMaxDurationMinutes` = 1440). */
const MAX_DURATION_MS = 24 * 3_600_000;

export interface MeetingFormOptions {
  /** `create` kiểm "không đặt lịch trong quá khứ" (`MEET_004`); `edit` bỏ qua — họp đã bắt đầu vẫn sửa tiêu đề/`endAt` được. */
  mode: 'create' | 'edit';
  now?: () => number;
}

/**
 * Schema form lịch họp (Zod 4). Giá trị form là CHUỖI ngày/giờ đồng hồ tường theo múi giờ của cuộc họp — đổi sang mốc UTC ở
 * `zonedTimeToIso` (một chỗ). Luật khớp `createMeetingSchema` của BE để lỗi hiện đúng TRƯỜNG ngay tại máy, không đợi vòng
 * server: `endAt > startAt` và ≤ 24 giờ (`MEET_003`), không ở quá khứ (`MEET_004`), nền tảng ngoài cần URL https (`MEET_015`),
 * tối đa 3 mốc nhắc. BE vẫn kiểm lại (host allowlist theo nền tảng chỉ BE biết).
 */
export function meetingFormSchema({ mode, now = Date.now }: MeetingFormOptions) {
  return z
    .object({
      agenda: z
        .string()
        .trim()
        .max(AGENDA_MAX, `Nội dung tối đa ${String(AGENDA_MAX)} ký tự`),
      attendeeIds: z
        .array(z.string())
        .max(ATTENDEES_MAX, `Tối đa ${String(ATTENDEES_MAX)} người tham dự`),
      coHostIds: z.array(z.string()).max(COHOSTS_MAX, `Tối đa ${String(COHOSTS_MAX)} đồng chủ trì`),
      createChatGroup: z.boolean(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Chọn ngày họp'),
      endTime: z.string().regex(TIME, 'Chọn giờ kết thúc'),
      externalUrl: z.string().trim(),
      format: z.enum(['ONLINE', 'OFFLINE', 'HYBRID']),
      lobbyMode: z.enum(['OFF', 'NON_ATTENDEES', 'ALL']),
      location: z
        .string()
        .trim()
        .max(LOCATION_MAX, `Địa điểm tối đa ${String(LOCATION_MAX)} ký tự`),
      notifyVia: z.enum(['APP', 'CHAT', 'BOTH']),
      platform: z.enum(['INTERNAL', 'ZOOM', 'TEAMS', 'GOOGLE_MEET', 'OTHER']),
      recapRequired: z.boolean(),
      recordingAllowed: z.boolean(),
      reminderMinutes: z
        .array(z.number())
        .max(REMINDERS_MAX, `Tối đa ${String(REMINDERS_MAX)} mốc nhắc`),
      startTime: z.string().regex(TIME, 'Chọn giờ bắt đầu'),
      timezone: z.string().min(1, 'Chọn múi giờ'),
      title: z
        .string()
        .trim()
        .min(1, 'Nhập tiêu đề')
        .max(TITLE_MAX, `Tiêu đề tối đa ${String(TITLE_MAX)} ký tự`),
      visibility: z.enum(['ATTENDEES', 'WORKSPACE']),
      workspaceId: z.string().min(1, 'Chọn nhóm'),
    })
    .superRefine((v, ctx) => {
      const startIso = zonedTimeToIso(v.date, v.startTime, v.timezone);
      const endIso = zonedTimeToIso(v.date, v.endTime, v.timezone);
      if (startIso && endIso) {
        const span = Date.parse(endIso) - Date.parse(startIso);
        if (span <= 0)
          ctx.addIssue({
            code: 'custom',
            message: 'Giờ kết thúc phải sau giờ bắt đầu',
            path: ['endTime'],
          });
        else if (span > MAX_DURATION_MS)
          ctx.addIssue({
            code: 'custom',
            message: 'Cuộc họp dài tối đa 24 giờ',
            path: ['endTime'],
          });
        if (mode === 'create' && Date.parse(startIso) <= now()) {
          ctx.addIssue({
            code: 'custom',
            message: 'Không thể đặt lịch họp trong quá khứ',
            path: ['startTime'],
          });
        }
      }
      // BE: họp trực tiếp không đi kèm nền tảng ngoài (`MEET_015`) — form đã ép về "Phòng nội bộ", đây là hàng rào cuối.
      if (v.format === 'OFFLINE' && v.platform !== 'INTERNAL') {
        ctx.addIssue({
          code: 'custom',
          message: 'Họp trực tiếp không dùng nền tảng trực tuyến',
          path: ['platform'],
        });
      }
      if (v.platform !== 'INTERNAL') {
        if (!/^https:\/\/\S+$/i.test(v.externalUrl)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Nhập liên kết họp bắt đầu bằng https://',
            path: ['externalUrl'],
          });
        }
      }
    });
}

export type MeetingFormValues = z.infer<ReturnType<typeof meetingFormSchema>>;
