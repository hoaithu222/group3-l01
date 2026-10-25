import type { ResolvedAccess } from "../../../core/permission";
import type {
  Channel,
  ChannelVoiceSettings,
  ChannelMembership,
  ChannelGrant,
  ChannelGrantWithUser,
  ChannelNotifyModeValue,
  ChannelUserSummary,
  AdminChannelRow,
} from "../entities/channel.interface";
import type { PresenceState } from "../../presence/presence.service";
import { ROLE_REF_LABEL, isGrantRoleRef, type GrantRoleRef } from "../../../core/constants/role-coverage";
import { avatarUrlOf } from "../../../shared/media";
import type { RoleCoveredUser } from "./channel-role-audience";
import { effectiveVoiceSettings } from "./channel-voice-settings";

/** be.md §4 `ChannelListItem`. */
export interface ChannelListItem {
  id: string;
  name: string;
  type: Channel["type"];
  visibility: Channel["visibility"];
  postingPolicy: Channel["postingPolicy"];
  status: Channel["status"];
  isDefault: boolean;
  pinned: boolean;
  position: number | null;
  notifyMode: ChannelNotifyModeValue;
  lastMessageAt: Date | null;
  unreadCount?: number;
  mentionCount?: number;
  /** (p2-03) Kênh VOICE đang có người trong phòng: số người + phiên — danh sách kênh vẽ "3 người đang trong phòng". Vắng = phòng trống. */
  voice?: { callId: string; count: number };
}

/** be.md §4 — bảng nút do server tính, client không tự suy từ vai trò/loại hiển thị. */
export interface ChannelMyPermissions {
  canWrite: boolean;
  canReact: boolean;
  canPin: boolean;
  canModerate: boolean;
  canManage: boolean;
  canArchive: boolean;
  canManageGrants: boolean;
  canLeave: boolean;
}

export interface ChannelDetail extends ChannelListItem {
  description: string | null;
  memberCount: number;
  createdBy: string;
  version: number;
  /** (p2-03) Cấu hình phòng thoại HIỆU LỰC — CHỈ kênh VOICE (đã áp mặc định + trần `LIMITS.voice.maxParticipants`). */
  voiceSettings?: ChannelVoiceSettings;
  myMembership?: { pinned: boolean; position: number | null; notifyMode: ChannelNotifyModeValue };
  myGrant?: { level: ChannelGrant["level"]; source: ChannelGrant["source"] };
  myPermissions: ChannelMyPermissions;
}

const DEFAULT_NOTIFY_MODE: ChannelNotifyModeValue = "INHERIT";

export function toChannelListItem(
  channel: Channel,
  membership: ChannelMembership | null,
  unread?: { unreadCount: number; mentionCount: number }
): ChannelListItem {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    visibility: channel.visibility,
    postingPolicy: channel.postingPolicy,
    status: channel.status,
    isDefault: channel.isDefault,
    pinned: membership?.pinned ?? false,
    position: membership?.position ?? null,
    notifyMode: membership?.notifyMode ?? DEFAULT_NOTIFY_MODE,
    lastMessageAt: channel.lastMessageAt,
    ...(unread && { unreadCount: unread.unreadCount, mentionCount: unread.mentionCount }),
  };
}

export function buildChannelMyPermissions(access: ResolvedAccess, isDefault: boolean): ChannelMyPermissions {
  return {
    canWrite: access.actions.has("channel.message.send"),
    canReact: access.actions.has("channel.message.react"),
    canPin: access.actions.has("channel.message.pin"),
    canModerate: access.actions.has("channel.message.moderate"),
    canManage: access.actions.has("channel.manage"),
    canArchive: access.actions.has("channel.manage"),
    canManageGrants: access.actions.has("channel.grant.manage"),
    canLeave: !isDefault,
  };
}

export function toChannelDetail(
  channel: Channel,
  access: ResolvedAccess,
  membership: ChannelMembership | null,
  grant: ChannelGrant | null
): ChannelDetail {
  return {
    ...toChannelListItem(channel, membership),
    description: channel.description,
    memberCount: channel.memberCount,
    createdBy: channel.createdBy,
    version: channel.version,
    ...(channel.type === "VOICE" && { voiceSettings: effectiveVoiceSettings(channel) }),
    ...(membership && {
      myMembership: { pinned: membership.pinned, position: membership.position, notifyMode: membership.notifyMode },
    }),
    ...(grant && { myGrant: { level: grant.level, source: grant.source } }),
    myPermissions: buildChannelMyPermissions(access, channel.isDefault),
  };
}

