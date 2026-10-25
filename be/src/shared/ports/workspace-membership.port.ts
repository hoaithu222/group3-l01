import type { Prisma } from "@prisma/client";
import type { ChannelGrantSkipReason } from "./channel-grant.port";

/**
 * Cổng `modules/members` (p6-03) để module KHÁC (`mentor`) cấp/gia hạn/thu hồi tư cách KHÁCH (GUEST có hạn, p3-04) cho một người
 * mà KHÔNG import chéo `modules/members` (luật 3 tầng, `.claude/rules/architecture.md`). `modules/members/public.ts` cài đặt và export
 * factory `createWorkspaceMembershipPort()`; module gọi tự `new` trong container của mình (giống `createChannelGrantPort()`).
 *
 * Quy trình gọi:
 *   1. Trong `withTransaction(tx => …)` của caller: `grantGuestInTx` / `updateGuestExpiryInTx` — ghi `WorkspaceMembership` (+ grant kênh
 *      DIRECT, `memberCount`, outbox `membership.events` → `member:updated`). KHÔNG phát gì ngay.
 *   2. SAU commit: `afterGuestChange(handle)` — bump version quyền WORKSPACE + vào/rời room kênh (`ChannelGrantPort.afterCommit`).
 *   3. Thu hồi: `revokeGuest` tự mở transaction (đi CHUNG đường remove/leave/expire của `MembershipLifecycleService`: outbox dọn grant
 *      kênh + rời nhóm chat, sau commit `revokeScope` → `permission:revoked`). Idempotent.
 */
export type WorkspaceMembershipStatus = "ACTIVE" | "PENDING" | "LEFT" | "REMOVED" | "BANNED";

export interface GuestGrantInput {
  workspaceId: string;
  userId: string;
  /** Hạn tư cách khách (bắt buộc — GUEST luôn có hạn, p3-04). */
  expiresAt: Date;
  /** Nhãn hiển thị (chữ, KHÔNG phải quyền) — vd `"MENTOR"`. */
  displayTag: string | null;
  /** Kênh chỉ định (grant DIRECT MEMBER). */
  channelIds: string[];
  /** Người cấp (`invitedBy`, `grantedBy`). */
  grantedBy: string;
  /** Nhãn nguồn cho outbox `membership.joined.via` (vd `"MENTOR"`). */
  via: string;
}

export type GuestGrantRejection = "ALREADY_MEMBER" | "PENDING" | "BANNED";

export interface GuestChangeHandle {
  workspaceId: string;
  userId: string;
  /** Kênh vừa cấp + đã có từ trước (idempotent). */
  channelIds: string[];
  skipped: Array<{ channelId: string; reason: ChannelGrantSkipReason }>;
  /** Dữ liệu nội bộ của cài đặt (thay đổi grant kênh) — caller KHÔNG đọc, chỉ chuyển lại cho `afterGuestChange`. */
  internal: unknown;
}

export type GuestGrantResult = { ok: true; handle: GuestChangeHandle } | { ok: false; reason: GuestGrantRejection };

/** Lý do thu hồi — map sang `leftReason` + `permission:revoked.reason`. */
export type GuestRevokeReason = "REMOVED" | "LEFT" | "EXPIRED";

export interface WorkspaceMembershipPort {
  /** Trạng thái membership hiện tại (null = chưa từng là thành viên). */
  statusOf(workspaceId: string, userId: string): Promise<WorkspaceMembershipStatus | null>;
  /**
   * Upsert membership GUEST ACTIVE (`expiresAt`, `displayTag`, `expiryVersion+1`) + grant kênh chỉ định + `memberCount+1` + outbox
   * `membership.joined`. Người đang ACTIVE/PENDING/BANNED → `{ ok: false }` (caller tự ném lỗi để huỷ transaction).
   */
  grantGuestInTx(tx: Prisma.TransactionClient, input: GuestGrantInput): Promise<GuestGrantResult>;
  /** Đổi hạn khách (CAS ACTIVE + GUEST, `expiryVersion+1`) + outbox `membership.guest-updated`. `false` khi không còn là khách ACTIVE. */
  updateGuestExpiryInTx(tx: Prisma.TransactionClient, input: { workspaceId: string; userId: string; expiresAt: Date }): Promise<boolean>;
  /** SAU commit của `grantGuestInTx`/`updateGuestExpiryInTx` — bump version WORKSPACE + realtime kênh. Best-effort với realtime. */
  afterGuestChange(handle: Pick<GuestChangeHandle, "workspaceId" | "userId" | "internal">): Promise<void>;
  /** Thu hồi khách (ACTIVE + GUEST) và xoá `displayTag`. `SKIPPED` khi đã không còn là khách ACTIVE (idempotent). */
  revokeGuest(workspaceId: string, userId: string, reason: GuestRevokeReason): Promise<"REVOKED" | "SKIPPED">;
}
