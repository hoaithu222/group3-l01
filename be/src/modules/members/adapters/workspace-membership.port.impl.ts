import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { permissionService } from "../../../core/permission";
import type { ChannelGrantChange, ChannelGrantPort } from "../../../shared/ports/channel-grant.port";
import type {
  GuestChangeHandle,
  GuestGrantInput,
  GuestGrantResult,
  GuestRevokeReason,
  WorkspaceMembershipPort,
  WorkspaceMembershipStatus,
} from "../../../shared/ports/workspace-membership.port";
import type { MembershipLifecycleService } from "../services/membership-lifecycle.service";

/**
 * Cài đặt `WorkspaceMembershipPort` (p6-03 — `mentor` cấp khách có hạn) bằng ĐÚNG các khối p3-04 đã có: upsert membership như
 * `InvitationAcceptService.acceptInTx` (GUEST), grant kênh qua `ChannelGrantPort`, thu hồi qua `MembershipLifecycleService.revokeInTx`.
 * KHÔNG lên lịch `guest.expire`: hạn của đợt cố vấn do cron `mentor.expire` + `ResolvedAccess.expiresAt` (mất quyền NGAY khi quá hạn)
 * + cron `guests.expire-sweep` quét bù — tránh hai thông báo "sắp hết hạn" (p3-04 và `mentor.ending-soon`) cho cùng một người.
 */
export class WorkspaceMembershipPortImpl implements WorkspaceMembershipPort {
  constructor(
    private readonly channelGrant: ChannelGrantPort,
    private readonly lifecycle: Pick<MembershipLifecycleService, "revokeGuestBySystem">
  ) {}

  async statusOf(workspaceId: string, userId: string): Promise<WorkspaceMembershipStatus | null> {
    const row = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { status: true },
    });
    return row?.status ?? null;
  }

  async grantGuestInTx(tx: Prisma.TransactionClient, input: GuestGrantInput): Promise<GuestGrantResult> {
    const { workspaceId, userId } = input;
    const current = await tx.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (current?.status === "ACTIVE") return { ok: false, reason: "ALREADY_MEMBER" };
    if (current?.status === "PENDING") return { ok: false, reason: "PENDING" };
    if (current?.status === "BANNED") return { ok: false, reason: "BANNED" };

    const now = new Date();
    const shared = {
      role: "GUEST" as const,
      status: "ACTIVE" as const,
      joinedAt: now,
      leftAt: null,
      leftReason: null,
      removedBy: null,
      banReason: null,
      expiresAt: input.expiresAt,
      invitedBy: input.grantedBy,
      invitationId: null,
      requestMessage: null,
      requestedAt: null,
      decidedBy: null,
      decidedAt: null,
      displayTag: input.displayTag,
    };
    await tx.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      create: { workspaceId, userId, expiryVersion: 1, ...shared },
      update: { ...shared, expiryVersion: { increment: 1 } },
    });
    const change = await this.channelGrant.grantMemberInTx(tx, { workspaceId, userId, channelIds: input.channelIds, actorId: input.grantedBy });
    await tx.workspace.update({ where: { id: workspaceId }, data: { memberCount: { increment: 1 }, lastActivityAt: now } });
    await outbox.add(tx, {
      type: "membership.joined",
      aggregateType: "WorkspaceMembership",
      aggregateId: `${workspaceId}:${userId}`,
      queue: "notifications",
      jobName: "membership.events",
      dedupeKey: `membership.joined:${workspaceId}:${userId}:${input.via}:${now.getTime()}`,
      payload: { event: "joined", workspaceId, userId, role: "GUEST", via: input.via },
    });
    const handle: GuestChangeHandle = {
      workspaceId,
      userId,
      channelIds: [...change.granted, ...change.already],
      skipped: change.skipped,
      internal: change,
    };
    return { ok: true, handle };
  }

  async updateGuestExpiryInTx(
    tx: Prisma.TransactionClient,
    input: { workspaceId: string; userId: string; expiresAt: Date }
  ): Promise<boolean> {
    const { workspaceId, userId } = input;
    const claim = await tx.workspaceMembership.updateMany({
      where: { workspaceId, userId, status: "ACTIVE", role: "GUEST" },
      data: { expiresAt: input.expiresAt, expiryVersion: { increment: 1 } },
    });
    if (claim.count === 0) return false;
    await outbox.add(tx, {
      type: "membership.guest-updated",
      aggregateType: "WorkspaceMembership",
      aggregateId: `${workspaceId}:${userId}`,
      queue: "notifications",
      jobName: "membership.events",
      dedupeKey: `membership.guest-updated:${workspaceId}:${userId}:${input.expiresAt.getTime()}`,
      payload: { event: "guest-updated", workspaceId, userId },
    });
    return true;
  }

  async afterGuestChange(handle: Pick<GuestChangeHandle, "workspaceId" | "userId" | "internal">): Promise<void> {
    await permissionService.bumpVersion({ type: "WORKSPACE", id: handle.workspaceId });
    const change = handle.internal as ChannelGrantChange | null | undefined;
    if (change && typeof change === "object" && Array.isArray(change.granted)) await this.channelGrant.afterCommit(change);
  }

  async revokeGuest(workspaceId: string, userId: string, reason: GuestRevokeReason): Promise<"REVOKED" | "SKIPPED"> {
    const result = await this.lifecycle.revokeGuestBySystem(workspaceId, userId, reason);
    // Nhãn chỉ có nghĩa khi đang là cố vấn — xoá cả khi đã bị gỡ bằng đường khác (loại/hết hạn p3-04) để lần tham gia sau không mang nhãn cũ.
    await prisma.workspaceMembership.updateMany({
      where: { workspaceId, userId, status: { not: "ACTIVE" }, displayTag: { not: null } },
      data: { displayTag: null },
    });
    return result;
  }
}
