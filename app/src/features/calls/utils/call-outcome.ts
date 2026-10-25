import type { CallDirection, CallMediaKind, CallOutcome } from '../api/calls.types';

/**
 * Nhãn kết quả cuộc gọi THEO GÓC NHÌN người xem (app.md p2-01 §3) — dùng cho lịch sử và thẻ tóm tắt trong chat.
 * Nguồn: `outcome` của `CallParticipant` (lịch sử) hoặc `status` của tin `CALL_SUMMARY`. ⚠️ BE trả CHỮ HOA
 * (`COMPLETED`/`NO_ANSWER`…) còn README ghi chữ thường — `normalizeOutcome` nhận cả hai.
 */

const KNOWN: ReadonlySet<string> = new Set<CallOutcome>([
  'COMPLETED',
  'MISSED',
  'DECLINED',
  'BUSY',
  'CANCELLED',
  'NO_ANSWER',
  'OUTGOING_UNANSWERED',
]);

/** `null` = cuộc gọi chưa kết thúc (lịch sử) hoặc giá trị lạ (BE thêm trạng thái mới) — nhãn trung tính. */
export function normalizeOutcome(value: unknown): CallOutcome | null {
  if (typeof value !== 'string') return null;
  const upper = value.toUpperCase();
  return KNOWN.has(upper) ? (upper as CallOutcome) : null;
}

/** "5 phút 12 giây" · "45 giây" · "1 giờ 2 phút". Thời lượng không âm; thiếu/0 → "0 giây". */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const seconds = Math.max(0, Math.floor(totalSeconds ?? 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return minutes > 0 ? `${String(hours)} giờ ${String(minutes)} phút` : `${String(hours)} giờ`;
  if (minutes > 0) return rest > 0 ? `${String(minutes)} phút ${String(rest)} giây` : `${String(minutes)} phút`;
  return `${String(rest)} giây`;
}

/** "05:12" · "1:02:05" — đồng hồ đếm khi đang gọi. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${String(hours)}:${mm}:${ss}` : `${mm}:${ss}`;
}

const kindLabel = (mediaKind: CallMediaKind): string =>
  mediaKind === 'VIDEO' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';

export interface OutcomeLabel {
  /** Chữ chính của dòng ("Cuộc gọi nhỡ", "5 phút 12 giây"). */
  text: string;
  /** Có nên vẽ kiểu "nhỡ" (mũi tên đỏ + chữ đỏ) — màu KHÔNG phải tín hiệu duy nhất, `text` luôn nói rõ. */
  missed: boolean;
}

export function outcomeLabel(
  outcome: CallOutcome | null,
  direction: CallDirection,
  mediaKind: CallMediaKind,
  durationSec: number | null,
): OutcomeLabel {
  const outgoing = direction === 'OUTGOING';
  switch (outcome) {
    case 'COMPLETED':
      return { missed: false, text: `${kindLabel(mediaKind)} · ${formatDuration(durationSec)}` };
    case 'NO_ANSWER':
    case 'OUTGOING_UNANSWERED':
      return outgoing ? { missed: false, text: 'Không trả lời' } : { missed: true, text: 'Cuộc gọi nhỡ' };
    case 'CANCELLED':
      return outgoing ? { missed: false, text: 'Đã huỷ' } : { missed: true, text: 'Cuộc gọi nhỡ' };
    case 'DECLINED':
      return { missed: false, text: outgoing ? 'Bị từ chối' : 'Bạn đã từ chối' };
    case 'BUSY':
      return outgoing
        ? { missed: false, text: 'Người nhận đang bận' }
        : { missed: true, text: 'Cuộc gọi nhỡ (bạn đang bận)' };
    case 'MISSED':
      return outgoing
        ? { missed: false, text: 'Cuộc gọi không kết nối được' }
        : { missed: true, text: 'Cuộc gọi nhỡ' };
    default:
      return { missed: false, text: `${kindLabel(mediaKind)} đang diễn ra` };
  }
}
