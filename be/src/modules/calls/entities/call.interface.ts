import type {
  CallEndReason,
  CallMediaKind,
  CallMode,
  CallOutcome,
  CallParticipantRole,
  CallParticipantState,
  CallScopeType,
  CallStatus,
} from "@prisma/client";

export type CallScopeTypeValue = CallScopeType;
export type CallModeValue = CallMode;
export type CallMediaKindValue = CallMediaKind;
export type CallStatusValue = CallStatus;
export type CallEndReasonValue = CallEndReason;
export type CallParticipantRoleValue = CallParticipantRole;
export type CallParticipantStateValue = CallParticipantState;
export type CallOutcomeValue = CallOutcome;

export interface PublishPermissions {
  audio: boolean;
  video: boolean;
  screen: boolean;
}

export interface CallEntity {
  id: string;
  scopeType: CallScopeTypeValue;
  scopeId: string;
  workspaceId: string | null;
  mode: CallModeValue;
  mediaKind: CallMediaKindValue;
  status: CallStatusValue;
  endReason: CallEndReasonValue | null;
  initiatorId: string;
  hostId: string | null;
  livekitRoom: string;
  clientCallId: string;
  activeKey: string;
  invitedCount: number;
  peakParticipants: number;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  durationSec: number | null;
  endedBy: string | null;
  lastReconciledAt: Date | null;
  version: number;
}

export interface CallParticipantEntity {
  id: string;
  callId: string;
  userId: string;
  role: CallParticipantRoleValue;
  state: CallParticipantStateValue;
  invitedAt: Date | null;
  invitedBy: string | null;
  joiningAt: Date | null;
  respondedAt: Date | null;
  respondedDeviceId: string | null;
  firstJoinedAt: Date | null;
  lastJoinedAt: Date | null;
  lastLeftAt: Date | null;
  connectedSeconds: number;
  publishPermissions: PublishPermissions;
  handRaisedAt: Date | null;
  mutedByHost: boolean;
  removedBy: string | null;
  /** (p2-02) Lần gần nhất một thiết bị của người này xác nhận đã nhận cuộc gọi tới (`POST /calls/:id/ack`); vắng/null = chưa xác nhận. */
  lastRingAckAt?: Date | null;
  /** (p2-02) Tối đa 5 `deviceId` đã xác nhận (mới nhất cuối). */
  ringAckDeviceIds?: string[];
  callStartedAt: Date;
  scopeType: CallScopeTypeValue;
  scopeId: string;
  mediaKind: CallMediaKindValue;
  mode: CallModeValue;
  outcome: CallOutcomeValue | null;
  version: number;
}

export type NewCall = Omit<CallEntity, "endReason" | "endedAt" | "durationSec" | "endedBy" | "lastReconciledAt" | "peakParticipants" | "version"> &
  Partial<Pick<CallEntity, "endReason" | "peakParticipants">>;

export type NewParticipant = Pick<
  CallParticipantEntity,
  "callId" | "userId" | "role" | "state" | "publishPermissions" | "callStartedAt" | "scopeType" | "scopeId" | "mediaKind" | "mode"
> &
  Partial<
    Pick<
      CallParticipantEntity,
      "invitedAt" | "invitedBy" | "joiningAt" | "respondedAt" | "respondedDeviceId" | "firstJoinedAt" | "lastJoinedAt" | "outcome"
    >
  >;

/** Trường được phép sửa khi CAS `Call` — `version` luôn tự tăng ở repository. */
export type CallPatch = Partial<
  Pick<
    CallEntity,
    | "status"
    | "endReason"
    | "hostId"
    | "activeKey"
    | "answeredAt"
    | "endedAt"
    | "durationSec"
    | "endedBy"
    | "lastReconciledAt"
    | "peakParticipants"
    | "invitedCount"
  >
>;

export type ParticipantPatch = Partial<
  Pick<
    CallParticipantEntity,
    | "role"
    | "state"
    | "invitedAt"
    | "invitedBy"
    | "joiningAt"
    | "respondedAt"
    | "respondedDeviceId"
    | "firstJoinedAt"
    | "lastJoinedAt"
    | "lastLeftAt"
    | "connectedSeconds"
    | "publishPermissions"
    | "handRaisedAt"
    | "mutedByHost"
    | "removedBy"
    | "outcome"
    | "lastRingAckAt"
    | "ringAckDeviceIds"
  >
>;

export interface CallHistoryFilter {
  filter: "all" | "missed";
  scopeType?: CallScopeTypeValue;
  scopeId?: string;
  cursor?: { at: Date; id: string };
  limit: number;
}

// ── DTO trả về client ──────────────────────────────────────────────────────

export interface CallUserRef {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface CallScopeInfo {
  title: string;
  avatarUrl: string | null;
  kind: "DIRECT" | "GROUP" | "CHANNEL" | "MEETING";
}

export interface CallParticipantDto {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: CallParticipantRoleValue;
  state: CallParticipantStateValue;
  handRaisedAt: string | null;
  mutedByHost: boolean;
  /** (p2-03) Đang giữ slot chia sẻ màn hình của phòng ROOM (cờ DB `publishPermissions.screen`, đặt/nhả cùng slot Redis). */
  screenSharing: boolean;
  /** (p2-02) Thời điểm thiết bị của người này xác nhận đang đổ chuông (`POST /calls/:id/ack`) — người gọi hiện "Đang đổ chuông"; null = chưa. */
  ringAckedAt: string | null;
}

export interface MyCallActions {
  canAnswer: boolean;
  canDecline: boolean;
  canCancel: boolean;
  canJoin: boolean;
  canLeave: boolean;
  canEnd: boolean;
  canInvite: boolean;
}

export interface CallDto {
  id: string;
  /** (p2-02) UUID v5 tất định của `id` (`core/utils/call-uuid.ts`) — CallKit/ConnectionService dùng CHÍNH UUID này, khớp `apns-id`/`data.callUuid` của push. */
  callUuid: string;
  scopeType: CallScopeTypeValue;
  scopeId: string;
  workspaceId: string | null;
  mode: CallModeValue;
  mediaKind: CallMediaKindValue;
  status: CallStatusValue;
  endReason: CallEndReasonValue | null;
  initiator: CallUserRef;
  hostId: string | null;
  scope: CallScopeInfo;
  participants: CallParticipantDto[];
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  version: number;
  serverNow: string;
  myActions: MyCallActions;
}

export interface CallHistoryItem {
  callId: string;
  scopeType: CallScopeTypeValue;
  scopeId: string;
  scope: CallScopeInfo;
  mediaKind: CallMediaKindValue;
  mode: CallModeValue;
  outcome: CallOutcomeValue | null;
  direction: "OUTGOING" | "INCOMING";
  startedAt: string;
  durationSec: number | null;
  participantsPreview: CallUserRef[];
}

export interface CallTokenResponse {
  token: string;
  livekitUrl: string;
  expiresAt: string;
}

/** Kết quả `POST /calls`/`/join` (dùng chung RING và ROOM — p2-01/p2-03). */
export interface CreateCallResult {
  call: CallEntity;
  joined: boolean;
  /** `true` khi tạo cuộc gọi mới (HTTP 201); `false` cho replay/tham gia (HTTP 200). */
  created: boolean;
  token?: CallTokenResponse;
}
