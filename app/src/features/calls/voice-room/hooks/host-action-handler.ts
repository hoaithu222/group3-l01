import type { QueryClient } from '@tanstack/react-query';

import { getCallMedia } from '@/core/media/call-media.registry';
import { showToast } from '@/shared/utils/toast.utils';

import { callKeys } from '../../api/calls.keys';
import type { CallHostActionPayload } from '../../api/calls.socket.types';
import { teardownCallSession } from '../../hooks/call-session.controller';
import { useCallMediaStore } from '../../store/call-media.store';
import { callStoreApi } from '../../store/call.store';
import { voiceRoomKeys } from '../api/voice-room.keys';
import { useVoiceRoomStore } from '../store/voice-room.store';

/**
 * Xử lý `call:host-action` (app.md §4) — hàm THUẦN (không React) để test bằng cổng media giả. BE phát tới `call:{id}` VÀ `user:{target}`
 * nên cùng một tác động có thể tới HAI lần: khoá dedupe `(callId, version, type, target)`.
 *
 * ⛔ Ba điều KHÔNG được làm: bật mic khi được bỏ chặn (chủ phòng không tự bật mic hộ — người dùng tự bật), tự bật mic khi được mời
 * phát biểu, và xử lý tác động của phòng KHÁC (payload của phòng cũ tới muộn).
 */

const seen = new Set<string>();
const SEEN_MAX = 40;

export function resetHostActionDedupe(): void {
  seen.clear();
}

function firstTime(p: CallHostActionPayload): boolean {
  const key = `${p.callId}:${String(p.version)}:${p.type}:${p.targetUserId ?? ''}`;
  if (seen.has(key)) return false;
  seen.add(key);
  if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value as string);
  return true;
}

export interface HostActionContext {
  meId: string | null;
  queryClient: QueryClient;
}

export function handleHostAction(ctx: HostActionContext, p: CallHostActionPayload): void {
  if (!firstTime(p)) return;
  const state = callStoreApi.get();
  if (state.callId !== p.callId) return;
  const mine = ctx.meId !== null && p.targetUserId === ctx.meId;
  const ui = useVoiceRoomStore.getState();

  switch (p.type) {
    case 'MUTE_REQUEST':
      if (mine) ui.patch({ muteRequestAt: Date.now() });
      break;
    case 'AUDIO_BLOCKED':
      if (!mine) break;
      ui.patch({ audioBlocked: true, inviteSpeakAt: null });
      // Server đã tắt track; đồng bộ nút mic của máy này (SDK trả giá trị THẬT sau khi đổi).
      void getCallMedia()
        .setMicrophoneEnabled(false)
        .then((on) => useCallMediaStore.getState().patch({ micOn: on }))
        .catch(() => undefined);
      break;
    case 'AUDIO_UNBLOCKED':
      if (!mine) break;
      ui.patch({ audioBlocked: false });
      showToast('info', 'Bạn có thể bật mic lại');
      break;
    case 'INVITE_SPEAK':
      if (mine) ui.patch({ audioBlocked: false, inviteSpeakAt: Date.now() });
      break;
    case 'SCREEN_SHARE_ENDED':
      if (mine) showToast('info', 'Chủ phòng đã dừng chia sẻ màn hình của bạn');
      break;
    case 'VIDEO_DISABLED':
      ui.patch({ videoDisabled: true });
      void getCallMedia()
        .setCameraEnabled(false)
        .then((on) => useCallMediaStore.getState().patch({ cameraOn: on }))
        .catch(() => undefined);
      break;
    case 'HOST_CHANGED':
      if (!p.targetUserId) break;
      callStoreApi.dispatch({ callId: p.callId, hostId: p.targetUserId, type: 'HOST_CHANGED', version: p.version });
      void ctx.queryClient.invalidateQueries({ queryKey: callKeys.detail(p.callId) });
      if (mine) showToast('info', 'Bạn là chủ phòng');
      break;
    case 'REMOVED':
      if (!mine) break;
      // Mời ra: dừng media NGAY (không chờ vòng đời màn hình) và báo phiên này không vào lại được.
      callStoreApi.dispatch({ reason: 'REMOVED_BY_HOST', type: 'LOCAL_ENDED' });
      void teardownCallSession().catch(() => undefined);
      void ctx.queryClient.invalidateQueries({ queryKey: voiceRoomKeys.all });
      break;
  }
}