/** Đối tượng được cấp của 1 grant (p3-04): một người (DIRECT) hoặc một vai trò (ROLE). */
export type GrantSubject =
  | { type: "USER"; user: { id: string; name: string } }
  | { type: "ROLE"; roleRef: GrantRoleRef; label: string };

/**
 * be.md §4 `GET/POST /channels/:channelId/grants` → `Grant[]`. `userId`/`name` giữ nguyên hợp đồng Phase 1 (`null` ở
 * dòng ROLE); `subject` là dạng mới của p3-04 (nguồn sự thật cho UI "Được cấp qua vai trò").
 */
export interface GrantRow {
  subject: GrantSubject;
  userId: string | null;
  name: string | null;
  level: ChannelGrant["level"];
  source: ChannelGrant["source"];
  roleRef: string | null;
  grantedBy: string;
  createdAt: Date;
}

export function toGrantRow(row: ChannelGrantWithUser): GrantRow {
  return {
    subject: { type: "USER", user: { id: row.user.id, name: row.user.name } },
    userId: row.user.id,
    name: row.user.name,
    level: row.grant.level,
    source: row.grant.source,
    roleRef: row.grant.roleRef,
    grantedBy: row.grant.grantedBy,
    createdAt: row.grant.createdAt,
  };
}

/** Dòng grant theo VAI TRÒ (`source = ROLE`) — không có người; `level` luôn MEMBER. */
export function toRoleGrantRow(grant: ChannelGrant): GrantRow {
  const roleRef: GrantRoleRef = isGrantRoleRef(grant.roleRef) ? grant.roleRef : "MEMBER";
  return {
    subject: { type: "ROLE", roleRef, label: ROLE_REF_LABEL[roleRef] },
    userId: null,
    name: null,
    level: grant.level,
    source: grant.source,
    roleRef: grant.roleRef,
    grantedBy: grant.grantedBy,
    createdAt: grant.createdAt,
  };
}

/** be.md §4 `GET /channels/:channelId/members` — public: `ChannelMembership`; private: grant. */
export interface ChannelMemberRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  level?: ChannelGrant["level"];
  source?: ChannelGrant["source"];
  /** Chỉ khi `source = ROLE`: vai trò đang phủ tới người này ("Được cấp qua vai trò"). */
  roleRef?: GrantRoleRef;
  presence: PresenceState;
}

/** `avatarUrl` (mọi dòng) = URL ảnh ký sẵn từ `User.avatarAssetId` nạp cùng truy vấn user; chưa có ảnh/đã ẩn danh → `null`. */
export function toChannelMemberRowFromMembership(
  user: Pick<ChannelUserSummary, "id" | "name" | "avatarAssetId">,
  presence: PresenceState
): ChannelMemberRow {
  return { userId: user.id, name: user.name, avatarUrl: avatarUrlOf(user.avatarAssetId), presence };
}

export function toChannelMemberRowFromGrant(row: ChannelGrantWithUser, presence: PresenceState): ChannelMemberRow {
  return {
    userId: row.user.id,
    name: row.user.name,
    avatarUrl: avatarUrlOf(row.user.avatarAssetId),
    level: row.grant.level,
    source: row.grant.source,
    presence,
  };
}

/** Người đọc được nhờ role grant: level MEMBER, nguồn ROLE (không có grant DIRECT). */
export function toChannelMemberRowFromRole(row: RoleCoveredUser, presence: PresenceState): ChannelMemberRow {
  const { id, name, avatarAssetId } = row.user;
  return { userId: id, name, avatarUrl: avatarUrlOf(avatarAssetId), level: "MEMBER", source: "ROLE", roleRef: row.roleRef, presence };
}

/** be.md §4 `AdminChannelRow` — dùng lại sau `platformArchive`/`platformRestore` (channel-lifecycle.service.ts) để trả kết quả mới nhất. */
export function toAdminChannelRow(channel: Channel): AdminChannelRow {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    postingPolicy: channel.postingPolicy,
    status: channel.status,
    isDefault: channel.isDefault,
    archiveReason: channel.archiveReason,
    memberCount: channel.memberCount,
    messages7d: 0,
    createdAt: channel.createdAt,
  };
}
