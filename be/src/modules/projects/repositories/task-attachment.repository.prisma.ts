import type { ITaskAttachmentRepository, TaskAttachmentRow } from "./task-attachment.repository.interface";
import { db } from "./prisma-tx";

type LinkTarget = "TASK" | "TASK_COMMENT";

export class PrismaTaskAttachmentRepository implements ITaskAttachmentRepository {
  /** Link + asset READY, giữ thứ tự gắn (cũ → mới). Một truy vấn link + một truy vấn asset cho cả lô. */
  private async rows(targetType: LinkTarget, targetIds: string[]): Promise<{ targetId: string; row: TaskAttachmentRow }[]> {
    if (targetIds.length === 0) return [];
    const client = db();
    const links = await client.assetLink.findMany({
      where: { targetType, targetId: { in: targetIds } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (links.length === 0) return [];
    const assets = await client.asset.findMany({
      where: { id: { in: [...new Set(links.map((l) => l.assetId))] }, status: "READY" },
    });
    const byId = new Map(assets.map((a) => [a.id, a]));
    return links.flatMap((l) => {
      const a = byId.get(l.assetId);
      if (!a) return [];
      return [
        {
          targetId: l.targetId,
          row: {
            assetId: a.id,
            originalName: a.originalName,
            mime: a.mime,
            size: a.size ?? null,
            kind: a.kind,
            hasThumbnail: a.thumbnailAssetId !== null,
            attachedBy: l.createdBy,
            createdAt: l.createdAt,
          },
        },
      ];
    });
  }

  async listForTask(taskId: string): Promise<TaskAttachmentRow[]> {
    return (await this.rows("TASK", [taskId])).map((r) => r.row);
  }

  async listForComments(commentIds: string[]): Promise<Map<string, TaskAttachmentRow[]>> {
    const out = new Map<string, TaskAttachmentRow[]>();
    for (const { targetId, row } of await this.rows("TASK_COMMENT", commentIds)) {
      out.set(targetId, [...(out.get(targetId) ?? []), row]);
    }
    return out;
  }

  async findTaskLink(taskId: string, assetId: string): Promise<{ assetId: string; createdBy: string } | null> {
    const l = await db().assetLink.findFirst({ where: { targetType: "TASK", targetId: taskId, assetId } });
    return l ? { assetId: l.assetId, createdBy: l.createdBy } : null;
  }
}
