import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { meetingRoomRecordingService } from '../api/meeting-room-recording.service';
import { meetingRoomApi } from '../store/meeting-room.store';
import { consentPromptFor } from '../utils/recording-state.utils';
import { recordingFailure, type RecordingFailure } from '../utils/recording-errors';

/**
 * Thao tác ghi hình trong phòng (p2-06 app.md §3): chủ trì hỏi ý kiến → theo dõi tiến độ → bắt đầu → dừng; người tham gia trả lời (theo yêu
 * cầu, hoặc "người vào sau" khi đang ghi). Hàm THUẦN store/service (không React) — trả `RecordingFailure` để tấm/hộp thoại hiện đúng chỗ.
 */

const ALL_PUBLISH = { audio: true, screen: true, video: true } as const;

/** Chủ trì/đồng chủ trì: hỏi ý kiến cả phòng (người hỏi tự đồng ý). Người khác nhận `call:recording CONSENT_REQUESTED` và thấy hộp thoại. */
export async function requestRecordingConsent(): Promise<RecordingFailure | null> {
  const { meetingId } = meetingRoomApi.get();
  if (!meetingId) return null;
  try {
    const req = await meetingRoomRecordingService.requestConsent(meetingId);
    const me = useAuthStore.getState().user?.id;
    meetingRoomApi.patch({
      consentPrompt: 'NONE',
      recording: { consentRequired: false, expiresAt: req.expiresAt, requestId: req.requestId, startedBy: me, status: 'CONSENT_REQUESTED' },
    });
    void refreshConsentStatus();
    return null;
  } catch (error) {
    return recordingFailure(error);
  }
}

/** Tiến độ đồng ý (chỉ số lượng) — lấy khi mở tấm, sau đó `CONSENT_PROGRESS` tự vá. Lỗi (hết hạn…) để im: tấm tự hiện theo trạng thái. */
export async function refreshConsentStatus(): Promise<void> {
  const { meetingId } = meetingRoomApi.get();
  if (!meetingId) return;
  try {
    const status = await meetingRoomRecordingService.consentStatus(meetingId);
    const rec = meetingRoomApi.get().recording;
    if (rec?.status !== 'CONSENT_REQUESTED' || rec.requestId !== status.requestId) return;
    meetingRoomApi.patch({ recording: { ...rec, counts: { accepted: status.acceptedCount, declined: status.declinedCount, pending: status.pendingCount }, expiresAt: status.expiresAt } });
  } catch {
    /* tiến độ là phụ — `CONSENT_PROGRESS` vẫn tới qua socket */
  }
}

/** Người tham gia trả lời. Đồng ý khi ĐANG GHI (người vào sau) → server cấp lại quyền phát: mở khoá mic/camera ngay (người dùng tự bật). */
export async function respondRecordingConsent(accept: boolean): Promise<RecordingFailure | null> {
  const { meetingId, recording: rec } = meetingRoomApi.get();
  if (!meetingId || !rec) return null;
  const late = rec.status !== 'CONSENT_REQUESTED';
  try {
    const res = await meetingRoomRecordingService.respond(meetingId, accept, late ? undefined : rec.requestId);
    // Theo yêu cầu: đã TRẢ LỜI (kể cả từ chối) là hết "cần hỏi" — khớp BE `consentRequired = chưa trả lời`. Người vào sau từ chối: vẫn khoá phát.
    const next = { ...rec, consentRequired: late ? !accept : false, declined: !accept };
    meetingRoomApi.patch({ consentPrompt: 'NONE', recording: next, ...(late && res.canPublish ? { publish: { ...ALL_PUBLISH } } : {}) });
    return null;
  } catch (error) {
    const failure = recordingFailure(error);
    if (failure.code === 'REC_008' || failure.code === 'REC_002') {
      // Hết hạn / đang dừng: không còn gì để trả lời — đóng hộp thoại, báo thoáng qua.
      meetingRoomApi.patch({ consentPrompt: 'NONE', recording: failure.code === 'REC_008' ? null : rec });
      showToast('info', failure.code === 'REC_008' ? 'Yêu cầu đã hết hạn.' : 'Cuộc họp đang dừng ghi hình.');
      return null;
    }
    return failure;
  }
}

/** Chủ trì bấm "Bắt đầu ghi" (bật khi `ready`): mọi người trong phòng phải đã đồng ý — thiếu thì `REC_001` kèm SỐ người. */
export async function startRecording(): Promise<RecordingFailure | null> {
  const { meetingId, recording: rec } = meetingRoomApi.get();
  if (!meetingId || rec?.status !== 'CONSENT_REQUESTED' || !rec.requestId) return null;
  try {
    const started = await meetingRoomRecordingService.start(meetingId, rec.requestId);
    const next = { consentRequired: false, recordingId: started.id, startedAt: started.startedAt, startedBy: rec.startedBy, status: 'STARTING' as const };
    meetingRoomApi.patch({ consentPrompt: consentPromptFor(next), recording: next, sheet: 'NONE' });
    return null;
  } catch (error) {
    return recordingFailure(error);
  }
}

/** "Dừng ghi" — idempotent ở server; chỉ báo chuyển "Đang dừng…" tới khi egress xong (`STOPPED`). */
export async function stopRecording(): Promise<RecordingFailure | null> {
  const rec = meetingRoomApi.get().recording;
  if (!rec?.recordingId) return null;
  try {
    await meetingRoomRecordingService.stop(rec.recordingId);
    const current = meetingRoomApi.get().recording;
    if (current?.recordingId === rec.recordingId && current.status !== 'STOPPING') meetingRoomApi.patch({ recording: { ...current, status: 'STOPPING' } });
    return null;
  } catch (error) {
    return recordingFailure(error);
  }
}
