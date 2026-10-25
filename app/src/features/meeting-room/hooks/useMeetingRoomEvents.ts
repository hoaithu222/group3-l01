import { useEffect } from 'react';

import { onRoomResync, SocketEvent, useSocketEvent, type PermissionRevokedPayload } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import { MeetingRoomEvent } from '../api/meeting-room.socket';
import type {
  CallRecordingPayload,
  ChatMessageCreatedPayload,
  HostActionPayload,
  MeetingEndedPayload,
  MeetingLobbyPayload,
  MeetingStartedPayload,
  MeetingUpdatedPayload,
  ParticipantUpdatedPayload,
} from '../api/meeting-room.types';
import {
  handleCancelled,
  handleChatMessage,
  handleEnded,
  handleHostAction,
  handleLobby,
  handleParticipantUpdated,
  handleResync,
  handleRevoked,
  handleStarted,
  handleUpdated,
} from './meeting-room.socket-handlers';
import { refreshRoomSnapshot } from './meeting-room.media-events';
import { handleCallRecording } from './meeting-room.recording';

/**
 * Nối socket vào `meeting-room.socket-handlers.ts` (app.md §4.3). `enabled = false` (không phải bản chủ của runtime — xem
 * `use-runtime-owner.ts`) thì bỏ mọi sự kiện: hook vẫn gọi đủ (luật hook) nhưng không xử lý lần hai.
 */
export function useMeetingRoomEvents(enabled: boolean): void {
  const meId = useAuthStore((state) => state.user?.id);

  useSocketEvent<MeetingStartedPayload>(MeetingRoomEvent.STARTED, (payload) => {
    if (enabled) handleStarted(payload);
  });
  useSocketEvent<MeetingEndedPayload>(MeetingRoomEvent.ENDED, (payload) => {
    if (enabled) handleEnded(payload);
  });
  useSocketEvent<MeetingLobbyPayload>(MeetingRoomEvent.LOBBY, (payload) => {
    if (enabled) handleLobby(payload, meId);
  });
  useSocketEvent<MeetingUpdatedPayload>(SocketEvent.MEETING_UPDATED, (payload) => {
    if (enabled) handleUpdated(payload);
  });
  useSocketEvent<{ meetingId: string }>(SocketEvent.MEETING_CANCELLED, (payload) => {
    if (enabled) handleCancelled(payload.meetingId);
  });
  useSocketEvent<HostActionPayload>(MeetingRoomEvent.HOST_ACTION, (payload) => {
    if (enabled) handleHostAction(payload, meId);
  });
  useSocketEvent<ParticipantUpdatedPayload>(SocketEvent.CALL_PARTICIPANT_UPDATED, (payload) => {
    if (enabled) handleParticipantUpdated(payload, meId);
  });
  useSocketEvent<PermissionRevokedPayload>(SocketEvent.PERMISSION_REVOKED, (payload) => {
    if (enabled) handleRevoked(payload);
  });
  // p2-06: yêu cầu đồng ý / tiến độ / bắt đầu / dừng ghi hình của phiên này (`call:{callId}`).
  useSocketEvent<CallRecordingPayload>(SocketEvent.CALL_RECORDING, (payload) => {
    if (enabled) handleCallRecording(payload, meId, () => void refreshRoomSnapshot());
  });
  useSocketEvent<ChatMessageCreatedPayload>(SocketEvent.MESSAGE_CREATED, (payload) => {
    if (enabled) handleChatMessage(payload, meId);
  });

  useEffect(() => (enabled ? onRoomResync(handleResync) : undefined), [enabled]);
}
