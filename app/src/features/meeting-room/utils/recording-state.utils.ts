import type { CallRecordingPayload, RoomRecordingState, RoomRecordingStatus } from '../api/meeting-room.types';
import type { ConsentPrompt, RoomRecording } from '../store/meeting-room.store.types';

/**
 * Hàm THUẦN cho trạng thái ghi hình trong phòng (p2-06 app.md §4.2) — test theo bảng, không React/không store.
 * "Đang ghi" = bản ghi chiếm phòng (`STARTING`/`RECORDING`/`STOPPING`): chỉ báo LUÔN hiện, người chưa đồng ý không phát được.
 */

const ACTIVE: ReadonlySet<RoomRecordingStatus> = new Set<RoomRecordingStatus>(['STARTING', 'RECORDING', 'STOPPING']);

export const isRecordingActive = (rec: Pick<RoomRecordingState, 'status'> | null | undefined): boolean => !!rec && ACTIVE.has(rec.status);

/** Mic/camera bị khoá vì đang ghi mà MÌNH chưa đồng ý (server cũng đã cấp token không có quyền phát). */
export const isConsentLocked = (rec: RoomRecording | null | undefined): boolean => isRecordingActive(rec) && !!rec?.consentRequired;

/**
 * Hộp thoại đồng ý nào cần mở cho trạng thái này: chủ trì vừa hỏi mà mình chưa trả lời → `REQUEST`; đang ghi (chưa dừng) mà mình chưa đồng
 * ý và CHƯA chọn "Chỉ xem và nghe" → `LATE`. Đang dừng thì không hỏi nữa (BE từ chối đồng ý lúc `STOPPING`).
 */
export function consentPromptFor(rec: RoomRecording | RoomRecordingState | null | undefined): ConsentPrompt {
  if (!rec?.consentRequired) return 'NONE';
  if (rec.status === 'CONSENT_REQUESTED') return 'REQUEST';
  if ((rec.status === 'STARTING' || rec.status === 'RECORDING') && !('declined' in rec && rec.declined)) return 'LATE';
  return 'NONE';
}

export const countsOf = (p: Pick<CallRecordingPayload, 'acceptedCount' | 'declinedCount' | 'pendingCount'>): RoomRecording['counts'] =>
  p.acceptedCount === undefined && p.pendingCount === undefined && p.declinedCount === undefined
    ? undefined
    : { accepted: p.acceptedCount ?? 0, declined: p.declinedCount ?? 0, pending: p.pendingCount ?? 0 };

/**
 * Ghép trạng thái SERVER mới (join/ảnh chụp phòng — `consentRequired` chính xác theo người xem) với phần CHỈ CLIENT biết: tiến độ đồng ý của
 * cùng yêu cầu và lựa chọn "Chỉ xem và nghe" của cùng bản ghi. Khác yêu cầu/bản ghi thì bỏ phần cũ.
 */
export function mergeServerRecording(prev: RoomRecording | null, next: RoomRecordingState | null): RoomRecording | null {
  if (!next) return null;
  const sameRequest = !!prev?.requestId && prev.requestId === next.requestId;
  const sameRecording = !!prev?.recordingId && prev.recordingId === next.recordingId;
  return {
    ...next,
    ...(sameRequest && prev?.counts ? { counts: prev.counts } : {}),
    ...(prev?.declined && ((sameRecording && next.consentRequired) || sameRequest) ? { declined: true } : {}),
  };
}
