import { queryClient } from '@/core/config/query-client';
import type { PermissionRevokedPayload } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';

import { meetingRoomKeys, MEETINGS_DETAIL_KEY, MEETINGS_RANGES_KEY } from '../api/meeting-room.keys';
import type {
  ChatMessageCreatedPayload,
  HostActionPayload,
  MeetingEndedPayload,
  MeetingLobbyPayload,
  MeetingStartedPayload,
  MeetingUpdatedPayload,
  ParticipantUpdatedPayload,
  RoomRole,
  RoomSnapshot,
} from '../api/meeting-room.types';
import { getMeetingMedia } from '../media/meeting-media.registry';
import { meetingRoomApi, type MeetingRoomState } from '../store/meeting-room.store';
import { refreshBrief } from './meeting-room.brief';
import { applyHostHandAction } from './meeting-room.hand';
import { requestRejoin } from './meeting-room.join';
import { refreshRoomSnapshot } from './meeting-room.media-events';
import { goBlocked, goEnded, goRemoved, isInRoomPhase, isTerminalPhase } from './meeting-room.teardown';

/**
 * Sự kiện socket → store/cache (app.md §4.3). Hàm THUẦN (không React) để test bằng cách gọi thẳng, và để chạy được khi màn phòng đã
 * thu nhỏ (`useMeetingRoomEvents` chỉ nối `useSocketEvent` vào đây). Sự kiện của cuộc họp/phòng KHÁC luôn bị bỏ.
 */

const toRole = (role: string | undefined): RoomRole => (role === 'HOST' ? 'HOST' : role === 'CO_HOST' ? 'CO_HOST' : 'MEMBER');
const isMine = (meetingId: string): boolean => meetingRoomApi.get().meetingId === meetingId;
const invalidate = (queryKey: readonly unknown[]): void => void queryClient.invalidateQueries({ queryKey });

const MUTED_FALLBACK = 'Chủ trì đã tắt mic của bạn.';
const MUTED_COPY: Record<string, string> = {
  CAMERA: 'Chủ trì đã tắt camera của bạn.',
  MICROPHONE: MUTED_FALLBACK,
  SCREEN_SHARE: 'Chủ trì đã dừng chia sẻ màn hình của bạn.',
};

/** Chủ trì bắt đầu: làm mới chi tiết (nút chính theo `myActions`), và người đang chờ gọi `join` lại. */
export function handleStarted(payload: MeetingStartedPayload): void {
  if (!isMine(payload.meetingId)) return;
  invalidate(meetingRoomKeys.brief(payload.meetingId));
  invalidate(MEETINGS_DETAIL_KEY(payload.meetingId));
  if (meetingRoomApi.get().phase === 'WAITING_FOR_HOST') requestRejoin();
}

/** Kết thúc cho mọi người: đang ở/nối phòng → màn "đã kết thúc"; chưa vào phòng → "không còn diễn ra". */
export function handleEnded(payload: MeetingEndedPayload): void {
  if (!isMine(payload.meetingId)) return;
  // Chi tiết + thẻ trên lịch còn "Đang diễn ra"/nút "Vào" nếu không làm mới (BE không phát `meeting:updated` khi kết thúc).
  [MEETINGS_DETAIL_KEY(payload.meetingId), MEETINGS_RANGES_KEY].forEach(invalidate);
  const { phase } = meetingRoomApi.get();
  if (isInRoomPhase(phase) || phase === 'ENDED') void goEnded(payload.reason, payload.durationSec > 0 ? payload.durationSec : null);
  else if (!isTerminalPhase(phase)) void goBlocked('MEET_009');
}

/** `ADMITTED`/`DENIED` tới NGƯỜI XIN VÀO; `REQUESTED`/`CANCELLED` tới chủ trì + đồng chủ trì (server đã lọc — client chỉ cập nhật hàng chờ). */
export function handleLobby(payload: MeetingLobbyPayload, meId: string | undefined): void {
  const state = meetingRoomApi.get();
  if (state.meetingId !== payload.meetingId) return;
  if (payload.userId === meId) {
    if (state.phase !== 'IN_LOBBY') return;
    if (payload.state === 'ADMITTED') requestRejoin();
    else if (payload.state === 'DENIED') void goBlocked('DENIED');
    return;
  }
  if (payload.state === 'CANCELLED') {
    meetingRoomApi.patch({ lobby: state.lobby.filter((entry) => entry.userId !== payload.userId) });
  } else if (payload.state === 'REQUESTED' && !state.lobby.some((entry) => entry.userId === payload.userId)) {
    const name = payload.displayName ?? 'Người tham gia';
    const requestedAt = new Date(Date.now() + state.serverOffsetMs).toISOString();
    meetingRoomApi.patch({ lobby: [...state.lobby, { displayName: name, requestedAt, userId: payload.userId }] });
    if (isInRoomPhase(state.phase)) showToast('info', payload.lobbyCount > 1 ? `${payload.lobbyCount} người đang chờ vào cuộc họp` : `${name} đang chờ vào cuộc họp`);
  }
}

