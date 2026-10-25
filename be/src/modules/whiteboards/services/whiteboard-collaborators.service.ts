import { randomUUID } from "node:crypto";
import { permissionService, revokeScope } from "../../../core/permission";
import { ScopeNotFoundError, ValidationError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { CollaboratorEntity, CollaboratorRoleValue, PersonRef, WhiteboardEntity } from "../entities/whiteboard.interface";
import type { AddCollaboratorsDto } from "../dtos";
import type { ICollaboratorRepository } from "../repositories/collaborator.repository.interface";
import type { IWhiteboardDirectory } from "../repositories/whiteboard-directory.interface";
import type { IWhiteboardRepository } from "../repositories/whiteboard.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import { whiteboardErrors } from "../whiteboards.errors";
import { getWhiteboardLimits } from "./whiteboard-limits";
import { writeWhiteboardUpdated } from "./whiteboard-events";
import type { AuditRecorder } from "./whiteboard-ports";

export interface CollaboratorView {
  userId: string;
  name: string;
  role: CollaboratorRoleValue;
  addedAt: Date;
}

export interface WhiteboardCollaboratorsDeps {
  whiteboards: IWhiteboardRepository;
  collaborators: ICollaboratorRepository;
  directory: IWhiteboardDirectory;
  tx: ITxRunner;
  outbox: IOutboxPort;
  audit: AuditRecorder;
}

const toView = (c: CollaboratorEntity, people: ReadonlyMap<string, PersonRef>): CollaboratorView => ({
  userId: c.userId,
  name: people.get(c.userId)?.name ?? "Người dùng",
  role: c.role,
  addedAt: c.createdAt,
});

/** Mời/gỡ người cộng tác (bắt buộc với bảng PRIVATE, cần cho khách ở bảng WORKSPACE). Chỉ người có `whiteboard.manage`. P0 chưa có thông báo đẩy khi được mời (bảng hiện trong danh sách qua `whiteboard:updated`). */
export class WhiteboardCollaboratorsService {
  constructor(private readonly d: WhiteboardCollaboratorsDeps) {}

  async list(actor: AuthUser, whiteboardId: string): Promise<CollaboratorView[]> {
    await permissionService.assert(actor, "whiteboard.read", { type: "WHITEBOARD", id: whiteboardId });
    return this.view(whiteboardId);
  }

  async add(actor: AuthUser, whiteboardId: string, dto: AddCollaboratorsDto): Promise<CollaboratorView[]> {
    await permissionService.assert(actor, "whiteboard.manage", { type: "WHITEBOARD", id: whiteboardId });
    const board = await this.mustFind(whiteboardId);
    if (board.status === "ARCHIVED") throw whiteboardErrors.archived();

    // Người tạo luôn có toàn quyền — không tạo dòng cộng tác cho họ.
    const userIds = [...new Set(dto.userIds)].filter((id) => id !== board.createdBy);
    const roles = await this.d.directory.activeRoles(board.workspaceId, userIds);
    const invalid = userIds.filter((id) => !roles.has(id));
    if (invalid.length > 0) throw whiteboardErrors.collaboratorsNotInWorkspace(invalid);

    const limits = await getWhiteboardLimits();
    const existing = new Set(await this.d.collaborators.userIdsOfWhiteboard(whiteboardId));
    if (existing.size + userIds.filter((id) => !existing.has(id)).length > limits.collaboratorsMax) throw whiteboardErrors.tooManyCollaborators(limits.collaboratorsMax);

    const { addedUserIds } = await this.d.tx.run(async (tx) => {
      const result = await this.d.collaborators.upsertMany(whiteboardId, userIds.map((userId) => ({ userId, role: dto.role })), actor.id, tx);
      // Khán giả sự kiện đổi (người mới cần thấy bảng trong danh sách): `version` metadata không đổi nên thêm hậu tố ngẫu nhiên để khoá dedupe duy nhất.
      await writeWhiteboardUpdated(this.d.outbox, tx, { id: board.id, version: board.version }, `c${randomUUID().slice(0, 8)}`);
      return result;
    });
    await permissionService.bumpVersion({ type: "WHITEBOARD", id: whiteboardId });
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role ? { actorRole: actor.role } : {}),
      action: "whiteboard.collaborator.add",
      targetType: "Whiteboard",
      targetId: whiteboardId,
      workspaceId: board.workspaceId,
      metadata: { userIds, role: dto.role, added: addedUserIds.length },
    });
    return this.view(whiteboardId);
  }

  async remove(actor: AuthUser, whiteboardId: string, userId: string): Promise<void> {
    await permissionService.assert(actor, "whiteboard.manage", { type: "WHITEBOARD", id: whiteboardId });
    const board = await this.mustFind(whiteboardId);
    if (userId === board.createdBy) throw new ValidationError("Không thể gỡ người tạo bảng trắng");

    const removed = await this.d.tx.run(async (tx) => {
      const ok = await this.d.collaborators.remove(whiteboardId, userId, tx);
      if (ok) await writeWhiteboardUpdated(this.d.outbox, tx, { id: board.id, version: board.version }, `c${randomUUID().slice(0, 8)}`);
      return ok;
    });
    if (!removed) throw new ScopeNotFoundError();
    // bump version + `permission:revoked` (scopeType WHITEBOARD) + đóng kết nối collab của người đó (listener `whiteboards.collab-kick`).
    await revokeScope({ scope: { type: "WHITEBOARD", id: whiteboardId }, userIds: [userId], reason: "GRANT_REVOKED", cascade: false });
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role ? { actorRole: actor.role } : {}),
      action: "whiteboard.collaborator.remove",
      targetType: "Whiteboard",
      targetId: whiteboardId,
      workspaceId: board.workspaceId,
      metadata: { userId },
    });
  }

  private async view(whiteboardId: string): Promise<CollaboratorView[]> {
    const rows = await this.d.collaborators.list(whiteboardId);
    const people = await this.d.directory.users(rows.map((r) => r.userId));
    return rows.map((r) => toView(r, people));
  }

  private async mustFind(id: string): Promise<WhiteboardEntity> {
    const board = await this.d.whiteboards.findById(id);
    if (!board) throw new ScopeNotFoundError();
    return board;
  }
}
