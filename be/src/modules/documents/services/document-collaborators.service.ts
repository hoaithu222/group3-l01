import { randomUUID } from "node:crypto";
import { permissionService, revokeScope } from "../../../core/permission";
import { ScopeNotFoundError, ValidationError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { CollaboratorEntity, CollaboratorRoleValue, DocumentEntity, PersonRef } from "../entities/document.interface";
import type { AddCollaboratorsDto } from "../dtos";
import type { ICollaboratorRepository } from "../repositories/collaborator.repository.interface";
import type { IDocumentDirectory } from "../repositories/document-directory.interface";
import type { IDocumentRepository } from "../repositories/document.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import { documentErrors } from "../documents.errors";
import { getDocumentLimits } from "./document-limits";
import { writeDocumentUpdated } from "./document-events";
import type { AuditRecorder, IDocumentNotifier } from "./document-ports";

export interface CollaboratorView {
  userId: string;
  name: string;
  role: CollaboratorRoleValue;
  addedAt: Date;
}

export interface DocumentCollaboratorsDeps {
  documents: IDocumentRepository;
  collaborators: ICollaboratorRepository;
  directory: IDocumentDirectory;
  tx: ITxRunner;
  outbox: IOutboxPort;
  notifier: IDocumentNotifier;
  audit: AuditRecorder;
}

const toView = (c: CollaboratorEntity, people: ReadonlyMap<string, PersonRef>): CollaboratorView => ({
  userId: c.userId,
  name: people.get(c.userId)?.name ?? "Người dùng",
  role: c.role,
  addedAt: c.createdAt,
});

/** Mời/gỡ người cộng tác (bắt buộc với tài liệu PRIVATE, cần cho khách ở tài liệu WORKSPACE). Chỉ người có `document.manage`. */
export class DocumentCollaboratorsService {
  constructor(private readonly d: DocumentCollaboratorsDeps) {}

  async list(actor: AuthUser, documentId: string): Promise<CollaboratorView[]> {
    await permissionService.assert(actor, "document.read", { type: "DOCUMENT", id: documentId });
    return this.view(documentId);
  }

  async add(actor: AuthUser, documentId: string, dto: AddCollaboratorsDto): Promise<CollaboratorView[]> {
    await permissionService.assert(actor, "document.manage", { type: "DOCUMENT", id: documentId });
    const doc = await this.mustFind(documentId);
    if (doc.status === "ARCHIVED") throw documentErrors.archived();

    // Người tạo luôn có toàn quyền — không tạo dòng cộng tác cho họ.
    const userIds = [...new Set(dto.userIds)].filter((id) => id !== doc.createdBy);
    const roles = await this.d.directory.activeRoles(doc.workspaceId, userIds);
    const invalid = userIds.filter((id) => !roles.has(id));
    if (invalid.length > 0) throw documentErrors.collaboratorsNotInWorkspace(invalid);

    const limits = await getDocumentLimits();
    const existing = new Set(await this.d.collaborators.userIdsOfDocument(documentId));
    if (existing.size + userIds.filter((id) => !existing.has(id)).length > limits.collaboratorsMax) throw documentErrors.tooManyCollaborators(limits.collaboratorsMax);

    const { addedUserIds } = await this.d.tx.run(async (tx) => {
      const result = await this.d.collaborators.upsertMany(documentId, userIds.map((userId) => ({ userId, role: dto.role })), actor.id, tx);
      if (result.addedUserIds.length > 0) await this.d.notifier.collaboratorsAdded(tx, { doc, actorId: actor.id, userIds: result.addedUserIds, role: dto.role });
      // Khán giả sự kiện đổi (người mới cần thấy tài liệu trong danh sách): `version` metadata không đổi nên thêm hậu tố ngẫu nhiên để khoá dedupe duy nhất.
      await writeDocumentUpdated(this.d.outbox, tx, { id: doc.id, version: doc.version }, `c${randomUUID().slice(0, 8)}`);
      return result;
    });
    await permissionService.bumpVersion({ type: "DOCUMENT", id: documentId });
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role ? { actorRole: actor.role } : {}),
      action: "document.collaborator.add",
      targetType: "Document",
      targetId: documentId,
      workspaceId: doc.workspaceId,
      metadata: { userIds, role: dto.role, added: addedUserIds.length },
    });
    return this.view(documentId);
  }

  async remove(actor: AuthUser, documentId: string, userId: string): Promise<void> {
    await permissionService.assert(actor, "document.manage", { type: "DOCUMENT", id: documentId });
    const doc = await this.mustFind(documentId);
    if (userId === doc.createdBy) throw new ValidationError("Không thể gỡ người tạo tài liệu");

    const removed = await this.d.tx.run(async (tx) => {
      const ok = await this.d.collaborators.remove(documentId, userId, tx);
      if (ok) await writeDocumentUpdated(this.d.outbox, tx, { id: doc.id, version: doc.version }, `c${randomUUID().slice(0, 8)}`);
      return ok;
    });
    if (!removed) throw new ScopeNotFoundError();
    // bump version + `permission:revoked` (scope DOCUMENT) + đóng kết nối collab của người đó (listener `documents.collab-kick`).
    await revokeScope({ scope: { type: "DOCUMENT", id: documentId }, userIds: [userId], reason: "GRANT_REVOKED", cascade: false });
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role ? { actorRole: actor.role } : {}),
      action: "document.collaborator.remove",
      targetType: "Document",
      targetId: documentId,
      workspaceId: doc.workspaceId,
      metadata: { userId },
    });
  }

  private async view(documentId: string): Promise<CollaboratorView[]> {
    const rows = await this.d.collaborators.list(documentId);
    const people = await this.d.directory.users(rows.map((r) => r.userId));
    return rows.map((r) => toView(r, people));
  }

  private async mustFind(id: string): Promise<DocumentEntity> {
    const doc = await this.d.documents.findById(id);
    if (!doc) throw new ScopeNotFoundError();
    return doc;
  }
}
