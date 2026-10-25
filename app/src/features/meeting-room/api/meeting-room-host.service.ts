import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  lobbyAdmitAllPath,
  lobbyDecisionPath,
  lobbyMePath,
  lobbyPath,
  lowerAllHandsPath,
  muteAllPath,
  participantActionPath,
  roomLockPath,
  transferControlPath,
} from './meeting-room.api';
import type { LobbyEntry, MuteSource, RoomRole } from './meeting-room.types';

/** Lỗi của thao tác chủ trì là nội dung màn (toast do hook hiện có chủ đích), không để interceptor toast thêm lần nữa. */
const QUIET = { skipErrorToast: true } as const;

/** BE `POST /meetings/:meetingId/hands/:userId/lower`. ⚠️ Tạm ở đây (đợt MR1 không được sửa `meeting-room.api.ts`) — nên chuyển về đó. */
const lowerHandPath = (meetingId: string, userId: string): string => `/meetings/${meetingId}/hands/${userId}/lower`;

/** Phòng chờ + điều khiển của chủ trì/đồng chủ trì (BE `meeting-lobby.service.ts`, `meeting-host-control.service.ts`). */
export const meetingRoomHostService = {
  async listLobby(meetingId: string): Promise<LobbyEntry[]> {
    return unwrapData<LobbyEntry[]>(await apiClient.get(lobbyPath(meetingId), QUIET));
  },

  async admit(meetingId: string, userId: string): Promise<{ admitted: boolean }> {
    return unwrapData<{ admitted: boolean }>(await apiClient.post(lobbyDecisionPath(meetingId, userId, 'admit'), {}, QUIET));
  },

  async deny(meetingId: string, userId: string): Promise<{ denied: boolean }> {
    return unwrapData<{ denied: boolean }>(await apiClient.post(lobbyDecisionPath(meetingId, userId, 'deny'), {}, QUIET));
  },

  async admitAll(meetingId: string): Promise<{ admittedUserIds: string[] }> {
    return unwrapData<{ admittedUserIds: string[] }>(await apiClient.post(lobbyAdmitAllPath(meetingId), {}, QUIET));
  },

  /** Người xin vào tự huỷ (204). */
  async cancelMyRequest(meetingId: string): Promise<void> {
    await apiClient.delete(lobbyMePath(meetingId), QUIET);
  },

  async setLocked(meetingId: string, locked: boolean): Promise<{ lockedAt: string | null; version: number }> {
    return unwrapData<{ lockedAt: string | null; version: number }>(
      await apiClient.post(roomLockPath(meetingId, locked), {}, QUIET),
    );
  },

  /** Tắt mic/camera/chia sẻ MỘT người ở server (204) — không có "bật lại": người đó tự bật. */
  async mute(meetingId: string, userId: string, source: MuteSource): Promise<void> {
    await apiClient.post(participantActionPath(meetingId, userId, 'mute'), { source }, QUIET);
  },

  async muteAll(meetingId: string): Promise<{ mutedCount: number }> {
    return unwrapData<{ mutedCount: number }>(await apiClient.post(muteAllPath(meetingId), { source: 'MICROPHONE' }, QUIET));
  },

  /** Mời ra + chặn vào lại suốt phiên; `alsoRemoveAttendee` xoá luôn khỏi danh sách tham dự. */
  async remove(meetingId: string, userId: string, alsoRemoveAttendee: boolean): Promise<void> {
    await apiClient.post(participantActionPath(meetingId, userId, 'remove'), { alsoRemoveAttendee }, QUIET);
  },

  /** Cấp/thu CO_HOST trong phiên (chỉ chủ trì). */
  async setRole(meetingId: string, userId: string, role: Exclude<RoomRole, 'HOST'>): Promise<void> {
    await apiClient.post(participantActionPath(meetingId, userId, 'role'), { role }, QUIET);
  },

  async lowerAllHands(meetingId: string): Promise<void> {
    await apiClient.post(lowerAllHandsPath(meetingId), {}, QUIET);
  },

  /** Hạ tay MỘT người (204, cả khi tay đã hạ) — người đó nhận `call:host-action HAND_LOWERED`. */
  async lowerHand(meetingId: string, userId: string): Promise<void> {
    await apiClient.post(lowerHandPath(meetingId, userId), {}, QUIET);
  },

  async transferControl(meetingId: string, toUserId: string): Promise<void> {
    await apiClient.post(transferControlPath(meetingId), { toUserId }, QUIET);
  },
};
