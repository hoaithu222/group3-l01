import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket";
import type { ICollaboratorRepository } from "../repositories/collaborator.repository.interface";
import type { IDocumentDirectory } from "../repositories/document-directory.interface";
import type { IDocumentRepository } from "../repositories/document.repository.interface";
import type { DocumentEventPayload } from "./document-events";

/**
 * Consumer outbox `document.events` (queue `notifications`): phát `document:updated` `{ id, workspaceId, title, visibility, status, version, lastEditedAt }`
 * TỚI TỪNG NGƯỜI (`user:{id}`), không vào room `ws:{id}` — vì khán giả tính theo trạng thái HIỆN TẠI của tài liệu:
 *   WORKSPACE → mọi thành viên MEMBER+ (khách không được biết, trừ khi là cộng tác viên) + người tạo + cộng tác viên;
 *   PRIVATE   → CHỈ người tạo + cộng tác viên (quản trị nhóm không tự thấy).
 * Nội dung không đi qua socket (chỉ metadata). Emit lặp vô hại (client so `version`).
 */
export class DocumentEventsPublisher {
  constructor(
    private readonly documents: Pick<IDocumentRepository, "findById">,
    private readonly collaborators: Pick<ICollaboratorRepository, "userIdsOfDocument">,
    private readonly directory: Pick<IDocumentDirectory, "activeMemberIds">,
    private readonly emit: (userIds: string[], event: string, payload: object) => void = (ids, event, payload) => emitToUsers(ids, event, payload)
  ) {}

  async publish(payload: DocumentEventPayload): Promise<string[]> {
    const doc = await this.documents.findById(payload.documentId);
    if (!doc) return [];
    const audience = new Set<string>([doc.createdBy, ...(await this.collaborators.userIdsOfDocument(doc.id))]);
    if (doc.visibility === "WORKSPACE") for (const id of await this.directory.activeMemberIds(doc.workspaceId)) audience.add(id);
    const userIds = [...audience];
    this.emit(userIds, SocketEvent.DOCUMENT_UPDATED, {
      id: doc.id,
      workspaceId: doc.workspaceId,
      title: doc.title,
      visibility: doc.visibility,
      status: doc.status,
      version: doc.version,
      lastEditedAt: doc.lastEditedAt,
    });
    return userIds;
  }
}
