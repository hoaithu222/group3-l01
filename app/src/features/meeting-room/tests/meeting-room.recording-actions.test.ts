import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { meetingRoomRecordingService } from '../api/meeting-room-recording.service';
import {
  requestRecordingConsent,
  respondRecordingConsent,
  startRecording,
  stopRecording,
} from '../hooks/meeting-room.recording-actions';
import { meetingRoomApi } from '../store/meeting-room.store';

/** Thao tác ghi hình trong phòng (p2-06 be.md §4, app.md §3): hỏi ý kiến, trả lời (theo yêu cầu / người vào sau), bắt đầu, dừng. */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meeting-room-recording.service', () => ({
  meetingRoomRecordingService: { consentStatus: jest.fn(), requestConsent: jest.fn(), respond: jest.fn(), start: jest.fn(), stop: jest.fn() },
}));

const svc = jest.mocked(meetingRoomRecordingService);
const apiError = (status: number, code: string, details?: unknown) =>
  Object.assign(new Error(code), { isAxiosError: true, response: { data: { error: { code, details } }, headers: {}, status } });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  meetingRoomApi.reset();
  meetingRoomApi.patch({ callId: 'call1', meetingId: 'm1', phase: 'IN_ROOM' });
  useAuthStore.setState({ user: { id: 'host' } } as never);
});

it('chủ trì hỏi ý kiến: yêu cầu của CHÍNH MÌNH (không tự hỏi mình) + lấy tiến độ bằng số', async () => {
  svc.requestConsent.mockResolvedValue({ expiresAt: '2026-10-01T09:02:00.000Z', pendingCount: 2, requestId: 'r1' });
  svc.consentStatus.mockResolvedValue({ acceptedCount: 1, connectedCount: 3, declinedCount: 0, expiresAt: '2026-10-01T09:02:00.000Z', pendingCount: 2, ready: false, requestId: 'r1' });
  expect(await requestRecordingConsent()).toBeNull();
  await flush();
  expect(svc.requestConsent).toHaveBeenCalledWith('m1');
  expect(meetingRoomApi.get()).toMatchObject({ consentPrompt: 'NONE', recording: { consentRequired: false, counts: { accepted: 1, declined: 0, pending: 2 }, requestId: 'r1', startedBy: 'host' } });
});

it('trả lời theo yêu cầu gửi ĐÚNG requestId; người vào sau (đang ghi) không gửi requestId và đồng ý thì MỞ khoá phát', async () => {
  meetingRoomApi.patch({ consentPrompt: 'REQUEST', recording: { consentRequired: true, requestId: 'r1', status: 'CONSENT_REQUESTED' } });
  svc.respond.mockResolvedValueOnce({ accepted: false, canPublish: true });
  await respondRecordingConsent(false);
  expect(svc.respond).toHaveBeenLastCalledWith('m1', false, 'r1');
  expect(meetingRoomApi.get()).toMatchObject({ consentPrompt: 'NONE', recording: { consentRequired: false, declined: true } });

  meetingRoomApi.patch({ consentPrompt: 'LATE', publish: { audio: false, screen: false, video: false }, recording: { consentRequired: true, recordingId: 'rec1', status: 'RECORDING' } });
  svc.respond.mockResolvedValueOnce({ accepted: true, canPublish: true });
  await respondRecordingConsent(true);
  expect(svc.respond).toHaveBeenLastCalledWith('m1', true, undefined);
  expect(meetingRoomApi.get()).toMatchObject({ consentPrompt: 'NONE', publish: { audio: true, screen: true, video: true }, recording: { consentRequired: false } });
});

it('RR-09: trả lời yêu cầu đã hết hạn (REC_008) → đóng hộp thoại + "Yêu cầu đã hết hạn."', async () => {
  meetingRoomApi.patch({ consentPrompt: 'REQUEST', recording: { consentRequired: true, requestId: 'r1', status: 'CONSENT_REQUESTED' } });
  svc.respond.mockRejectedValue(apiError(409, 'REC_008'));
  expect(await respondRecordingConsent(true)).toBeNull();
  expect(meetingRoomApi.get()).toMatchObject({ consentPrompt: 'NONE', recording: null });
  expect(showToast).toHaveBeenCalledWith('info', 'Yêu cầu đã hết hạn.');
});

it('RR-07: bắt đầu khi còn người chưa đồng ý → REC_001 nói SỐ người (không tên); đủ → STARTING, đóng tấm; dừng → STOPPING', async () => {
  meetingRoomApi.patch({ recording: { consentRequired: false, requestId: 'r1', startedBy: 'host', status: 'CONSENT_REQUESTED' }, sheet: 'RECORDING' });
  svc.start.mockRejectedValueOnce(apiError(409, 'REC_001', { declinedCount: 0, pendingCount: 1 }));
  expect(await startRecording()).toEqual({ code: 'REC_001', message: 'Chưa bắt đầu ghi được: 1 người chưa trả lời.' });

  svc.start.mockResolvedValueOnce({ id: 'rec1', startedAt: '2026-10-01T09:05:00.000Z', status: 'STARTING' });
  expect(await startRecording()).toBeNull();
  expect(svc.start).toHaveBeenLastCalledWith('m1', 'r1');
  expect(meetingRoomApi.get()).toMatchObject({ recording: { consentRequired: false, recordingId: 'rec1', status: 'STARTING' }, sheet: 'NONE' });

  svc.stop.mockResolvedValue({ id: 'rec1', startedAt: '2026-10-01T09:05:00.000Z', status: 'STOPPING' });
  expect(await stopRecording()).toBeNull();
  expect(svc.stop).toHaveBeenCalledWith('rec1');
  expect(meetingRoomApi.get().recording?.status).toBe('STOPPING');
});

it('REC_003 (hết slot/egress lỗi) → câu "thử lại sau" để tấm hiện', async () => {
  meetingRoomApi.patch({ recording: { consentRequired: false, requestId: 'r1', status: 'CONSENT_REQUESTED' } });
  svc.start.mockRejectedValue(apiError(503, 'REC_003'));
  expect(await startRecording()).toMatchObject({ code: 'REC_003', message: expect.stringContaining('Hãy thử lại') });
});
