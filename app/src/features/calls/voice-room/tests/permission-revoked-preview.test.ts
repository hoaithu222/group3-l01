import { QueryClient } from '@tanstack/react-query';

import type { PermissionRevokedPayload } from '@/core/socket';

import { onPermissionRevoked, type CallSocketContext } from '../../hooks/call-socket-handlers';
import { INITIAL_CALL_STATE, type CallSessionState } from '../../store/call-signal.types';
import { voiceRoomKeys } from '../api/voice-room.keys';
import { makePreview, makeRoomCall } from './helpers';

/** `permission:revoked` (app.md §5): preview phòng của kênh/nhóm mất quyền phải biến khỏi cache; đang ở trong phòng đó → `REVOKED`. */
const revoked = (over: Partial<PermissionRevokedPayload>): PermissionRevokedPayload => ({
  cascade: false,
  reason: 'GRANT_REVOKED',
  scopeId: 'ch1',
  scopeType: 'CHANNEL',
  v: 1,
  version: 5,
  ...over,
});

function setup(state: CallSessionState = INITIAL_CALL_STATE) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(voiceRoomKeys.preview('ch1'), makePreview());
  queryClient.setQueryData(voiceRoomKeys.preview('ch2'), makePreview());
  const dispatch = jest.fn();
  const ctx: CallSocketContext = { deviceId: null, dispatch, queryClient, read: () => state, userId: 'me' };
  return { ctx, dispatch, queryClient };
}
const cached = (queryClient: QueryClient, id: string) => queryClient.getQueryData(voiceRoomKeys.preview(id));

describe('onPermissionRevoked — preview phòng thoại', () => {
  it('mất quyền kênh → xoá preview đã cache (tên người trong phòng riêng tư không nằm lại)', () => {
    const { ctx, queryClient } = setup();
    onPermissionRevoked(ctx, revoked({ scopeType: 'CHANNEL' }));
    expect(cached(queryClient, 'ch1')).toBeUndefined();
  });

  it('mất quyền cả nhóm (cascade) → xoá mọi preview của nhóm', () => {
    const { ctx, queryClient } = setup();
    onPermissionRevoked(ctx, revoked({ cascade: true, scopeId: 'ws1', scopeType: 'WORKSPACE' }));
    expect([cached(queryClient, 'ch1'), cached(queryClient, 'ch2')]).toEqual([undefined, undefined]);
  });

  it('phạm vi khác (hội thoại) → giữ preview', () => {
    const { ctx, queryClient } = setup();
    onPermissionRevoked(ctx, revoked({ scopeId: 'conv1', scopeType: 'CONVERSATION' }));
    expect(cached(queryClient, 'ch1')).toBeDefined();
  });

  it('đang ở CHÍNH phòng của kênh đó → thêm tín hiệu REVOKED cho phiên gọi', () => {
    const state: CallSessionState = { ...INITIAL_CALL_STATE, call: makeRoomCall(), callId: 'call1', phase: 'active', version: 1 };
    const { ctx, dispatch } = setup(state);
    onPermissionRevoked(ctx, revoked({ scopeType: 'CHANNEL' }));
    expect(dispatch).toHaveBeenCalledWith({ callId: 'call1', type: 'REVOKED' });
  });

  it('không ở trong phòng nào → không có tín hiệu gọi', () => {
    const { ctx, dispatch } = setup();
    onPermissionRevoked(ctx, revoked({}));
    expect(dispatch).not.toHaveBeenCalled();
  });
});
