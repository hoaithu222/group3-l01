import type { Prisma } from "@prisma/client";

/**
 * Cổng `modules/channels` (p3-04) để module KHÁC (`workspaces`/`members` — khách, lời mời email) cấp/thu hồi quyền kênh
 * DIRECT cho một người TRONG transaction của mình mà KHÔNG import chéo `modules/channels` (luật 3 tầng). `workspaces.routes.ts`
 * tự `new` bằng `createChannelGrantPort()` (từ `modules/channels/index.ts`), giống `createChannelBootstrap()`.
 *
 * Quy trình gọi (transaction thế nào):
 *   1. Trong `withTransaction(tx => …)` của caller: `grantMemberInTx(tx, …)` / `revokeMemberInTx(tx, …)` / `syncRoleAccessInTx(tx, …)`
 *      — ghi `ChannelGrant`/`ChannelMembership`/`memberCount` + outbox `channel.events` (phát `channel:granted` sau commit). KHÔNG phát gì ngay.
 *   2. SAU commit: `afterCommit(result)` — bump version quyền kênh, vào/rời room `ch:`, `revokeScope` + `channel:revoked`.
 */
export interface ChannelMemberRevokeInput {
  workspaceId: string;
  /** Người bị thu hồi (khách). */
  userId: string;
  channelIds: string[];
}

export interface ChannelMemberGrantInput extends ChannelMemberRevokeInput {
  /** Người thực hiện (`grantedBy`). */
  actorId: string;
}

export type ChannelGrantSkipReason = "NOT_FOUND" | "ARCHIVED";

export interface ChannelGrantChange {
  workspaceId: string;
  userId: string;
  /** Kênh vừa được cấp (chưa có grant DIRECT trước đó). */
  granted: string[];
  /** Kênh đã có grant DIRECT từ trước (idempotent — không đổi gì). */
  already: string[];
  /** Kênh bị bỏ qua: không thuộc workspace/không tồn tại hoặc đã lưu trữ (`details.skippedChannels` của accept). */
  skipped: Array<{ channelId: string; reason: ChannelGrantSkipReason }>;
  /** Kênh vừa bị gỡ grant DIRECT (chỉ `revokeMemberInTx`). */
  revoked: string[];
}

export interface ChannelGrantPort {
  /**
   * Cấp grant DIRECT `level=MEMBER` (+ `ChannelMembership`, tính lại `memberCount`) cho `userId` trên từng kênh — CẢ kênh public
   * lẫn riêng tư (khách: "kênh chỉ định" = grant). Idempotent. Kênh không thuộc `workspaceId`/không có → `skipped NOT_FOUND`;
   * kênh ARCHIVED → `skipped ARCHIVED`. Không gửi thông báo (caller lo).
   */
  grantMemberInTx(tx: Prisma.TransactionClient, input: ChannelMemberGrantInput): Promise<ChannelGrantChange>;
  /** Gỡ grant DIRECT + `ChannelMembership` của `userId` trên các kênh (giữ nếu vẫn được phủ bởi role grant). Idempotent. */
  revokeMemberInTx(tx: Prisma.TransactionClient, input: ChannelMemberRevokeInput): Promise<ChannelGrantChange>;
  /**
   * Gỡ TOÀN BỘ grant/membership kênh của `userId` trong workspace khi họ rời/bị loại/HẾT HẠN (khách): ghi outbox
   * `channel.membership-revoked` (consumer p1-03 dọn grant + membership + `memberCount` + bump version). Không cần `afterCommit`.
   */
  revokeAllInTx(tx: Prisma.TransactionClient, input: { workspaceId: string; userId: string }): Promise<void>;
  /**
   * Người vừa trở thành thành viên ACTIVE (accept lời mời, duyệt yêu cầu…) hoặc vừa đổi vai trò: hiện thực hoá `ChannelMembership`
   * cho kênh riêng tư có role grant phủ tới họ. Idempotent, chỉ ghi DB (không realtime).
   */
  syncRoleAccessInTx(tx: Prisma.TransactionClient, input: { workspaceId: string; userId: string }): Promise<void>;
  /** SAU commit: bump version `CHANNEL`, vào room `ch:` (granted) / `revokeScope` + `channel:revoked` (revoked). Best-effort với realtime. */
  afterCommit(change: ChannelGrantChange): Promise<void>;
}
