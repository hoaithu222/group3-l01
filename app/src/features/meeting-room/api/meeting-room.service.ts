import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  callTokenPath,
  conversationPath,
  meetingAttendeesPath,
  meetingRoomPath,
  roomChatGroupPath,
  roomEndPath,
  roomJoinPath,
  roomLeavePath,
  roomSnapshotPath,
  roomStartPath,
} from './meeting-room.api';
import type {
  AttendeeLite,
  JoinResult,
  MeetingBrief,
  RoomSnapshot,
  StartResult,
} from './meeting-room.types';

/**
 * `skipErrorToast` ở MỌI lời gọi của luồng vào phòng: `MEET_007/013/017/018/009…` và `CALL_004` là NỘI DUNG của màn
 * (JoinBlockedView, hộp thoại "Chuyển sang cuộc họp này?"), không phải toast tự tắt.
 */
const QUIET = { skipErrorToast: true } as const;

/** Trần số trang khi gom danh sách người được mời (mỗi trang 100) — phòng họp lớn hơn 400 người vẫn thấy 400 người đầu. */
const MAX_ATTENDEE_PAGES = 4;

const stamped = (dto: MeetingBrief): MeetingBrief => ({ ...dto, receivedAt: Date.now() });

export interface JoinBody {
  deviceId: string;
  displayName?: string;
  force?: boolean;
}

/** Mặt tiền phiên họp: chi tiết tối thiểu, vào/bắt đầu/rời/kết thúc, ảnh chụp phòng, token, nhóm chat, người được mời. */
export const meetingRoomService = {
  async getBrief(meetingId: string): Promise<MeetingBrief> {
    return stamped(unwrapData<MeetingBrief>(await apiClient.get(meetingRoomPath(meetingId), QUIET)));
  },

  /** `expectedVersion` là version chi tiết cuộc họp client đang giữ (CAS) — lệch nhưng đã LIVE thì BE cho vào cùng phòng (MR-02). */
  async start(meetingId: string, body: JoinBody & { expectedVersion: number }): Promise<StartResult> {
    const data = unwrapData<StartResult>(await apiClient.post(roomStartPath(meetingId), body, QUIET));
    return data.meeting ? { ...data, meeting: stamped(data.meeting) } : data;
  },

  async join(meetingId: string, body: JoinBody): Promise<JoinResult> {
    return unwrapData<JoinResult>(await apiClient.post(roomJoinPath(meetingId), body, QUIET));
  },

  /** 204 — idempotent. `transferControlTo`: giao quyền (thành CO_HOST phiên) trước khi rời. */
  async leave(meetingId: string, transferControlTo?: string): Promise<void> {
    await apiClient.post(roomLeavePath(meetingId), transferControlTo ? { transferControlTo } : {}, QUIET);
  },

  async end(meetingId: string): Promise<MeetingBrief> {
    return stamped(unwrapData<MeetingBrief>(await apiClient.post(roomEndPath(meetingId), {}, QUIET)));
  },

  async snapshot(meetingId: string): Promise<RoomSnapshot> {
    return unwrapData<RoomSnapshot>(await apiClient.get(roomSnapshotPath(meetingId), QUIET));
  },

  /** `POST /calls/:id/token` (p2-01) — token mới cho lần kết nối lại; lỗi thì caller dùng lại token cũ. */
  async renewToken(callId: string): Promise<{ expiresAt: string; livekitUrl: string; token: string }> {
    return unwrapData<{ expiresAt: string; livekitUrl: string; token: string }>(
      await apiClient.post(callTokenPath(callId), {}, QUIET),
    );
  },

  /** Host bật nhóm chat ngay trong phòng (BE dùng lại đồng bộ nhóm chat p2-04) — trả `conversationId`. */
  async ensureChatGroup(meetingId: string): Promise<{ conversationId: string }> {
    return unwrapData<{ conversationId: string }>(await apiClient.post(roomChatGroupPath(meetingId), {}, QUIET));
  },

  /** Người được mời — tab "Được mời" và tên tác giả tin nhắn trong họp (cursor). */
  async listAttendees(meetingId: string, cursor?: string): Promise<{ items: AttendeeLite[]; nextCursor: string | null }> {
    const response = await apiClient.get(meetingAttendeesPath(meetingId), { params: { cursor, limit: 100 }, ...QUIET });
    const body = response.data as { data: AttendeeLite[]; meta?: { nextCursor: string | null } };
    return { items: body.data, nextCursor: body.meta?.nextCursor ?? null };
  },

  /** Toàn bộ người được mời (gom ≤ 4 trang × 100 = 400 người) — khoá cache `meetingRoomKeys.attendees` mang hình dạng này. */
  async listAllAttendees(meetingId: string): Promise<AttendeeLite[]> {
    const all: AttendeeLite[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_ATTENDEE_PAGES; page += 1) {
      const { items, nextCursor } = await meetingRoomService.listAttendees(meetingId, cursor);
      all.push(...items);
      if (!nextCursor) break;
      cursor = nextCursor;
    }
    return all;
  },

  /** Chỉ đọc quyền gửi tin của MÌNH trong hội thoại họp — không import `conversations` (không import chéo feature). */
  async chatAccess(conversationId: string): Promise<{ canSend: boolean; readOnlyReason: string | null }> {
    const detail = unwrapData<{ myPermissions?: { canSend?: boolean }; readOnlyReason?: string | null }>(
      await apiClient.get(conversationPath(conversationId), QUIET),
    );
    return { canSend: detail.myPermissions?.canSend ?? false, readOnlyReason: detail.readOnlyReason ?? null };
  },
};
