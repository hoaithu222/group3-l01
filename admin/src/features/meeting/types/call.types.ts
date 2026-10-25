/**
 * Kiểu dữ liệu tab "Cuộc gọi" (p2-07) — khớp `AdminCallRow` / `AdminCallDetail` / `CallStats` và query của `GET /admin/calls(/:id|/stats)`
 * phía BE (`be/src/modules/admin-media-ops/entities/admin-media.types.ts`, `dtos/admin-call.dto.ts`, `dtos/admin-media-stats.dto.ts`).
 *
 * Quyền riêng tư (OPC-05): BE che nhãn cuộc gọi (`label`: "Cuộc gọi 1-1" / "Nhóm chat" / "Kênh riêng tư"), KHÔNG trả người tham gia hay id hội
 * thoại và KHÔNG nhận bộ lọc theo người. Đừng thêm các trường/tham số đó vào đây.
 */
export type CallScopeTypeValue = 'CONVERSATION' | 'CHANNEL' | 'MEETING';
export type CallModeValue = 'RING' | 'ROOM';
export type CallMediaKindValue = 'AUDIO' | 'VIDEO';
export type CallStatusValue = 'RINGING' | 'ACTIVE' | 'ENDED';
export type CallEndReasonValue =
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_ANSWER'
  | 'DECLINED'
  | 'BUSY'
  | 'FAILED'
  | 'REVOKED'
  | 'ARCHIVED'
  | 'HOST_ENDED'
  | 'FORCE_ENDED'
  | 'EMPTY'
  | 'MAX_DURATION';

/** Khoá sắp xếp BE nhận (`-` = giảm dần). */
export type CallSortValue = '-startedAt' | 'startedAt' | '-durationSec' | '-peakParticipants';

export interface AdminCallRow {
  id: string;
  /** Nhãn ĐÃ CHE ở BE — in nguyên văn, không tự dựng lại từ scope. */
  label: string;
  scopeType: CallScopeTypeValue;
  mode: CallModeValue;
  mediaKind: CallMediaKindValue;
  status: CallStatusValue;
  endReason?: CallEndReasonValue;
  workspace?: { id: string; name: string | null };
  startedAt: string;
  endedAt?: string;
  durationSec?: number;
  peakParticipants: number;
  invitedCount: number;
  /** Chỉ có với `scopeType = MEETING`. */
  meeting?: { id: string; code: string; title: string };
  /** Chỉ có với kênh CÔNG KHAI. */
  channel?: { id: string; name: string };
}

export interface AdminCallDetail extends AdminCallRow {
  /** Chỉ SỐ ĐẾM theo trạng thái người tham gia — không danh tính. */
  participantStats: {
    invited: number;
    answered: number;
    connected: number;
    missed: number;
    declined: number;
    busy: number;
    removed: number;
  };
  /** Số lần kết nối và số lần kết nối ≤ 20 giây kể từ lúc vào. */
  setup: { attempts: number; successWithin20s: number };
  /** Phòng LiveKit còn mở (chỉ có khi cuộc gọi chưa kết thúc và đọc được LiveKit). */
  roomActive?: boolean;
}

/** `GET /admin/calls` — `status`/`endReason` là CSV; `meetingId` chỉ đi với `scopeType=MEETING`; `from`/`to` lọc theo giờ BẮT ĐẦU. */
export interface AdminCallListParams {
  page: number;
  limit: number;
  workspaceId?: string;
  meetingId?: string;
  scopeType?: CallScopeTypeValue;
  mode?: CallModeValue;
  mediaKind?: CallMediaKindValue;
  status?: string;
  endReason?: string;
  from?: string;
  to?: string;
  sort: CallSortValue;
}

export interface CallStatsTotals {
  calls: number;
  ringCalls: number;
  roomCalls: number;
  minutes: number;
  /** Tỉ lệ 0–1; `null` khi mẫu số bằng 0 (hiện "—"). */
  answerRate: number | null;
  setupSuccessRate: number | null;
  avgDurationSec: number | null;
}

export interface CallStatsDay {
  /** `YYYY-MM-DD` theo múi giờ của thống kê. */
  date: string;
  calls: number;
  minutes: number;
  answerRate: number | null;
  setupSuccessRate: number | null;
  avgDurationSec: number | null;
}

export interface CallStats {
  range: { from: string; to: string; tz: string };
  serverNow: string;
  totals: CallStatsTotals;
  byDay: CallStatsDay[];
  /** Đã sắp theo số lượng giảm dần. */
  byEndReason: Array<{ reason: CallEndReasonValue; count: number }>;
}

/** `GET /admin/calls/stats` — `from`/`to` BẮT BUỘC, `to > from`, tối đa 92 ngày (sai → 400 `ADMIN_MEDIA_001`). `tz` bỏ trống = Asia/Ho_Chi_Minh. */
export interface CallStatsParams {
  from: string;
  to: string;
  tz?: string;
  workspaceId?: string;
}
