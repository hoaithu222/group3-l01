import { showToast } from '@/shared/utils/toast.utils';

import { meetingRoomService } from '../api/meeting-room.service';
import { HAND_CONFIRM_MS, toggleHand } from '../hooks/meeting-room.hand';
import { connectToRoom } from '../hooks/meeting-room.session';
import type { FakeMeetingMedia } from '../media/meeting-media.fake';
import { meetingRoomApi } from '../store/meeting-room.store';
import { cleanupController, FRESH_TOKEN, installFakeMedia, startSession } from './controller-kit';
import { fakeParticipant, makeSnapshot } from './fixtures';
import { flushMicrotasks } from './hook-wrapper';

/**
 * Giơ tay ⇄ LiveKit (`hooks/meeting-room.hand.ts`): `setAttributes` chỉ đổi attribute cục bộ khi SERVER echo ⇒ snapshot media lúc chờ mang
 * giá trị CŨ. Lỗi cũ: nút nhấp nháy, bấm lần hai gửi giá trị ngược, mạng chậm báo lỗi + hoàn lại dù server vẫn nhận.
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
let media: FakeMeetingMedia;

const me = (handRaisedAt: string | null = null) =>
  fakeParticipant({ handRaisedAt, identity: 'me', isLocal: true });
const other = fakeParticipant({ identity: 'u2' });
/** Snapshot "lặt vặt" (người nói/chất lượng mạng đổi liên tục) — vẫn mang attribute giơ tay CŨ của mình. */
const noise = (mine: string | null): void =>
  media.emit({ participants: [me(mine), { ...other, isSpeaking: true }], type: 'participants' });
const myTile = () => meetingRoomApi.get().participants.find((p) => p.isLocal);

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

describe('giơ tay — chờ LiveKit xác nhận', () => {
  it('snapshot mang attribute CŨ không bật nút ngược lại (nút + ô của mình); echo tới thì hết chờ', async () => {
    media.holdHandEcho = true;
    await toggleHand();
    const at = meetingRoomApi.get().handRaisedAt;
    expect(at).not.toBeNull();

    noise(null);
    expect(meetingRoomApi.get().handRaisedAt).toBe(at);
    expect(myTile()?.handRaisedAt).toBe(at);

    media.echoHand();
    expect(meetingRoomApi.get()).toMatchObject({ handPending: null, handRaisedAt: at });
  });

  it('bấm dồn khi lệnh trước chưa xong: gửi NỐI TIẾP, ý định mới nhất thắng — echo của lệnh trước không "khớp nhầm"', async () => {
    let release: () => void = () => undefined;
    const send = jest.spyOn(media, 'setHandRaised').mockImplementationOnce((at) => {
      media.handRaisedAt = at;
      return new Promise<void>((resolve) => (release = resolve));
    });

    const raise = toggleHand();
    await flushMicrotasks();
    const lower = toggleHand(); // đổi ý ngay khi lệnh giơ còn đang đi
    await flushMicrotasks();
    expect(send).toHaveBeenCalledTimes(1);
    expect(meetingRoomApi.get().handRaisedAt).toBeNull();

    media.echoHand(); // server echo lệnh GIƠ (cũ) — nút vẫn theo ý định mới nhất
    expect(meetingRoomApi.get().handRaisedAt).toBeNull();

    release();
    await raise;
    await lower;
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(null);
    expect(meetingRoomApi.get()).toMatchObject({ handPending: null, handRaisedAt: null });
  });

  it('mạng chậm (LiveKit quá hạn 5 s): KHÔNG hoàn lại, không báo lỗi; echo tới trễ trước hạn thì giữ nguyên', async () => {
    media.holdHandEcho = true;
    await toggleHand();
    await jest.advanceTimersByTimeAsync(5_000);
    noise(null);
    expect(meetingRoomApi.get().handRaisedAt).not.toBeNull();

    media.echoHand();
    await jest.advanceTimersByTimeAsync(HAND_CONFIRM_MS);
    expect(meetingRoomApi.get().handPending).toBeNull();
    expect(meetingRoomApi.get().handRaisedAt).not.toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('tới hạn mà server vẫn chưa nhận: hiện đúng attribute THẬT (tay hạ) và nhắc thử lại', async () => {
    media.holdHandEcho = true;
    await toggleHand();
    await jest.advanceTimersByTimeAsync(HAND_CONFIRM_MS);

    expect(meetingRoomApi.get()).toMatchObject({ handPending: null, handRaisedAt: null });
    expect(myTile()?.handRaisedAt).toBeNull();
    expect(showToast).toHaveBeenCalledWith(
      'warning',
      'Mạng chậm nên chưa giơ tay được. Hãy thử lại.',
    );
  });
});
