import dayjs from 'dayjs';

import type {
  CreateMeetingPayload,
  MeetingDetailDto,
  UpdateMeetingPayload,
} from '../api/meetings.types';
import type { MeetingFormValues } from '../schemas/meeting-form.schema';
import { deviceTimeZone, isoToZoned, toDayKey, zonedTimeToIso } from './meeting-time.utils';

/** Chuyển giữa GIÁ TRỊ FORM (chuỗi ngày/giờ tường) ⇄ payload BE (ISO UTC). Hàm thuần, một chỗ. */

/** Mốc tròn 30 phút kế tiếp (09:07 → 09:30) làm giờ bắt đầu gợi ý — người dùng hiếm khi muốn "họp ngay bây giờ". */
function nextHalfHour(now: dayjs.Dayjs): dayjs.Dayjs {
  const minutes = now.minute();
  return now
    .second(0)
    .millisecond(0)
    .add(minutes < 30 ? 30 - minutes : 60 - minutes, 'minute');
}

export function defaultFormValues(
  options: { dayKey?: string; workspaceId?: string } = {},
): MeetingFormValues {
  const start = nextHalfHour(dayjs());
  const timezone = deviceTimeZone();
  const dayKey = options.dayKey ?? toDayKey(start.toDate());
  // Ngày chọn từ lịch (khác hôm nay) ⇒ gợi ý 09:00; hôm nay ⇒ mốc tròn kế tiếp.
  const sameDay = dayKey === toDayKey(start.toDate());
  const startTime = sameDay ? start.format('HH:mm') : '09:00';
  const endTime = dayjs(`${dayKey} ${startTime}`, 'YYYY-MM-DD HH:mm')
    .add(60, 'minute')
    .format('HH:mm');
  return {
    agenda: '',
    attendeeIds: [],
    coHostIds: [],
    createChatGroup: false,
    date: dayKey,
    endTime,
    externalUrl: '',
    format: 'ONLINE',
    lobbyMode: 'NON_ATTENDEES',
    location: '',
    notifyVia: 'APP',
    platform: 'INTERNAL',
    recapRequired: false,
    recordingAllowed: true,
    reminderMinutes: [15],
    startTime,
    timezone,
    title: '',
    visibility: 'ATTENDEES',
    workspaceId: options.workspaceId ?? '',
  };
}

/** Giá trị form từ chi tiết (mở form SỬA): giờ hiển thị theo múi giờ CỦA CUỘC HỌP (đúng cái người tạo đã nhập). */
export function valuesFromDetail(detail: MeetingDetailDto): MeetingFormValues {
  const start = isoToZoned(detail.startAt, detail.timezone);
  const end = isoToZoned(detail.endAt, detail.timezone);
  return {
    agenda: detail.agenda ?? '',
    attendeeIds: [],
    coHostIds: detail.coHostIds,
    createChatGroup: false,
    date: start.dayKey,
    endTime: end.time,
    externalUrl: detail.externalUrl ?? '',
    format: detail.format,
    lobbyMode: detail.lobbyMode,
    location: detail.location ?? '',
    notifyVia: detail.notifyVia,
    platform: detail.platform,
    recapRequired: detail.recapRequired,
    recordingAllowed: detail.recordingAllowed,
    reminderMinutes: detail.reminderMinutes,
    startTime: start.time,
    timezone: detail.timezone,
    title: detail.title,
    visibility: detail.visibility,
    workspaceId: detail.workspaceId,
  };
}

/** `endAt` có thể qua nửa đêm khi giờ kết thúc < giờ bắt đầu — form từ chối ca đó (BE cho tối đa 24 giờ nhưng UI chỉ cùng ngày). */
function bounds(v: MeetingFormValues): { endAt: string; startAt: string } {
  return {
    endAt: zonedTimeToIso(v.date, v.endTime, v.timezone) ?? '',
    startAt: zonedTimeToIso(v.date, v.startTime, v.timezone) ?? '',
  };
}

export function buildCreatePayload(v: MeetingFormValues): CreateMeetingPayload {
  const { endAt, startAt } = bounds(v);
  return {
    agenda: v.agenda || undefined,
    attendeeIds: v.attendeeIds,
    coHostIds: v.coHostIds,
    createChatGroup: v.createChatGroup,
    endAt,
    externalUrl: v.platform === 'INTERNAL' ? undefined : v.externalUrl,
    format: v.format,
    lobbyMode: v.lobbyMode,
    location: v.format === 'ONLINE' ? undefined : v.location || undefined,
    notifyVia: v.notifyVia,
    platform: v.platform,
    recapRequired: v.recapRequired,
    recordingAllowed: v.recordingAllowed,
    reminderMinutes: v.reminderMinutes,
    startAt,
    timezone: v.timezone,
    title: v.title,
    visibility: v.visibility,
  };
}

const same = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Body SỬA: chỉ trường ĐÃ ĐỔI + `expectedVersion`. Không gửi cả bộ: cuộc họp LIVE chỉ cho sửa vài trường (BE trả `MEET_009`
 * nếu chạm giờ bắt đầu/nền tảng) nên gửi trường không đổi là tự gây lỗi.
 */
export function buildUpdatePayload(
  v: MeetingFormValues,
  detail: MeetingDetailDto,
): UpdateMeetingPayload {
  const { endAt, startAt } = bounds(v);
  const payload: UpdateMeetingPayload = { expectedVersion: detail.version };
  if (v.title !== detail.title) payload.title = v.title;
  if (v.agenda !== (detail.agenda ?? '')) payload.agenda = v.agenda;
  if (v.format !== detail.format) payload.format = v.format;
  if (v.location !== (detail.location ?? '')) payload.location = v.location;
  if (v.platform !== detail.platform) payload.platform = v.platform;
  if (v.platform !== 'INTERNAL' && v.externalUrl !== (detail.externalUrl ?? ''))
    payload.externalUrl = v.externalUrl;
  if (Date.parse(startAt) !== Date.parse(detail.startAt)) payload.startAt = startAt;
  if (Date.parse(endAt) !== Date.parse(detail.endAt)) payload.endAt = endAt;
  if (v.timezone !== detail.timezone) payload.timezone = v.timezone;
  if (v.visibility !== detail.visibility) payload.visibility = v.visibility;
  if (v.lobbyMode !== detail.lobbyMode) payload.lobbyMode = v.lobbyMode;
  if (!same(v.reminderMinutes, detail.reminderMinutes)) payload.reminderMinutes = v.reminderMinutes;
  if (v.notifyVia !== detail.notifyVia) payload.notifyVia = v.notifyVia;
  if (v.recapRequired !== detail.recapRequired) payload.recapRequired = v.recapRequired;
  if (v.recordingAllowed !== detail.recordingAllowed) payload.recordingAllowed = v.recordingAllowed;
  return payload;
}
