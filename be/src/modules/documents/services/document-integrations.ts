import { randomUUID } from "node:crypto";
import { createAssetLifecycleService, createAssetLinkService } from "../../assets/public";
import { notify, registerNotificationType } from "../../notifications/public";
import type { NotificationTypeDef } from "../../notifications/public";
import type { IDocumentAssetPort, IDocumentNotifier } from "./document-ports";
import type { DocumentEntity } from "../entities/document.interface";
import type { TxHandle } from "../repositories/tx";

export const DOCUMENT_NOTIFICATION_TYPES = { COLLABORATOR_ADDED: "document.collaborator-added" } as const;

/** Idempotent (registry `Map.set`) — gọi ở CẢ API (`registerDocumentsModule()`) lẫn worker (import file job). */
export function registerDocumentNotificationTypes(): void {
  const def: NotificationTypeDef = {
    type: DOCUMENT_NOTIFICATION_TYPES.COLLABORATOR_ADDED,
    inbox: true,
    inboxFilter: "all",
    pushType: DOCUMENT_NOTIFICATION_TYPES.COLLABORATOR_ADDED,
    androidChannel: "default",
    priority: 1,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    // Khách cũng được mời → chỉ cần thấy nhóm (không cần quyền kho tài liệu). `refs` chỉ chứa id, không tiêu đề (tài liệu PRIVATE).
    readAction: "workspace.read",
    personal: true,
    respectBlock: true,
    push: {
      dataKeys: ["workspaceId", "documentId"],
      collapseKey: (refs) => `document:${String(refs["documentId"] ?? "")}`,
      template: () => ({ title: "Bạn được mời cùng soạn một tài liệu", body: "Mở ứng dụng để xem tài liệu" }),
    },
  };
  registerNotificationType(def);
}

export class PrismaDocumentNotifier implements IDocumentNotifier {
  async collaboratorsAdded(tx: TxHandle, input: { doc: DocumentEntity; actorId: string; userIds: string[]; role: "EDITOR" | "VIEWER" }): Promise<void> {
    const recipients = input.userIds.filter((id) => id !== input.actorId).map((userId) => ({ userId }));
    if (recipients.length === 0) return;
    await notify(tx, {
      type: DOCUMENT_NOTIFICATION_TYPES.COLLABORATOR_ADDED,
      actorId: input.actorId,
      scope: { type: "WORKSPACE", id: input.doc.workspaceId },
      workspaceId: input.doc.workspaceId,
      source: { type: "document", id: input.doc.id },
      refs: { workspaceId: input.doc.workspaceId, documentId: input.doc.id, role: input.role },
      recipients,
      // Mỗi lần mời là MỘT thông báo mới (mời lại sau khi gỡ vẫn báo); transaction thất bại bị hoàn tác nên khoá ngẫu nhiên không tạo trùng.
      dedupeKey: `doc-collab:${input.doc.id}:${randomUUID().slice(0, 8)}`,
    });
  }
}

/** Gắn ảnh chèn vào tài liệu: kiểm asset qua `AssetLifecycleService.getForAttach`, gắn `AssetLink{DOCUMENT}` bằng `AssetLinkService.attach` trong transaction của caller. */
export class PrismaDocumentAssetPort implements IDocumentAssetPort {
  private readonly lifecycle = createAssetLifecycleService();
  private readonly links = createAssetLinkService();

  async find(assetId: string) {
    const found = await this.lifecycle.getForAttach(assetId);
    return found ? { scope: found.asset.scope, kind: found.asset.kind, status: found.asset.status, ownerId: found.asset.ownerId } : null;
  }

  attach(tx: TxHandle, input: { assetId: string; documentId: string; workspaceId: string; actorId: string }): Promise<void> {
    return this.links.attach(tx, {
      assetIds: [input.assetId],
      targetType: "DOCUMENT",
      targetId: input.documentId,
      scopeType: "WORKSPACE",
      scopeId: input.workspaceId,
      actorId: input.actorId,
    });
  }
}
