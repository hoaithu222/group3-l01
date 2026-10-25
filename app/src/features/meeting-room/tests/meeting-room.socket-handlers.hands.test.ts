import { showToast } from '@/shared/utils/toast.utils';

import { meetingRoomService } from '../api/meeting-room.service';
import type { HostActionPayload } from '../api/meeting-room.types';
import { toggleHand } from '../hooks/meeting-room.hand';
import { connectToRoom } from '../hooks/meeting-room.session';
import { handleHostAction } from '../hooks/meeting-room.socket-handlers';
import type { FakeMeetingMedia } from '../media/meeting-media.fake';
import { meetingRoomApi } from '../store/meeting-room.store';
import { cleanupController, FRESH_TOKEN, installFakeMedia, startSession } from './controller-kit';
import { fakeParticipant, makeSnapshot } from './fixtures';

/**
 * `call:host-action` hạ tay (`LOWER_ALL_HANDS` cả phòng · `HAND_LOWERED` riêng mình) trên phiên ĐÃ nối media: BE đã xoá attribute ⇒ vá store
 * ngay, chỉ báo khi tay MÌNH đang/vừa giơ và người bấm không phải mình; lệnh giơ tay cũ tới muộn không bật lại nút.
 */
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
  openAppSettings: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meeting-room.service', () => ({
  meetingRoomService: { leave: jest.fn(), renewToken: jest.fn(), snapshot: jest.fn() },
}));

const service = jest.mocked(meetingRoomService);
const RAISED_AT = '2026-10-01T09:00:00.000Z';
let media: FakeMeetingMedia;

const me = (handRaisedAt: string | null = null) =>
  fakeParticipant({ handRaisedAt, identity: 'me', isLocal: true });
const other = fakeParticipant({ identity: 'u2' });
const hostAction = (over: Partial<HostActionPayload>) =>
  handleHostAction(
    { byUserId: 'host', callId: 'call1', targetUserId: null, type: 'LOWER_ALL_HANDS', ...over },
    'me',
  );

beforeEach(async () => {
  jest.clearAllMocks();
  service.leave.mockResolvedValue(undefined);
  service.renewToken.mockResolvedValue(FRESH_TOKEN);
  service.snapshot.mockResolvedValue(makeSnapshot());
  media = installFakeMedia();
  startSession();
  await connectToRoom();
  media.setParticipants([me(), other]);
});

afterEach(cleanupController);

describe('call:host-action — hạ tay', () => {
  it('lệnh giơ còn chờ mà chủ trì hạ tay mọi người: hiện đã hạ NGAY + báo; echo giơ tay tới muộn không bật lại; xoá idempotent khép lại', async () => {
    media.holdHandEcho = true;
    await toggleHand();

    hostAction({});
    expect(meetingRoomApi.get().handRaisedAt).toBeNull();
    expect(showToast).toHaveBeenCalledWith('info', 'Chủ trì đã hạ tay của mọi người.');

    // Lệnh giơ của mình tới server SAU lệnh của chủ trì: snapshot mang tay giơ — nút vẫn "đã hạ".
    media.emit({ participants: [me(RAISED_AT), other], type: 'participants' });
    expect(meetingRoomApi.get().handRaisedAt).toBeNull();
    expect(media.handRaisedAt).toBeNull(); // đã gửi lệnh xoá idempotent

    media.echoHand();
    expect(meetingRoomApi.get()).toMatchObject({ handPending: null, handRaisedAt: null });
  });

  it('echo "đã hạ" của LiveKit tới TRƯỚC socket: vẫn báo; không gửi thêm lệnh nào', async () => {
    media.setParticipants([me(RAISED_AT), other]);
    expect(meetingRoomApi.get().handRaisedAt).toBe(RAISED_AT);
    media.setParticipants([me(null), other]); // BE đã xoá attribute — LiveKit báo trước
    const send = jest.spyOn(media, 'setHandRaised');

    hostAction({});
    expect(showToast).toHaveBeenCalledWith('info', 'Chủ trì đã hạ tay của mọi người.');
    expect(send).not.toHaveBeenCalled();
    expect(meetingRoomApi.get().handRaisedAt).toBeNull();
  });

  it('do CHÍNH mình bấm "Hạ tay tất cả": tay mình cũng hạ nhưng không báo thêm (thao tác đã có toast riêng)', () => {
    media.setParticipants([me(RAISED_AT), other]);
    hostAction({ byUserId: 'me' });
    expect(meetingRoomApi.get().handRaisedAt).toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('HAND_LOWERED: chủ trì hạ tay RIÊNG mình → hạ + báo; tín hiệu cho người khác → không đụng tay mình', () => {
    media.setParticipants([me(RAISED_AT), other]);
    hostAction({ targetUserId: 'u2', type: 'HAND_LOWERED' });
    expect(meetingRoomApi.get().handRaisedAt).toBe(RAISED_AT);
    expect(showToast).not.toHaveBeenCalled();

    hostAction({ targetUserId: 'me', type: 'HAND_LOWERED' });
    expect(meetingRoomApi.get().handRaisedAt).toBeNull();
    expect(media.handRaisedAt).toBeNull();
    expect(showToast).toHaveBeenLastCalledWith('info', 'Chủ trì đã hạ tay của bạn.');
  });
});
