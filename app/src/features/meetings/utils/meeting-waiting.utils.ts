import dayjs from 'dayjs';

import type { MeetingDetailDto } from '../api/meetings.types';
import { countdownText } from './meeting-time.utils';

/** "00:14:22" — thời gian đã diễn ra của cuộc họp LIVE. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export interface WaitingStatus {
  /** Dòng chính: "Bắt đầu sau 12 phút" · "Đã tới giờ họp" · "Đang diễn ra 00:14:22". */
  headline: string;
  /** Dòng phụ về PHÒNG CHỜ (chỉ họp nội bộ): khi nào mở / đã mở / đang chờ chủ trì. */
  hint?: string;
}

/**
 * Trạng thái "phòng chờ" trước giờ họp (app.md p2-04 §3 `MeetingTimeHero`, §7): đếm ngược tới `startAt`, phòng chờ mở lúc
 * `joinOpensAt`. `nowMs` là GIỜ SERVER. ENDED/CANCELLED ⇒ `null` (không có gì để chờ). Họp ngoài (Zoom/Teams…) không có phòng chờ
 * nội bộ nên không có `hint`. Hàm thuần để test theo mốc thời gian, không cần đồng hồ giả.
 */
export function waitingStatus(meeting: MeetingDetailDto, nowMs: number): WaitingStatus | null {
  const startMs = Date.parse(meeting.startAt);
  if (meeting.status === 'LIVE') {
    const since = meeting.startedAt ? Date.parse(meeting.startedAt) : startMs;
    return { headline: `Đang diễn ra ${formatElapsed(nowMs - since)}` };
  }
  if (meeting.status !== 'SCHEDULED') return null;

  const internal = meeting.platform === 'INTERNAL';
  const opensMs = Date.parse(meeting.joinOpensAt);
  if (nowMs >= startMs) {
    return {
      headline: 'Đã tới giờ họp',
      hint: internal ? 'Đang chờ chủ trì bắt đầu cuộc họp.' : undefined,
    };
  }
  const headline = `Bắt đầu sau ${countdownText(startMs - nowMs)}`;
  if (!internal) return { headline };
  if (nowMs >= opensMs)
    return { headline, hint: 'Phòng chờ đã mở — bạn có thể vào trước giờ họp.' };
  const opensAt = dayjs(opensMs).format('HH:mm');
  return {
    headline,
    hint: `Phòng chờ mở lúc ${opensAt} (${String(meeting.joinWindowMinutes)} phút trước giờ họp).`,
  };
}
