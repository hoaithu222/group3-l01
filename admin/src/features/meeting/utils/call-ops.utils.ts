import { addDays, dayBoundaryIso, endOfDay, startOfDay, toISOString } from '@/shared/utils/format';

import {
  CALL_END_REASON_OPTIONS,
  CALL_SORT_SPEC,
  CALL_STATUS_OPTIONS,
} from '../constants/call.constants';
import type {
  AdminCallListParams,
  AdminCallRow,
  CallMediaKindValue,
  CallModeValue,
  CallScopeTypeValue,
  CallSortValue,
  CallStatsParams,
} from '../types/call.types';
import { parseCsvValues } from './meeting-ops.utils';
import { parseSort, toSortParam } from './sort.utils';

const STATUS_ORDER = CALL_STATUS_OPTIONS.map((o) => o.value);
const END_REASON_ORDER = CALL_END_REASON_OPTIONS.map((o) => o.value);
const SCOPES: readonly string[] = ['CONVERSATION', 'CHANNEL', 'MEETING'];
const MODES: readonly string[] = ['RING', 'ROOM'];
const MEDIA_KINDS: readonly string[] = ['AUDIO', 'VIDEO'];

const pick = <T extends string>(value: string, allowed: readonly string[]): T | undefined =>
  allowed.includes(value) ? (value as T) : undefined;

/**
 * Tham số gọi API `GET /admin/calls` từ giá trị URL (chỉ khoá có giá trị hợp lệ). `meetingId` chỉ đi với `scopeType=MEETING` (BE trả 400 nếu
 * kèm phạm vi khác), nên có `meetingId` thì phạm vi bị ép về `MEETING`. KHÔNG có bộ lọc theo người (OPC-05).
 */
export function toCallListParams(input: {
  page: number;
  limit: number;
  workspaceId: string;
  meetingId: string;
  scopeType: string;
  mode: string;
  mediaKind: string;
  status: string;
  endReason: string;
  from: string;
  to: string;
  sort: string;
}): AdminCallListParams {
  const scopeType = input.meetingId ? 'MEETING' : pick<CallScopeTypeValue>(input.scopeType, SCOPES);
  const mode = pick<CallModeValue>(input.mode, MODES);
  const mediaKind = pick<CallMediaKindValue>(input.mediaKind, MEDIA_KINDS);
  const statuses = parseCsvValues(input.status, STATUS_ORDER);
  const endReasons = parseCsvValues(input.endReason, END_REASON_ORDER);
  const from = dayBoundaryIso(input.from, 'start');
  const to = dayBoundaryIso(input.to, 'end');
  return {
    page: input.page,
    limit: input.limit,
    sort: toSortParam(parseSort(input.sort, CALL_SORT_SPEC)) as CallSortValue,
    ...(input.workspaceId && { workspaceId: input.workspaceId }),
    ...(input.meetingId && { meetingId: input.meetingId }),
    ...(scopeType && { scopeType }),
    ...(mode && { mode }),
    ...(mediaKind && { mediaKind }),
    ...(statuses.length > 0 && { status: statuses.join(',') }),
    ...(endReasons.length > 0 && { endReason: endReasons.join(',') }),
    ...(from && { from }),
    ...(to && { to }),
  };
}

/**
 * Kết thúc cưỡng bức được khi cuộc gọi CHƯA kết thúc và KHÔNG thuộc một cuộc họp (cuộc gọi của cuộc họp phải kết thúc qua cuộc họp — BE trả 409
 * `ADMIN_MEDIA_002`).
 */
export const canForceEndCall = (row: Pick<AdminCallRow, 'status' | 'scopeType'>): boolean =>
  row.status !== 'ENDED' && row.scopeType !== 'MEETING';

/**
 * Khoảng thống kê "`days` ngày gần nhất": từ 00:00 của ngày đầu tới hết hôm nay (theo giờ trình duyệt). Cắt về ngày (không dùng thời điểm hiện tại chính xác)
 * nên cùng một ngày mọi lần gọi cho ra cùng khoá cache. KHÔNG gửi `tz`: BE gom ngày theo múi giờ mặc định `Asia/Ho_Chi_Minh` (tên múi giờ của trình duyệt có
 * thể là bí danh cũ mà MongoDB không nhận, vd `Asia/Saigon`). Tối đa `days` ngày ≤ 92 (BE từ chối hơn thế bằng `ADMIN_MEDIA_001`).
 */
export function statsRangeFor(days: number, now: Date, workspaceId?: string): CallStatsParams {
  return {
    from: toISOString(startOfDay(addDays(now, -(days - 1)))),
    to: toISOString(endOfDay(now)),
    ...(workspaceId && { workspaceId }),
  };
}