/** Khoá phòng/cảnh báo sắp đóng mang `lockedAt`/`closingAt`; đổi lịch chỉ có `changedFields` → làm mới chi tiết. */
export function handleUpdated(payload: MeetingUpdatedPayload): void {
  if (!isMine(payload.meetingId)) return;
  const next: Partial<MeetingRoomState> = {};
  if (payload.lockedAt !== undefined) next.lockedAt = payload.lockedAt;
  if (payload.closingAt !== undefined) next.closingAt = payload.closingAt;
  meetingRoomApi.patch(next);
  if (payload.changedFields?.some((field) => field !== 'lockedAt' && field !== 'closingAt')) invalidate(meetingRoomKeys.brief(payload.meetingId));
}

export function handleCancelled(meetingId: string): void {
  if (isMine(meetingId) && !isInRoomPhase(meetingRoomApi.get().phase) && !isTerminalPhase(meetingRoomApi.get().phase)) void goBlocked('MEET_009');
}

/** `call:host-action` (app.md §4.3). Loại của p2-03 (`INVITE_SPEAK`, `HOST_CHANGED`…) đi cùng sự kiện — bỏ qua; hạ tay: `applyHostHandAction`. */
export function handleHostAction(payload: HostActionPayload, meId: string | undefined): void {
  const state = meetingRoomApi.get();
  if (!meId || payload.callId !== state.callId || applyHostHandAction(payload, meId)) return;
  const mine = payload.targetUserId === meId;
  if (payload.type === 'MUTED' && (mine || payload.all === true) && payload.byUserId !== meId) {
    showToast('info', payload.all ? 'Chủ trì đã tắt mic của mọi người.' : (MUTED_COPY[payload.source ?? ''] ?? MUTED_FALLBACK));
  } else if (payload.type === 'REMOVED' && mine) {
    void goRemoved();
  } else if (payload.type === 'ROLE_CHANGED') {
    void refreshRoomSnapshot();
    if (!mine) return;
    const role = toRole(payload.role);
    meetingRoomApi.patch({ role });
    showToast('info', role === 'CO_HOST' ? 'Bạn là đồng chủ trì của cuộc họp.' : 'Bạn không còn là đồng chủ trì.');
  } else if (payload.type === 'SCREEN_SHARE_REJECTED' && mine) {
    void getMeetingMedia().setScreenShareEnabled?.(false).catch(() => undefined);
    showToast('warning', 'Đang có người khác chia sẻ màn hình nên bạn chưa chia sẻ được.');
  }
}

/** Vai trò/giơ tay/`mutedByHost` của một người: vá ảnh chụp phòng tại chỗ (người MỚI vào thì tải lại — chưa có tên). */
export function handleParticipantUpdated(payload: ParticipantUpdatedPayload, meId: string | undefined): void {
  const state = meetingRoomApi.get();
  if (!state.meetingId || payload.callId !== state.callId) return;
  const key = meetingRoomKeys.room(state.meetingId);
  const cached = queryClient.getQueryData<RoomSnapshot>(key);
  const incoming = payload.participant;
  if (cached?.participants.some((p) => p.userId === incoming.userId)) {
    queryClient.setQueryData<RoomSnapshot>(key, { ...cached, participants: cached.participants.map((p) => (p.userId === incoming.userId ? { ...p, ...incoming } : p)) });
  } else if (cached) invalidate(key);
  if (incoming.userId === meId && toRole(incoming.role) !== state.role) meetingRoomApi.patch({ role: toRole(incoming.role) });
}

/** Mất quyền với cuộc họp/cuộc gọi của phòng này (bị xoá khỏi nhóm, cuộc họp bị xoá…) → "không còn khả dụng". */
export function handleRevoked(payload: PermissionRevokedPayload): void {
  const { callId, meetingId } = meetingRoomApi.get();
  const mine = (payload.scopeType === 'MEETING' && payload.scopeId === meetingId) || (payload.scopeType === 'CALL' && payload.scopeId === callId);
  if (mine) void goBlocked('GONE');
}

/** Tin mới của người khác trong nhóm chat họp khi sheet Chat đang đóng → badge chưa đọc. */
export function handleChatMessage(payload: ChatMessageCreatedPayload, meId: string | undefined): void {
  const { chatUnread, conversationId, sheet } = meetingRoomApi.get();
  if (!conversationId || payload.scopeType !== 'CONVERSATION' || payload.scopeId !== conversationId) return;
  if (payload.authorId === null || payload.authorId === meId || sheet === 'CHAT') return;
  meetingRoomApi.patch({ chatUnread: chatUnread + 1 });
}

/** Socket nối lại (có thể đã lỡ sự kiện): tải lại ảnh chụp phòng + chi tiết; đang chờ thì gọi `join` lại. */
export function handleResync(): void {
  const { meetingId, phase } = meetingRoomApi.get();
  if (!meetingId) return;
  void refreshRoomSnapshot();
  void refreshBrief(meetingId);
  if (phase === 'WAITING_FOR_HOST' || phase === 'IN_LOBBY') requestRejoin();
}
