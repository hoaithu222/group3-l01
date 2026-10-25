import type { AuthUser } from "../../../core/types/express";
import { getCollabClient, type CollabHealth, type ICollabClient } from "../../../shared/collab";
import type { IDocumentDirectory } from "../repositories/document-directory.interface";
import type { IDocumentRepository } from "../repositories/document.repository.interface";
import type { ISnapshotRepository } from "../repositories/snapshot.repository.interface";
import type { AuditRecorder } from "./document-ports";
import type { DocumentSnapshotCronService } from "./document-snapshot-cron.service";

export interface LargeDocumentRow {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  /** `null` với tài liệu PRIVATE — admin KHÔNG đọc tiêu đề/nội dung tài liệu riêng tư (admin.md §2.1). */
  title: string | null;
  visibility: "WORKSPACE" | "PRIVATE";
  status: "ACTIVE" | "ARCHIVED";
  stateBytes: number;
  snapshotCount: number;
  lastEditedAt: Date | null;
}

export interface CollabStatsView {
  enabled: boolean;
  /** Số liệu tức thời từ service collab; `null` khi chưa cấu hình/không phản hồi. */
  live: { connections: Record<string, number>; documents: Record<string, number>; pendingStates: number } | null;
}

export interface CollabAdminDeps {
  documents: Pick<IDocumentRepository, "listLargest">;
  snapshots: Pick<ISnapshotRepository, "countByDocuments">;
  directory: Pick<IDocumentDirectory, "workspaceNames">;
  cron: Pick<DocumentSnapshotCronService, "pruneAllAuto">;
  audit: AuditRecorder;
  collab?: ICollabClient;
}

/** Bề mặt vận hành của service collab (admin.md §2.1): sức khoẻ, số liệu, tài liệu lớn (CHỈ metadata), dọn snapshot AUTO. */
export class CollabAdminService {
  constructor(private readonly d: CollabAdminDeps) {}

  private collab(): ICollabClient {
    return this.d.collab ?? getCollabClient();
  }

  async health(): Promise<CollabHealth & { enabled: boolean }> {
    const collab = this.collab();
    return { enabled: collab.enabled(), ...(await collab.health(3000)) };
  }

  async stats(): Promise<CollabStatsView> {
    const collab = this.collab();
    if (!collab.enabled()) return { enabled: false, live: null };
    const res = await collab.stats();
    return { enabled: true, live: res.ok ? res.data : null };
  }

  async largeDocuments(limit: number): Promise<LargeDocumentRow[]> {
    const rows = await this.d.documents.listLargest(limit);
    const [names, counts] = await Promise.all([this.d.directory.workspaceNames([...new Set(rows.map((r) => r.workspaceId))]), this.d.snapshots.countByDocuments(rows.map((r) => r.id))]);
    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      workspaceName: names.get(r.workspaceId) ?? null,
      title: r.visibility === "PRIVATE" ? null : r.title,
      visibility: r.visibility,
      status: r.status,
      stateBytes: r.stateBytes,
      snapshotCount: counts.get(r.id) ?? 0,
      lastEditedAt: r.lastEditedAt,
    }));
  }

  async cleanupSnapshots(admin: AuthUser, reason: string): Promise<{ scanned: number; pruned: number }> {
    const result = await this.d.cron.pruneAllAuto();
    await this.d.audit.record({
      actorId: admin.id,
      ...(admin.role ? { actorRole: admin.role } : {}),
      action: "collab.cleanup-snapshots",
      targetType: "CollabService",
      targetId: "collab",
      reason,
      metadata: result,
    });
    return result;
  }
}
