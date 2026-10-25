import { showToast } from '@/shared/utils/toast.utils';

import { applyServerRecording, expireConsentRequest, handleCallRecording } from '../hooks/meeting-room.recording';
import { meetingRoomApi } from '../store/meeting-room.store';
import { makeJoined } from './fixtures';

/** `call:recording` → store (p2-06 app.md §4.2): hộp thoại đồng ý đúng người, tiến độ chỉ SỐ, chỉ báo theo server, dừng/lỗi mở khoá phát. */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const ME = 'me';
const base = { callId: 'call1', meetingId: 'm1' };
const resync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  meetingRoomApi.reset();
  meetingRoomApi.patch({ callId: 'call1', meetingId: 'm1', phase: 'IN_ROOM' });
});

describe('handleCallRecording', () => {
  it('CONSENT_REQUESTED: người KHÁC chủ trì mở hộp thoại hỏi ý kiến; chính người hỏi thì không; sự kiện của phiên khác bị bỏ', () => {
    handleCallRecording({ ...base, callId: 'call-khac', requestId: 'r1', requestedBy: 'host', state: 'CONSENT_REQUESTED' }, ME, resync);
    expect(meetingRoomApi.get().recording).toBeNull();

    handleCallRecording({ ...base, expiresAt: '2026-10-01T09:02:00.000Z', requestId: 'r1', requestedBy: 'host', state: 'CONSENT_REQUESTED' }, ME, resync);
    expect(meetingRoomApi.get()).toMatchObject({ consentPrompt: 'REQUEST', recording: { consentRequired: true, requestId: 'r1', status: 'CONSENT_REQUESTED' } });

    handleCallRecording({ ...base, requestId: 'r2', requestedBy: ME, state: 'CONSENT_REQUESTED' }, ME, resync);
    expect(meetingRoomApi.get()).toMatchObject({ consentPrompt: 'NONE', recording: { consentRequired: false, requestId: 'r2' } });
  });

  it('CONSENT_PROGRESS chỉ vá SỐ của đúng yêu cầu đang hỏi', () => {
    handleCallRecording({ ...base, requestId: 'r1', requestedBy: ME, state: 'CONSENT_REQUESTED' }, ME, resync);
    handleCallRecording({ ...base, acceptedCount: 3, declinedCount: 1, pendingCount: 2, requestId: 'cu', state: 'CONSENT_PROGRESS' }, ME, resync);
    expect(meetingRoomApi.get().recording?.counts).toBeUndefined();
    handleCallRecording({ ...base, acceptedCount: 3, declinedCount: 1, pendingCount: 2, requestId: 'r1', state: 'CONSENT_PROGRESS' }, ME, resync);
    expect(meetingRoomApi.get().recording?.counts).toEqual({ accepted: 3, declined: 1, pending: 2 });
  });

  it('RECORDING khi mình đã ĐỒNG Ý yêu cầu: chỉ báo bật, không khoá phát, không hỏi lại; người KHÔNG chắc (vào giữa chừng) → hỏi server (resync) + hộp thoại người vào sau', () => {
    meetingRoomApi.patch({ recording: { consentRequired: false, requestId: 'r1', status: 'CONSENT_REQUESTED' } });
    handleCallRecording({ ...base, recordingId: 'rec1', requestedBy: 'host', startedAt: '2026-10-01T09:05:00.000Z', state: 'RECORDING' }, ME, resync);
    expect(meetingRoomApi.get()).toMatchObject({ consentPrompt: 'NONE', recording: { consentRequired: false, recordingId: 'rec1', status: 'RECORDING' } });

    meetingRoomApi.patch({ recording: null });
    handleCallRecording({ ...base, recordingId: 'rec2', requestedBy: 'host', state: 'STARTING' }, ME, resync);
    expect(meetingRoomApi.get()).toMatchObject({ consentPrompt: 'LATE', recording: { consentRequired: true, status: 'STARTING' } });
    expect(resync).toHaveBeenCalled();
  });

  it('STOPPING tắt hộp thoại người vào sau; STOPPED tắt chỉ báo + báo "Bản ghi đang được xử lý" + MỞ LẠI quyền phát cho người bị khoá vì ghi hình', () => {
    meetingRoomApi.patch({ consentPrompt: 'LATE', publish: { audio: false, screen: false, video: false }, recording: { consentRequired: true, recordingId: 'rec1', status: 'RECORDING' } });
    handleCallRecording({ ...base, recordingId: 'rec1', state: 'STOPPING' }, ME, resync);
    expect(meetingRoomApi.get()).toMatchObject({ consentPrompt: 'NONE', recording: { status: 'STOPPING' } });

    handleCallRecording({ ...base, recordingId: 'rec1', state: 'STOPPED' }, ME, resync);
    expect(meetingRoomApi.get()).toMatchObject({ publish: { audio: true, screen: true, video: true }, recording: null });
    expect(showToast).toHaveBeenCalledWith('info', 'Đã dừng ghi hình. Bản ghi đang được xử lý.');
  });

  it('FAILED: tắt chỉ báo + báo lỗi; người đã đồng ý không bị đổi quyền phát', () => {
    meetingRoomApi.patch({ publish: { audio: true, screen: false, video: true }, recording: { consentRequired: false, recordingId: 'rec1', status: 'STARTING' } });
    handleCallRecording({ ...base, recordingId: 'rec1', state: 'FAILED' }, ME, resync);
    expect(meetingRoomApi.get()).toMatchObject({ publish: { audio: true, screen: false, video: true }, recording: null });
    expect(showToast).toHaveBeenCalledWith('info', 'Ghi hình gặp lỗi và đã dừng.');
  });
});

describe('trạng thái từ server (RR-10/RR-19)', () => {
  it('vào phòng khi ĐANG ghi mà chưa đồng ý: chỉ báo + hộp thoại người vào sau ngay từ kết quả `join` (không chờ socket)', () => {
    meetingRoomApi.applyJoined(makeJoined({ publishPermissions: { audio: false, screen: false, video: false }, recording: { consentRequired: true, recordingId: 'rec1', status: 'RECORDING' } }), 0);
    expect(meetingRoomApi.get()).toMatchObject({ consentPrompt: 'LATE', publish: { audio: false }, recording: { status: 'RECORDING' } });
  });

  it('ảnh chụp phòng sau reconnect giữ lựa chọn "Chỉ xem và nghe" của CÙNG bản ghi (không hỏi lại); bản ghi đã hết thì tắt chỉ báo', () => {
    meetingRoomApi.patch({ recording: { consentRequired: true, declined: true, recordingId: 'rec1', status: 'RECORDING' } });
    applyServerRecording({ consentRequired: true, recordingId: 'rec1', status: 'RECORDING' });
    expect(meetingRoomApi.get()).toMatchObject({ consentPrompt: 'NONE', recording: { declined: true } });
    applyServerRecording(null);
    expect(meetingRoomApi.get().recording).toBeNull();
  });

  it('yêu cầu đồng ý hết hạn chỉ dọn ĐÚNG yêu cầu đó', () => {
    meetingRoomApi.patch({ consentPrompt: 'REQUEST', recording: { consentRequired: true, requestId: 'r2', status: 'CONSENT_REQUESTED' } });
    expireConsentRequest('r1');
    expect(meetingRoomApi.get().recording?.requestId).toBe('r2');
    expireConsentRequest('r2');
    expect(meetingRoomApi.get()).toMatchObject({ consentPrompt: 'NONE', recording: null });
  });
});
