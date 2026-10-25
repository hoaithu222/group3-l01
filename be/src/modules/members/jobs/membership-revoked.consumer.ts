import { registerJob } from "../../../infrastructure/queue";
import { emitToScope, emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { prisma } from "../../../infrastructure/database";
import { logger } from "../../../infrastructure/logger";

interface MembershipEventPayload {
  event: "joined" | "role-changed" | "revoked" | "displayName-changed" | "invite-created" | "invite-revoked" | "guest-updated";
  workspaceId: string;
  userId?: string;
  role?: string;
  status?: string;
}

/**
 * `membership.events` (queue `notifications`) — relay outbox → socket `member:updated`
 * (be.md p1-02 §6/§7). Ghi audit/DB đã xong đồng bộ trong transaction gọi mở
 * (`membership-lifecycle.service.ts`/`invite.service.ts`) — job này CHỈ lo
 * fan-out realtime, tách khỏi ghi DB để retry an toàn (emit lặp vô hại).
 */
registerJob("notifications", "membership.events", async (job) => {
  const payload = job.data as MembershipEventPayload;

  if (payload.event === "invite-created" || payload.event === "invite-revoked" || !payload.userId) {
    return; // không có `member:updated` để phát (chỉ audit/thống kê lời mời)
  }

  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: payload.workspaceId, userId: payload.userId } },
  });
  if (!membership) {
    logger.warn("[membership.events] membership không còn tồn tại, bỏ qua", {
      workspaceId: payload.workspaceId,
      userId: payload.userId,
    });
    return;
  }

  await emitToScope({ type: "WORKSPACE", id: payload.workspaceId }, "member:updated", {
    workspaceId: payload.workspaceId,
    userId: payload.userId,
    role: membership.role,
    status: membership.status,
    displayName: membership.displayName,
    // p6-03 — nhãn "Cố vấn" (chữ, không phải quyền); chỉ có khi membership mang nhãn (payload cũ giữ nguyên).
    ...(membership.displayTag && { displayTag: membership.displayTag }),
  });

  // p3-04 §6 — hạn của KHÁCH chỉ gửi cho OWNER/ADMIN (qua `user:`), KHÔNG vào `ws:{id}` mà mọi thành viên nhận.
  if (membership.role === "GUEST" && membership.expiresAt) {
    const admins = await prisma.workspaceMembership.findMany({
      where: { workspaceId: payload.workspaceId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });
    if (admins.length > 0) {
      emitToUsers(
        admins.map((a) => a.userId),
        "member:updated",
        {
          workspaceId: payload.workspaceId,
          userId: payload.userId,
          role: membership.role,
          status: membership.status,
          displayName: membership.displayName,
          expiresAt: membership.expiresAt.toISOString(),
        }
      );
    }
  }
});
