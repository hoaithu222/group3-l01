import type { CursorMeta } from './invites.types';
import type { MembershipStatus, WorkspaceRole } from './members.types';

/**
 * DTO lời mời email/khách/duyệt tham gia — viết tay (chưa có `gen:api-types`, p0-09), ĐÃ ĐỐI CHIẾU với mã BE thật
 * (2026-09-30): `be/src/modules/members/invitations.routes.ts` (route đã mount đầy đủ) · `dtos/invitation.dto.ts` +
 * `dtos/guest.dto.ts` (thân/truy vấn) · `entities/invitation.interface.ts` (`InvitationDto`, `InvitationPreview`,
 * `AcceptInvitationResult`, `InviteMembersResult`, `JoinRequestRow`) · `services/invitation-accept.service.ts` (`MyInvitationDto`).
 * Ngày là chuỗi ISO qua JSON (BE khai `Date`).
 *
 * ⚠️ `InvitationDto` = model Prisma bỏ `tokenHash`/`pendingKey`/`normalizedEmail` — token KHÔNG bao giờ có trong phản hồi (chỉ nằm
 * trong email). Mã THẬT thắng be.md: đối chiếu lại các mục dưới khi BE đổi DTO.
 *
 * Phạm vi đối chiếu = DTO của module `members`. `WorkspaceAccessSlice`/`GuestChannelOption` (cuối file) là lát của module `workspaces`/
 * `channels` — KHÔNG thuộc đợt đối chiếu này, vẫn theo chú thích riêng của chúng.
 *
 * Lệch đã sửa khi đối chiếu: (1) `AcceptInvitationResult.skippedChannels` (BE có, app thiếu); (2) chú thích "202 `status: PENDING`"
 * ở `invitations.service.ts` sai với luồng email — xem `AcceptInvitationResult.membership`.
 */
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
export type InvitationRole = 'MEMBER' | 'GUEST';

export interface InvitationDto {
  id: string;
  workspaceId: string;
  /** Người mời thấy ĐẦY ĐỦ (app.md §7); màn chấp nhận chỉ thấy `emailHint`. */
  email: string;
  role: InvitationRole;
  guestChannelIds: string[];
  guestDays: number | null;
  message: string | null;
  status: InvitationStatus;
  invitedBy: string;
  expiresAt: string;
  lastSentAt: string;
  sendCount: number;
  acceptedAt: string | null;
  createdAt: string;
}

/**
 * `GET /me/invitations` — `InvitationDto` + thông tin để HIỆN (nhóm, người mời), KHÔNG có token: chấp nhận
 * qua `POST /me/invitations/:id/accept` (BE be.md p3-04 §13.2 mục 7). Danh sách này là email của CHÍNH mình.
 */
export interface MyInvitationDto extends InvitationDto {
  workspace: { name: string; avatarUrl: string | null };
  inviter: { name: string };
}

export interface InvitationListPage {
  items: InvitationDto[];
  meta: CursorMeta;
}

/** `POST /workspaces/:id/invitations` (MEMBER) — tối đa 20 email/lần (`inviteMembersSchema`). */
export interface InviteMembersPayload {
  emails: string[];
  message?: string;
}

export type InviteSkipReason = 'ALREADY_MEMBER' | 'PENDING_EXISTS' | 'BANNED';

export interface InviteMembersResult {
  created: InvitationDto[];
  skipped: { email: string; reason: InviteSkipReason }[];
}

/** `POST /workspaces/:id/guests/invitations` (`inviteGuestSchema`): ≥ 1 kênh, 1–`maxDays` ngày. */
export interface InviteGuestPayload {
  email: string;
  channelIds: string[];
  days: number;
  message?: string;
}

/** `GET /invitations/by-token/:token` — `optionalAuth`, nên chưa đăng nhập vẫn xem được bản xem trước tối thiểu này. */
export interface InvitationPreview {
  workspace: { name: string; avatarUrl: string | null };
  invitedBy: { name: string };
  role: InvitationRole;
  /** Chỉ khi `role === 'GUEST'`: tên các kênh khách sẽ vào (không lộ id). */
  channels?: { name: string }[];
  guestDays: number | null;
  expiresAt: string;
  /** "l***@gmail.com" — gợi ý CHE để người dùng biết nên đăng nhập tài khoản nào. */
  emailHint: string;
  status: InvitationStatus;
}

/** Lý do một kênh chỉ định bị BỎ QUA lúc chấp nhận lời mời khách (`ChannelGrantSkipReason` của BE). */
export type SkippedChannelReason = 'NOT_FOUND' | 'ARCHIVED';

/** `POST /invitations/by-token/:token/accept` và `POST /me/invitations/:id/accept` (cùng kết quả). */
export interface AcceptInvitationResult {
  workspaceId: string;
  /**
   * ⚠️ Lời mời EMAIL luôn trả `status: 'ACTIVE'` (BE `InvitationAcceptService`): danh tính đã chứng minh bằng email ĐÃ XÁC MINH khớp
   * lời mời nên KHÔNG qua duyệt — HTTP 200, không có nhánh 202. `PENDING` (202, chờ duyệt) chỉ là của link mời
   * (`POST /invites/:token/accept`, `invites.types.ts`). Kiểu vẫn để rộng (`MembershipStatus`) và các màn chấp nhận giữ nhánh
   * `PENDING` như phòng xa — đừng dựa vào nhánh đó để suy ra nhóm có bật duyệt.
   */
  membership: { role: WorkspaceRole; status: MembershipStatus; expiresAt?: string | null };
  /** Chỉ có khi lời mời KHÁCH có kênh chỉ định bị bỏ qua (kênh không còn/đã lưu trữ) — vắng mặt khi không kênh nào bị bỏ. */
  skippedChannels?: { channelId: string; reason: SkippedChannelReason }[];
}

/** `PATCH /workspaces/:id/members/:userId/guest` (`updateGuestSchema`). */
export interface UpdateGuestPayload {
  expiresAt?: string;
  channelIds?: string[];
  /** `membership.version` — 409 `RES_003` khi lệch. */
  expectedVersion: number;
}

/** Một dòng `GET /workspaces/:id/join-requests` (be.md §4). */
export interface JoinRequestRow {
  user: { id: string; name: string; avatarUrl: string | null };
  requestMessage: string | null;
  requestedAt: string;
  via: 'INVITE_LINK';
}

export interface JoinRequestListPage {
  items: JoinRequestRow[];
  meta: CursorMeta;
}

/** Lát của `GET /workspaces/:id` mà các màn mời/duyệt cần — xem `useWorkspaceAccess`. */
export interface WorkspaceAccessSlice {
  myRole: WorkspaceRole;
  myPermissions: { canInvite: boolean };
  /** ⚠️ be.md p3-04 chỉ khai `PATCH /workspaces/:id/settings`; đọc giá trị hiện tại giả định nằm trong `WorkspaceDetail`. */
  joinPolicy?: 'OPEN' | 'APPROVAL';
  guestPolicy?: {
    enabled: boolean;
    maxGuests: number;
    maxDays: number;
    memberCanInvite: boolean;
  } | null;
}

/** Kênh trong bộ chọn kênh chỉ định — lát của `ChannelListItem` (p1-03). */
export interface GuestChannelOption {
  id: string;
  name: string;
  visibility: 'PUBLIC' | 'PRIVATE';
}
