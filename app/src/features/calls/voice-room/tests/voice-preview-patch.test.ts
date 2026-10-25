import { voiceActivityLabel, voiceActivityOf } from '@/shared/calls';

import type { CallEndedPayload, CallParticipantPublicPayload, CallParticipantUpdatedPayload } from '../../api/calls.socket.types';
import { applyCallEnded, applyParticipantUpdate, isPublicParticipantPayload } from '../utils/voice-preview-patch';
import { makePreview, makePreviewParticipant } from './helpers';

const base = { serverNow: '2026-09-25T10:00:00.000Z', v: 1 as const };
const inRoom = () =>
  makePreview({
    call: { hostId: 'host', id: 'call1', startedAt: '2026-09-25T10:00:00.000Z', version: 2 },
    participants: [makePreviewParticipant({ isHost: true, userId: 'host' })],
    seatsLeft: 7,
  });

type PublicParticipant = CallParticipantPublicPayload['participant'];

/** Bản CÔNG KHAI tới `ch:{id}` đúng như BE dựng: `micEnabled/cameraEnabled`, KHÔNG có `role`/`mutedByHost`. */
function update(participant: Partial<PublicParticipant> = {}, over: Partial<Omit<CallParticipantPublicPayload, 'participant'>> = {}): CallParticipantPublicPayload {
  return {
    ...base,
    callId: 'call1',
    count: 2,
    version: 2,
    ...over,
    participant: {
      avatarUrl: null,
      cameraEnabled: true,
      handRaisedAt: null,
      isHost: false,
      micEnabled: true,
      name: 'Lan',
      sharingScreen: false,
      state: 'CONNECTED',
      userId: 'lan',
      ...participant,
    },
  };
}

describe('applyParticipantUpdate (bản công khai `call:participant-updated` của kênh)', () => {
  it('người vào (CONNECTED) → thêm vào danh sách với tên/avatar/quyền mic, cập nhật số chỗ', () => {
    const next = applyParticipantUpdate(inRoom(), update({ avatarUrl: 'u', micEnabled: false }));
    expect(next?.participants.map((p) => p.userId)).toEqual(['host', 'lan']);
    expect(next?.participants[1]).toMatchObject({ avatarUrl: 'u', micEnabled: false, name: 'Lan' }); // quyền mic lấy từ payload, không mặc định true
    expect(next?.seatsLeft).toBe(6);
  });

  it('người rời/bị mời ra (LEFT/REMOVED) → bỏ khỏi danh sách; người đang vào (JOINING) chưa hiện', () => {
    const start = applyParticipantUpdate(inRoom(), update()) ?? inRoom();
    const left = applyParticipantUpdate(start, update({ state: 'LEFT' }, { count: 1 }));
    expect(left?.participants.map((p) => p.userId)).toEqual(['host']);
    expect(left?.seatsLeft).toBe(7);
    const joining = applyParticipantUpdate(inRoom(), update({ name: 'Bảo', state: 'JOINING', userId: 'bao' }));
    expect(joining?.participants.map((p) => p.userId)).toEqual(['host']);
  });

  it('cập nhật (giơ tay, chặn mic) vá TẠI CHỖ — không đẩy người đó xuống cuối danh sách', () => {
    let state = inRoom();
    for (const [userId, name] of [['lan', 'Lan'], ['bao', 'Bảo']] as const) state = applyParticipantUpdate(state, update({ name, userId })) ?? state;
    expect(state.participants.map((p) => p.userId)).toEqual(['host', 'lan', 'bao']);

    const raised = applyParticipantUpdate(state, update({ handRaisedAt: '2026-09-25T10:01:00.000Z', micEnabled: false }, { count: 3 }));
    expect(raised?.participants.map((p) => p.userId)).toEqual(['host', 'lan', 'bao']);
    expect(raised?.participants[1]).toMatchObject({ handRaisedAt: '2026-09-25T10:01:00.000Z', micEnabled: false });
  });

  it('chỉ có MỘT chủ phòng: người mới được báo là chủ phòng thì chủ cũ (không được báo riêng) hết là chủ phòng', () => {
    const start = applyParticipantUpdate(inRoom(), update()) ?? inRoom();
    const hosted = applyParticipantUpdate(start, update({ isHost: true }));
    expect(hosted?.call?.hostId).toBe('lan');
    expect(hosted?.participants.map((p) => [p.userId, p.isHost])).toEqual([['host', false], ['lan', true]]);
  });

  it('bỏ sự kiện của version CŨ hơn phiên trong cache; không vá được (chưa có phiên / phiên khác) → null để làm mới từ server', () => {
    const cur = inRoom();
    expect(applyParticipantUpdate(cur, update({}, { version: 1 }))).toBe(cur);
    expect(applyParticipantUpdate(makePreview(), update())).toBeNull();
    expect(applyParticipantUpdate(cur, update({}, { callId: 'call-khac' }))).toBeNull();
  });
});

describe('isPublicParticipantPayload', () => {
  it('bản công khai (không `role`) ≠ bản đầy đủ của phiên mình đang ở (có `role`)', () => {
    const full: CallParticipantUpdatedPayload = {
      ...base,
      callId: 'call1',
      participant: { handRaisedAt: null, mutedByHost: false, role: 'MEMBER', state: 'CONNECTED', userId: 'lan' },
      version: 2,
    };
    expect(isPublicParticipantPayload(update())).toBe(true);
    expect(isPublicParticipantPayload(full)).toBe(false);
  });
});

describe('applyCallEnded', () => {
  const ended = (callId: string): CallEndedPayload => ({ ...base, callId, durationSec: 60, endReason: 'HOST_ENDED', version: 3 });

  it('phòng đang xem kết thúc → call null, không còn ai, đủ chỗ', () => {
    expect(applyCallEnded(inRoom(), ended('call1'))).toMatchObject({ call: null, participants: [], seatsLeft: 8 });
  });

  it('phiên khác → giữ nguyên', () => {
    const cur = inRoom();
    expect(applyCallEnded(cur, ended('khac'))).toBe(cur);
  });
});

describe('voiceActivityOf (badge danh sách kênh)', () => {
  it('phòng có người → { callId, count }; phòng kết thúc (callId null) hoặc 0 người → không badge', () => {
    expect(voiceActivityOf({ callId: 'c1', count: 3 })).toEqual({ callId: 'c1', count: 3 });
    expect(voiceActivityOf({ callId: null, count: 0 })).toBeUndefined();
    expect(voiceActivityOf({ callId: 'c1', count: 0 })).toBeUndefined();
    expect(voiceActivityLabel(3)).toBe('3 người đang trong phòng');
  });
});
