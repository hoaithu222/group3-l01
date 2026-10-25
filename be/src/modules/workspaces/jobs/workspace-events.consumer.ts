import { registerJob } from "../../../infrastructure/queue";
import { prisma } from "../../../infrastructure/database";
import { emitToScope, emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { logger } from "../../../infrastructure/logger";
import { workspaceImagesOf } from "../services/workspace.presenter";

interface WorkspaceEventPayload {
  event: "created" | "updated" | "archived" | "restored" | "owner-transferred";
  workspaceId: string;
  ownerId?: string;
  reason?: "MANUAL" | "PLATFORM";
  fromUserId?: string;
  toUserId?: string;
}

/**
 * `workspace.events` (queue `notifications`) — relay outbox → socket, bảng
 * README p1-01 §6. Audit ghi đồng bộ trong transaction (`workspace-lifecycle.service.ts`),
 * job này CHỈ lo fan-out realtime — tách khỏi ghi DB để retry an toàn (emit
 * lặp vô hại, be.md §7 "Idempotent: socket emit lặp vô hại").
 */
registerJob("notifications", "workspace.events", async (job) => {
  const payload = job.data as WorkspaceEventPayload;
  const workspace = await prisma.workspace.findUnique({ where: { id: payload.workspaceId } });
  if (!workspace) {
    logger.warn("[workspace.events] workspace không còn tồn tại, bỏ qua", { workspaceId: payload.workspaceId });
    return;
  }

  switch (payload.event) {
    case "created": {
      if (payload.ownerId) {
        emitToUsers([payload.ownerId], "workspace:updated", {
          id: workspace.id,
          name: workspace.name,
          description: workspace.description,
          ...workspaceImagesOf(workspace),
          version: workspace.version,
        });
      }
      break;
    }
    case "updated": {
      // Ảnh (avatar/bìa/mẫu nền) đi kèm để màn đang mở vá cache ngay, không phải tải lại chi tiết nhóm.
      await emitToScope(
        { type: "WORKSPACE", id: workspace.id },
        "workspace:updated",
        {
          id: workspace.id,
          name: workspace.name,
          description: workspace.description,
          ...workspaceImagesOf(workspace),
          version: workspace.version,
        }
      );
      break;
    }
    case "archived": {
      await emitToScope(
        { type: "WORKSPACE", id: workspace.id },
        "workspace:archived",
        { id: workspace.id, status: "ARCHIVED", archivedReason: workspace.archivedReason }
      );
      break;
    }
    case "restored": {
      await emitToScope(
        { type: "WORKSPACE", id: workspace.id },
        "workspace:updated",
        { id: workspace.id, status: "ACTIVE", version: workspace.version }
      );
      break;
    }
    case "owner-transferred": {
      if (payload.fromUserId && payload.toUserId) {
        const memberships = await prisma.workspaceMembership.findMany({
          where: { workspaceId: workspace.id, userId: { in: [payload.fromUserId, payload.toUserId] } },
        });
        for (const m of memberships) {
          await emitToScope(
            { type: "WORKSPACE", id: workspace.id },
            "member:updated",
            { workspaceId: workspace.id, userId: m.userId, role: m.role, status: m.status }
          );
        }
      }
      break;
    }
  }
});
