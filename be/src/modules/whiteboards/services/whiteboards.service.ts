import { permissionService, revokeScope } from "../../../core/permission";
import { AppError, ScopeNotFoundError, ValidationError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { normalizeSearch } from "../../../core/utils/normalize";
import { logger } from "../../../infrastructure/logger";
import type { AuthUser } from "../../../core/types/express";
import type { CursorPage, WhiteboardDetailView, WhiteboardEntity, WhiteboardView } from "../entities/whiteboard.interface";
import type { ArchiveWhiteboardDto, CreateWhiteboardDto, ListWhiteboardsQueryDto, UpdateWhiteboardDto } from "../dtos";
import type { ICollaboratorRepository } from "../repositories/collaborator.repository.interface";
import type { IWhiteboardDirectory } from "../repositories/whiteboard-directory.interface";
import type { IWhiteboardRepository } from "../repositories/whiteboard.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import { whiteboardErrors } from "../whiteboards.errors";
import { writeAccessRevoked, writeWhiteboardUpdated } from "./whiteboard-events";
import { getWhiteboardLimits } from "./whiteboard-limits";
import type { AuditRecorder, IWhiteboardAssetPort } from "./whiteboard-ports";
import { myRoleOf, toWhiteboardDetailView, toWhiteboardView } from "./whiteboard-presenter";

export interface WhiteboardsServiceDeps {
  whiteboards: IWhiteboardRepository;
  collaborators: ICollaboratorRepository;
  directory: IWhiteboardDirectory;
  assets: IWhiteboardAssetPort;
  tx: ITxRunner;
  outbox: IOutboxPort;
  audit: AuditRecorder;
  now?: () => Date;
}

/** Bảng trắng trong workspace: tạo/liệt kê/xem/đổi tên-visibility-ảnh thu nhỏ/lưu trữ. Quyền LUÔN qua `permissionService` (scope WHITEBOARD) — 404 trung tính khi không thấy. */
export class WhiteboardsService {
  constructor(private readonly d: WhiteboardsServiceDeps) {}

  private now(): Date {
    return this.d.now?.() ?? new Date();
  }

  async create(actor: AuthUser, workspaceId: string, dto: CreateWhiteboardDto): Promise<WhiteboardDetailView> {
    const ws = await permissionService.resolve(actor, { type: "WORKSPACE", id: workspaceId });
    if (!ws.visible || !ws.role || ws.role === "GUEST") throw whiteboardErrors.notFound();
    if ((await this.d.directory.workspaceStatus(workspaceId)) !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.WS_002], 403, ErrorCode.WS_002);
    const limits = await getWhiteboardLimits();
    if ((await this.d.whiteboards.countActive(workspaceId)) >= limits.perWorkspaceMax) throw whiteboardErrors.tooManyWhiteboards(limits.perWorkspaceMax);

    const board = await this.d.tx.run(async (tx) => {
      const created = await this.d.whiteboards.create(
        { workspaceId, name: dto.name, normalizedName: normalizeSearch(dto.name), visibility: dto.visibility, createdBy: actor.id },
        tx
      );
      await writeWhiteboardUpdated(this.d.outbox, tx, created);
      return created;
    });
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role ? { actorRole: actor.role } : {}),
      action: "whiteboard.create",
      targetType: "Whiteboard",
      targetId: board.id,
      workspaceId,
      metadata: { visibility: board.visibility },
    });
    return this.detail(actor, board.id);
  }

  async list(actor: AuthUser, workspaceId: string, query: ListWhiteboardsQueryDto): Promise<CursorPage<WhiteboardView>> {
    const ws = await permissionService.resolve(actor, { type: "WORKSPACE", id: workspaceId });
    if (!ws.visible || !ws.role) throw whiteboardErrors.notFound();
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw new ValidationError("Cursor không hợp lệ");

    const rows = await this.d.whiteboards.list({
      workspaceId,
      userId: actor.id,
      seesWorkspaceBoards: ws.role !== "GUEST",
      status: query.status,
      ...(query.q ? { q: normalizeSearch(query.q) } : {}),
      cursor,
      limit: query.limit,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const [roles, people, thumbnails] = await Promise.all([
      this.d.collaborators.rolesOfUser(actor.id, page.map((r) => r.id)),
      this.d.directory.users(page.flatMap((r) => (r.lastEditedBy ? [r.lastEditedBy] : []))),
      this.thumbnailUrls(page.flatMap((r) => (r.thumbnailAssetId ? [r.thumbnailAssetId] : []))),
    ]);
    const last = page[page.length - 1];
    return {
      data: page.map((board) => toWhiteboardView(board, myRoleOf(actor.id, board, roles.has(board.id) ? { role: roles.get(board.id) ?? "VIEWER" } : null), people, thumbnails)),
      nextCursor: hasMore && last ? encodeCursor(last.updatedAt, last.id) : null,
      hasMore,
      limit: query.limit,
    };
  }

  get(actor: AuthUser, id: string): Promise<WhiteboardDetailView> {
    return this.detail(actor, id);
  }

  /**
   * `name`/`visibility` cần `whiteboard.manage`; CHỈ `thumbnailAssetId` thì `whiteboard.edit` là đủ. Ảnh thu nhỏ phải là asset scope `WHITEBOARD`, kind IMAGE, READY, của CHÍNH người gắn
   * (`WB_002` cho mọi trường hợp sai — không lộ asset của người khác có tồn tại hay không); link cũ bị gỡ (asset cũ thành mồ côi → `assets.cleanup` dọn sau ân hạn).
   */
  async update(actor: AuthUser, id: string, dto: UpdateWhiteboardDto): Promise<WhiteboardDetailView> {
    const changesMeta = dto.name !== undefined || dto.visibility !== undefined;
    // DTO đã chặn (refine); giữ ở service để gọi trực tiếp không tăng `version` vô nghĩa và không bỏ qua bước kiểm quyền.
    if (!changesMeta && dto.thumbnailAssetId === undefined) throw new ValidationError("Cần ít nhất một trường thay đổi");
    if (changesMeta) await permissionService.assert(actor, "whiteboard.manage", { type: "WHITEBOARD", id });
    if (dto.thumbnailAssetId !== undefined) await permissionService.assert(actor, "whiteboard.edit", { type: "WHITEBOARD", id });
    const board = await this.mustFind(id);
    if (board.status === "ARCHIVED") throw whiteboardErrors.archived();
    if (dto.expectedVersion !== board.version) throw whiteboardErrors.versionConflict(board.version);

    const visibilityChanged = dto.visibility !== undefined && dto.visibility !== board.visibility;
    if (visibilityChanged && dto.visibility === "WORKSPACE" && dto.confirmPublic !== true) {
      throw new ValidationError("Chuyển bảng trắng riêng tư thành công khai cần xác nhận (confirmPublic: true)", { field: "confirmPublic" });
    }
    // Chỉ NGƯỜI TẠO được đặt riêng tư: quản trị nhóm đặt PRIVATE sẽ tự khoá mình ra khỏi bảng (nguyên tắc kênh riêng tư).
    if (visibilityChanged && dto.visibility === "PRIVATE" && board.createdBy !== actor.id) {
      throw new AppError(ErrorMessages[ErrorCode.PERM_001], 403, ErrorCode.PERM_001);
    }
    if (dto.thumbnailAssetId !== undefined) await this.assertThumbnail(actor, dto.thumbnailAssetId);

    const updated = await this.d.tx.run(async (tx) => {
      const next = await this.d.whiteboards.updateMeta(
        id,
        dto.expectedVersion,
        {
          ...(dto.name !== undefined ? { name: dto.name, normalizedName: normalizeSearch(dto.name) } : {}),
          ...(visibilityChanged && dto.visibility ? { visibility: dto.visibility } : {}),
          ...(dto.thumbnailAssetId !== undefined ? { thumbnailAssetId: dto.thumbnailAssetId } : {}),
        },
        tx
      );
      if (!next) return null;
      if (dto.thumbnailAssetId !== undefined) {
        await this.d.assets.replaceThumbnail(tx, { assetId: dto.thumbnailAssetId, whiteboardId: id, workspaceId: next.workspaceId, actorId: actor.id });
      }
      await writeWhiteboardUpdated(this.d.outbox, tx, next);
      return next;
    });
    if (!updated) throw whiteboardErrors.versionConflict((await this.mustFind(id)).version);

    if (visibilityChanged) await this.afterVisibilityChange(updated);
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role ? { actorRole: actor.role } : {}),
      action: "whiteboard.update",
      targetType: "Whiteboard",
      targetId: id,
      workspaceId: updated.workspaceId,
      metadata: {
        renamed: dto.name !== undefined,
        thumbnailChanged: dto.thumbnailAssetId !== undefined,
        ...(visibilityChanged ? { visibilityFrom: board.visibility, visibilityTo: updated.visibility } : {}),
      },
    });
    return this.detail(actor, id);
  }

  async archive(actor: AuthUser, id: string, dto: ArchiveWhiteboardDto): Promise<WhiteboardDetailView> {
    await permissionService.assert(actor, "whiteboard.manage", { type: "WHITEBOARD", id });
    const board = await this.mustFind(id);
    if (board.status === "ARCHIVED") return this.detail(actor, id);

    const archived = await this.d.tx.run(async (tx) => {
      const next = await this.d.whiteboards.updateMeta(id, board.version, { status: "ARCHIVED", archivedAt: this.now() }, tx);
      if (!next) return null;
      await writeWhiteboardUpdated(this.d.outbox, tx, next);
      // Đóng mọi kết nối đang vẽ: nối lại sẽ vào chế độ chỉ xem (collab đọc chế độ từ BE).
      await writeAccessRevoked(this.d.outbox, tx, { whiteboardId: id, reason: "archived" }, `archived:v${next.version}`);
      return next;
    });
    if (!archived) throw whiteboardErrors.versionConflict((await this.mustFind(id)).version);
    await permissionService.bumpVersion({ type: "WHITEBOARD", id });
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role ? { actorRole: actor.role } : {}),
      action: "whiteboard.archive",
      targetType: "Whiteboard",
      targetId: id,
      workspaceId: archived.workspaceId,
      ...(dto.reason ? { reason: dto.reason } : {}),
    });
    return this.detail(actor, id);
  }

  async unarchive(actor: AuthUser, id: string, dto: ArchiveWhiteboardDto): Promise<WhiteboardDetailView> {
    await permissionService.assert(actor, "whiteboard.manage", { type: "WHITEBOARD", id });
    const board = await this.mustFind(id);
    if (board.status === "ACTIVE") return this.detail(actor, id);
    const limits = await getWhiteboardLimits();
    if ((await this.d.whiteboards.countActive(board.workspaceId)) >= limits.perWorkspaceMax) throw whiteboardErrors.tooManyWhiteboards(limits.perWorkspaceMax);

    const restored = await this.d.tx.run(async (tx) => {
      const next = await this.d.whiteboards.updateMeta(id, board.version, { status: "ACTIVE", archivedAt: null }, tx);
      if (!next) return null;
      await writeWhiteboardUpdated(this.d.outbox, tx, next);
      // Người đang xem ở chế độ chỉ xem nối lại để lấy lại quyền vẽ.
      await writeAccessRevoked(this.d.outbox, tx, { whiteboardId: id, reason: "revoked" }, `unarchived:v${next.version}`);
      return next;
    });
    if (!restored) throw whiteboardErrors.versionConflict((await this.mustFind(id)).version);
    await permissionService.bumpVersion({ type: "WHITEBOARD", id });
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role ? { actorRole: actor.role } : {}),
      action: "whiteboard.unarchive",
      targetType: "Whiteboard",
      targetId: id,
      workspaceId: restored.workspaceId,
      ...(dto.reason ? { reason: dto.reason } : {}),
    });
    return this.detail(actor, id);
  }

  /** Chi tiết + `myPermissions` do server tính. Không trả `yjsState`. */
  private async detail(actor: AuthUser, id: string): Promise<WhiteboardDetailView> {
    const access = await permissionService.assert(actor, "whiteboard.read", { type: "WHITEBOARD", id });
    const board = await this.mustFind(id);
    const [collaborator, people, thumbnails] = await Promise.all([
      this.d.collaborators.find(id, actor.id),
      this.d.directory.users(board.lastEditedBy ? [board.lastEditedBy] : []),
      this.thumbnailUrls(board.thumbnailAssetId ? [board.thumbnailAssetId] : []),
    ]);
    return toWhiteboardDetailView(board, myRoleOf(actor.id, board, collaborator), people, access, thumbnails);
  }

  private async mustFind(id: string): Promise<WhiteboardEntity> {
    const board = await this.d.whiteboards.findById(id);
    if (!board) throw new ScopeNotFoundError();
    return board;
  }

  /** Ký URL thumbnail best-effort: kho tệp lỗi không được làm hỏng danh sách/chi tiết (chỉ mất ảnh xem trước). */
  private async thumbnailUrls(assetIds: string[]): Promise<Map<string, string>> {
    if (assetIds.length === 0) return new Map();
    try {
      return await this.d.assets.signThumbnails(assetIds);
    } catch (err) {
      logger.warn("[whiteboards] Không ký được URL ảnh thu nhỏ", { error: err instanceof Error ? err.message : String(err) });
      return new Map();
    }
  }

  private async assertThumbnail(actor: AuthUser, assetId: string): Promise<void> {
    const asset = await this.d.assets.find(assetId);
    if (!asset || asset.ownerId !== actor.id || asset.scope !== "WHITEBOARD" || asset.kind !== "IMAGE" || asset.status !== "READY") throw whiteboardErrors.invalidThumbnail();
  }

  /**
   * Sau khi đổi visibility: xoá cache quyền; đổi sang PRIVATE thì thành viên nhóm KHÔNG phải người tạo/cộng tác viên mất quyền ngay —
   * `revokeScope` bump version + báo `permission:revoked` + (listener) đóng kết nối collab của họ.
   */
  private async afterVisibilityChange(board: WhiteboardEntity): Promise<void> {
    await permissionService.bumpVersion({ type: "WHITEBOARD", id: board.id });
    if (board.visibility !== "PRIVATE") return;
    const [members, collaboratorIds] = await Promise.all([this.d.directory.activeMemberIds(board.workspaceId), this.d.collaborators.userIdsOfWhiteboard(board.id)]);
    const keep = new Set([board.createdBy, ...collaboratorIds]);
    const lost = members.filter((id) => !keep.has(id));
    if (lost.length > 0) await revokeScope({ scope: { type: "WHITEBOARD", id: board.id }, userIds: lost, reason: "GRANT_REVOKED", cascade: false });
  }
}
