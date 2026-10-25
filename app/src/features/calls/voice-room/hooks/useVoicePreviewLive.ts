import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { SocketEvent, useRoomSubscription, useSocketEvent } from '@/core/socket';

import type { CallEndedPayload, CallParticipantPublicPayload, CallParticipantUpdatedPayload } from '../../api/calls.socket.types';
import { voiceRoomKeys } from '../api/voice-room.keys';
import type { VoicePreview } from '../api/voice-room.types';
import { applyCallEnded, applyParticipantUpdate, isPublicParticipantPayload } from '../utils/voice-preview-patch';

/** Chờ ngắn sau mỗi lần vá rồi hỏi lại server: chốt thứ tự vào/ra và người đang `JOINING` (chiếm chỗ nhưng chưa hiện). */
const RECONCILE_DELAY_MS = 1500;

/**
 * Preview "sống" (app.md §4): vào room `ch:{id}` khi màn đang mở (refcount chung — layout kênh cũng giữ room này), vá `participants`/
 * `seatsLeft` theo `call:participant-updated` bản công khai, xoá phòng khi `call:ended`. Bản đầy đủ của cùng sự kiện (room `call:{id}`,
 * có `role`) là của phiên của CHÍNH MÌNH — bỏ qua ở đây.
 */
export function useVoicePreviewLive(channelId: string): void {
  const queryClient = useQueryClient();
  useRoomSubscription('ch', channelId);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = voiceRoomKeys.preview(channelId);

  const reconcileSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void queryClient.invalidateQueries({ queryKey: key }), RECONCILE_DELAY_MS);
  }, [queryClient, key]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useSocketEvent<CallParticipantPublicPayload | CallParticipantUpdatedPayload>(SocketEvent.CALL_PARTICIPANT_UPDATED, (payload) => {
    if (!isPublicParticipantPayload(payload)) return; // bản đầy đủ của phiên mình đang ở — không phải bản công khai của kênh
    const current = queryClient.getQueryData<VoicePreview>(key);
    if (!current) return;
    const next = applyParticipantUpdate(current, payload);
    if (next) queryClient.setQueryData<VoicePreview>(key, next);
    reconcileSoon();
  });

  useSocketEvent<CallEndedPayload>(SocketEvent.CALL_ENDED, (payload) => {
    const current = queryClient.getQueryData<VoicePreview>(key);
    if (!current?.call || current.call.id !== payload.callId) return;
    queryClient.setQueryData<VoicePreview>(key, applyCallEnded(current, payload));
    reconcileSoon(); // lý do kết thúc (lưu trữ kênh…) đổi `myActions` — hỏi lại server
  });
}
