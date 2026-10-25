import type { MeetingStatus } from "@prisma/client";
import type { RoomRecordingStateDto } from "./meeting-recap.interface";

/** Vai trò TRONG PHIÊN họp (`CallParticipant.role`); `INITIATOR` chỉ có ở cuộc gọi RING nên không dùng ở đây. */
export type RoomRole = "HOST" | "CO_HOST" | "MEMBER";

/** Phân loại người vào phòng theo lịch: chủ trì/đồng chủ trì/được mời/thành viên workspace vào qua link (không trong danh sách). */
export type JoinCategory = "HOST" | "CO_HOST" | "ATTENDEE" | "GUEST_LINK";

export interface PublishPermissionsDto {
  audio: boolean;
  video: boolean;
  screen: boolean;
}

/** `JoinResultDto` (be.md §4) — `state` quyết định các trường còn lại; client KHÔNG suy ra từ mã lỗi. */
export type JoinResultDto =
  | { state: "WAITING_FOR_HOST"; meetingId: string; joinOpensAt: string; startAt: string; serverNow: string }
  | { state: "IN_LOBBY"; meetingId: string; requestedAt: string; serverNow: string }
  | {
      state: "JOINED";
      meetingId: string;
      callId: string;
      livekitUrl: string;
      livekitRoom: string;
      token: string;
      tokenExpiresAt: string;
      role: RoomRole;
      publishPermissions: PublishPermissionsDto;
      /** (p2-06) Trạng thái ghi hình hiện tại cho NGƯỜI NÀY (`null` = không ghi và không có yêu cầu đồng ý); chỉ báo + hộp thoại đồng ý dựa vào đây. */
      recording: RoomRecordingStateDto | null;
      lockedAt: string | null;
      closingAt: string | null;
      conversationId: string | null;
      serverNow: string;
    };

export interface RoomParticipantDto {
  userId: string;
  name: string;
  role: string;
  state: string;
  handRaisedAt: string | null;
  mutedByHost: boolean;
  joinedAt: string | null;
}

export interface RoomSnapshotDto {
  meetingId: string;
  callId: string | null;
  status: MeetingStatus;
  lockedAt: string | null;
  closingAt: string | null;
  /** Vai trò của NGƯỜI GỌI trong phiên hiện tại (`null` = chưa vào). */
  myRole: RoomRole | null;
  participants: RoomParticipantDto[];
  /** Chỉ chủ trì/đồng chủ trì thấy số thật; người khác luôn 0 (không lộ hàng đợi). */
  lobbyCount: number;
  recording: RoomRecordingStateDto | null;
  version: number;
  serverNow: string;
}

export interface LobbyEntryDto {
  userId: string;
  displayName: string;
  requestedAt: string;
}

export type LobbyState = "REQUESTED" | "CANCELLED" | "ADMITTED" | "DENIED";
