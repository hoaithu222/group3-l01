import { isAxiosError } from 'axios';

import {
  dayBoundaryIso,
  formatDate,
  formatNumber,
  formatPercent,
  formatTimeInZone,
  getBrowserTimeZone,
  isValidTimeZone,
} from '@/shared/utils/format';

import {
  MEETING_BASE_PATH,
  MEETING_SORT_SPEC,
  MEETING_STATUS_OPTIONS,
} from '../constants/meeting.constants';
import type {
  AdminMeetingListParams,
  AdminMeetingRow,
  MeetingPlatformValue,
  MeetingSortValue,
  MeetingStatusValue,
} from '../types/meeting.types';
import { parseSort, toSortParam } from './sort.utils';

export const TIME_FORMAT = 'HH:mm DD/MM/YYYY';

/** `BE` chỉ nhận `q` 2–100 ký tự (Zod `.min(2)`): dưới mức đó thì không gửi, tránh 400 khi người dùng mới gõ ký tự đầu. */
const SEARCH_MIN = 2;
const SEARCH_MAX = 100;

const STATUS_ORDER = MEETING_STATUS_OPTIONS.map((o) => o.value);
const PLATFORMS: readonly string[] = ['INTERNAL', 'ZOOM', 'TEAMS', 'GOOGLE_MEET', 'OTHER'];

/** `?status=LIVE,ENDED` → danh sách giá trị HỢP LỆ theo thứ tự cho trước, bỏ trùng và giá trị lạ (URL do người dùng sửa được). */
export function parseCsvValues<T extends string>(value: string, order: readonly T[]): T[] {
  const wanted = new Set(value.split(',').map((s) => s.trim()));
  return order.filter((s) => wanted.has(s));
}

/** `?platform=ZOOM` hợp lệ → dùng; lạ/rỗng → `undefined` (không lọc). */
export function parsePlatform(value: string): MeetingPlatformValue | undefined {
  return PLATFORMS.includes(value) ? (value as MeetingPlatformValue) : undefined;
}

/** Số giây → "45 giây" / "42 phút" / "1 giờ 05 phút"; thiếu/không hợp lệ → `—`. */
export function formatDurationSec(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  if (seconds < 60) return `${Math.floor(seconds)} giây`;
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} phút`;
  return `${hours} giờ ${String(minutes).padStart(2, '0')} phút`;
}

/** Tỉ lệ 0–1 của BE → "72,5%"; `null` (mẫu số 0) → `—`. */
export function formatRate(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? '—' : formatPercent(rate * 100);
}

/** Số đếm → chuỗi vi-VN. */
export const formatCount = (value: number): string => formatNumber(value);

/** Tham số gọi API `GET /admin/meetings` từ giá trị URL (chỉ khoá có giá trị hợp lệ). */
export function toMeetingListParams(input: {
  page: number;
  limit: number;
  q: string;
  workspaceId: string;
  status: string;
  platform: string;
  from: string;
  to: string;
  sort: string;
}): AdminMeetingListParams {
  const q = input.q.trim();
  const statuses = parseCsvValues<MeetingStatusValue>(input.status, STATUS_ORDER);
  const platform = parsePlatform(input.platform);
  const from = dayBoundaryIso(input.from, 'start');
  const to = dayBoundaryIso(input.to, 'end');
  return {
    page: input.page,
    limit: input.limit,
    sort: toSortParam(parseSort(input.sort, MEETING_SORT_SPEC)) as MeetingSortValue,
    ...(q.length >= SEARCH_MIN && { q: q.slice(0, SEARCH_MAX) }),
    ...(input.workspaceId && { workspaceId: input.workspaceId }),
    ...(statuses.length > 0 && { status: statuses.join(',') }),
    ...(platform && { platform }),
    ...(from && { from }),
    ...(to && { to }),
  };
}

/** Chỉ cuộc họp ĐANG DIỄN RA mới kết thúc cưỡng bức được (BE: 409 `MEET_009` với mọi trạng thái khác). */
export const canForceEndMeeting = (status: MeetingStatusValue): boolean => status === 'LIVE';

/**
 * Hai dòng thời gian của một cuộc họp: giờ theo TRÌNH DUYỆT (`HH:mm DD/MM/YYYY – HH:mm`) và, khi múi giờ cuộc họp khác trình duyệt, dòng phụ
 * "giờ <múi giờ> HH:mm – HH:mm" (dùng làm tooltip). Kết thúc khác ngày bắt đầu (theo giờ trình duyệt) → in cả ngày kết thúc.
 */
export function formatMeetingTimes(row: Pick<AdminMeetingRow, 'startAt' | 'endAt' | 'timezone'>): {
  main: string;
  zoned: string | null;
} {
  const sameDay = formatDate(row.startAt, 'DD/MM/YYYY') === formatDate(row.endAt, 'DD/MM/YYYY');
  const end = sameDay ? formatDate(row.endAt, 'HH:mm') : formatDate(row.endAt, TIME_FORMAT);
  const main = `${formatDate(row.startAt, TIME_FORMAT)} – ${end}`;
  // Cuộc họp cũ/lạ có thể mang múi giờ hỏng ⇒ bỏ dòng "giờ theo múi giờ cuộc họp" thay vì ném lỗi khi vẽ bảng.
  const differs = row.timezone !== getBrowserTimeZone() && isValidTimeZone(row.timezone);
  const at = (iso: string) => formatTimeInZone(iso, row.timezone);
  return {
    main,
    zoned: differs ? `giờ ${row.timezone} ${at(row.startAt)} – ${at(row.endAt)}` : null,
  };
}

/** Trạng thái HTTP của một lỗi tải; `undefined` khi không phải phản hồi HTTP (mất mạng, timeout, bị huỷ). */
export function httpStatusOf(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

/** `error.details.<key>` của lỗi BE (vd `details.meetingId` của `ADMIN_MEDIA_002`); không có → `undefined`. */
export function errorDetail(error: unknown, key: string): string | undefined {
  if (!isAxiosError(error)) return undefined;
  const details = (error.response?.data as { error?: { details?: unknown } } | undefined)?.error
    ?.details;
  const value =
    details && typeof details === 'object' ? (details as Record<string, unknown>)[key] : undefined;
  return typeof value === 'string' ? value : undefined;
}

/** Đường dẫn nội bộ trong trang vận hành, vd `meetingOpsPath({ tab: 'meetings', id })` mở ngăn kéo cuộc họp. */
export const meetingOpsPath = (query: Record<string, string>): string =>
  `${MEETING_BASE_PATH}?${new URLSearchParams(query).toString()}`;
