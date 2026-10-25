import { permissionService, revokeScope } from "../../../core/permission";
import { AppError, ScopeNotFoundError, ValidationError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { AuthUser } from "../../../core/types/express";
import type { CursorPage, DocumentDetailView, DocumentEntity, DocumentView } from "../entities/document.interface";
import type { ArchiveDocumentDto, CreateDocumentDto, ListDocumentsQueryDto, UpdateDocumentDto } from "../dtos";
import type { ICollaboratorRepository } from "../repositories/collaborator.repository.interface";
import type { IDocumentDirectory } from "../repositories/document-directory.interface";
import type { IDocumentRepository } from "../repositories/document.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import { documentErrors } from "../documents.errors";
import { getDocumentLimits } from "./document-limits";
import { writeAccessRevoked, writeDocumentUpdated } from "./document-events";
import type { AuditRecorder } from "./document-ports";
import { myRoleOf, toDocumentDetailView, toDocumentView } from "./document-presenter";

export interface DocumentsServiceDeps {
  documents: IDocumentRepository;
  collaborators: ICollaboratorRepository;
  directory: IDocumentDirectory;
  tx: ITxRunner;
  outbox: IOutboxPort;
  audit: AuditRecorder;
  now?: () => Date;
}

/** Tài liệu trong workspace: tạo/liệt kê/xem/đổi tên-visibility/lưu trữ. Quyền LUÔN qua `permissionService` (scope DOCUMENT) — 404 trung tính khi không thấy. */
export class DocumentsService {
  constructor(private readonly d: DocumentsServiceDeps) {}

  private now(): Date {
    return this.d.now?.() ?? new Date();
  }

  async create(actor: AuthUser, workspaceId: string, dto: CreateDocumentDto): Promise<DocumentDetailView> {
    const ws = await permissionService.resolve(actor, { type: "WORKSPACE", id: workspaceId });
    if (!ws.visible || !ws.role || ws.role === "GUEST") throw documentErrors.notFound();
    if ((await this.d.directory.workspaceStatus(workspaceId)) !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.WS_002], 403, ErrorCode.WS_002);
    const limits = await getDocumentLimits();
    if ((await this.d.documents.countActive(workspaceId)) >= limits.perWorkspaceMax) throw documentErrors.tooManyDocuments(limits.perWorkspaceMax);

    const doc = await this.d.tx.run(async (tx) => {
      const created = await this.d.documents.create(
        { workspaceId, title: dto.title, normalizedTitle: normalizeSearch(dto.title), visibility: dto.visibility, createdBy: actor.id },
        tx
      );
      await writeDocumentUpdated(this.d.outbox, tx, created);
      return created;
    });
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role ? { actorRole: actor.role } : {}),
      action: "document.create",
      targetType: "Document",
      targetId: doc.id,
      workspaceId,
      metadata: { visibility: doc.visibility },
    });
    return this.detail(actor, doc.id);
  }

  async list(actor: AuthUser, workspaceId: string, query: ListDocumentsQueryDto): Promise<CursorPage<DocumentView>> {
    const ws = await permissionService.resolve(actor, { type: "WORKSPACE", id: workspaceId });
    if (!ws.visible || !ws.role) throw documentErrors.notFound();
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw new ValidationError("Cursor không hợp lệ");

    const rows = await this.d.documents.list({
      workspaceId,
      userId: actor.id,
      seesWorkspaceDocs: ws.role !== "GUEST",
      status: query.status,
      ...(query.q ? { q: normalizeSearch(query.q) } : {}),
      cursor,
      limit: query.limit,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const [roles, people] = await Promise.all([
      this.d.collaborators.rolesOfUser(actor.id, page.map((r) => r.id)),
      this.d.directory.users(page.flatMap((r) => (r.lastEditedBy ? [r.lastEditedBy] : []))),
    ]);
    const last = page[page.length - 1];
    return {
      data: page.map((doc) => toDocumentView(doc, myRoleOf(actor.id, doc, roles.has(doc.id) ? { role: roles.get(doc.id) ?? "VIEWER" } : null), people)),
      nextCursor: hasMore && last ? encodeCursor(last.updatedAt, last.id) : null,
      hasMore,
      limit: query.limit,
    };
  }

  get(actor: AuthUser, id: string): Promise<DocumentDetailView> {
    return this.detail(actor, id);
  }

  async update(actor: AuthUser, id: string, dto: UpdateDocumentDto): Promise<DocumentDetailView> {
    await permissionService.assert(actor, "document.manage", { type: "DOCUMENT", id });
    const doc = await this.mustFind(id);
    if (doc.status === "ARCHIVED") throw documentErrors.archived();
    if (dto.expectedVersion !== doc.version) throw documentErrors.versionConflict(doc.version);

    const visibilityChanged = dto.visibility !== undefined && dto.visibility !== doc.visibility;
    if (visibilityChanged && dto.visibility === "WORKSPACE" && dto.confirmPublic !== true) throw documentErrors.confirmPublicRequired();
    // Chỉ NGƯỜI TẠO được đặt riêng tư: quản trị nhóm đặt PRIVATE sẽ tự khoá mình ra khỏi tài liệu (nguyên tắc kênh riêng tư).
    if (visibilityChanged && dto.visibility === "PRIVATE" && doc.createdBy !== actor.id) {
      throw new AppError(ErrorMessages[ErrorCode.PERM_001], 403, ErrorCode.PERM_001);
    }

    const updated = await this.d.tx.run(async (tx) => {
      const next = await this.d.documents.updateMeta(
        id,
        dto.expectedVersion,
        {
          ...(dto.title !== undefined ? { title: dto.title, normalizedTitle: normalizeSearch(dto.title) } : {}),
          ...(visibilityChanged && dto.visibility ? { visibility: dto.visibility } : {}),
        },
        tx
      );
      if (!next) return null;
      await writeDocumentUpdated(this.d.outbox, tx, next);
      return next;
    });
    if (!updated) throw documentErrors.versionConflict((await this.mustFind(id)).version);

    if (visibilityChanged) await this.afterVisibilityChange(updated);
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role ? { actorRole: actor.role } : {}),
      action: "document.update",
      targetType: "Document",
      targetId: id,
      workspaceId: updated.workspaceId,
      metadata: { renamed: dto.title !== undefined, ...(visibilityChanged ? { visibilityFrom: doc.visibility, visibilityTo: updated.visibility } : {}) },
    });
    return this.detail(actor, id);
  }

  async archive(actor: AuthUser, id: string, dto: ArchiveDocumentDto): Promise<DocumentDetailView> {
    await permissionService.assert(actor, "document.manage", { type: "DOCUMENT", id });
    const doc = await this.mustFind(id);
    if (doc.status === "ARCHIVED") return this.detail(actor, id);

    const archived = await this.d.tx.run(async (tx) => {
      const next = await this.d.documents.updateMeta(id, doc.version, { status: "ARCHIVED", archivedAt: this.now() }, tx);
      if (!next) return null;
      await writeDocumentUpdated(this.d.outbox, tx, next);
      // Đóng mọi kết nối đang soạn: nối lại sẽ vào chế độ chỉ xem (collab đọc chế độ từ BE).
      await writeAccessRevoked(this.d.outbox, tx, { documentId: id, reason: "archived" }, `archived:v${next.version}`);
      return next;
    });
    if (!archived) throw documentErrors.versionConflict((await this.mustFind(id)).version);
    await permissionService.bumpVersion({ type: "DOCUMENT", id });
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role ? { actorRole: actor.role } : {}),
      action: "document.archive",
      targetType: "Document",
      targetId: id,
      workspaceId: archived.workspaceId,
      ...(dto.reason ? { reason: dto.reason } : {}),
    });
    return this.detail(actor, id);
  }

  async unarchive(actor: AuthUser, id: string, dto: ArchiveDocumentDto): Promise<DocumentDetailView> {
    await permissionService.assert(actor, "document.manage", { type: "DOCUMENT", id });
    const doc = await this.mustFind(id);
    if (doc.status === "ACTIVE") return this.detail(actor, id);
    const limits = await getDocumentLimits();
    if ((await this.d.documents.countActive(doc.workspaceId)) >= limits.perWorkspaceMax) throw documentErrors.tooManyDocuments(limits.perWorkspaceMax);

    const restored = await this.d.tx.run(async (tx) => {
      const next = await this.d.documents.updateMeta(id, doc.version, { status: "ACTIVE", archivedAt: null }, tx);
      if (!next) return null;
      await writeDocumentUpdated(this.d.outbox, tx, next);
      // Người đang xem ở chế độ chỉ xem nối lại để lấy lại quyền sửa.
      await writeAccessRevoked(this.d.outbox, tx, { documentId: id, reason: "revoked" }, `unarchived:v${next.version}`);
      return next;
    });
    if (!restored) throw documentErrors.versionConflict((await this.mustFind(id)).version);
    await permissionService.bumpVersion({ type: "DOCUMENT", id });
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role ? { actorRole: actor.role } : {}),
      action: "document.unarchive",
      targetType: "Document",
      targetId: id,
      workspaceId: restored.workspaceId,
      ...(dto.reason ? { reason: dto.reason } : {}),
    });
    return this.detail(actor, id);
  }

  /** Chi tiết + `myPermissions` do server tính. Không trả `yjsState`. */
  private async detail(actor: AuthUser, id: string): Promise<DocumentDetailView> {
    const access = await permissionService.assert(actor, "document.read", { type: "DOCUMENT", id });
    const doc = await this.mustFind(id);
    const [collaborator, people] = await Promise.all([
      this.d.collaborators.find(id, actor.id),
      this.d.directory.users(doc.lastEditedBy ? [doc.lastEditedBy] : []),
    ]);
    return toDocumentDetailView(doc, myRoleOf(actor.id, doc, collaborator), people, access);
  }

  private async mustFind(id: string): Promise<DocumentEntity> {
    const doc = await this.d.documents.findById(id);
    if (!doc) throw new ScopeNotFoundError();
    return doc;
  }

  /**
   * Sau khi đổi visibility: xoá cache quyền; đổi sang PRIVATE thì thành viên nhóm KHÔNG phải người tạo/cộng tác viên mất quyền ngay —
   * `revokeScope` bump version + báo `permission:revoked` + (listener) đóng kết nối collab của họ.
   */
  private async afterVisibilityChange(doc: DocumentEntity): Promise<void> {
    await permissionService.bumpVersion({ type: "DOCUMENT", id: doc.id });
    if (doc.visibility !== "PRIVATE") return;
    const [members, collaboratorIds] = await Promise.all([this.d.directory.activeMemberIds(doc.workspaceId), this.d.collaborators.userIdsOfDocument(doc.id)]);
    const keep = new Set([doc.createdBy, ...collaboratorIds]);
    const lost = members.filter((id) => !keep.has(id));
    if (lost.length > 0) await revokeScope({ scope: { type: "DOCUMENT", id: doc.id }, userIds: lost, reason: "GRANT_REVOKED", cascade: false });
  }
}
