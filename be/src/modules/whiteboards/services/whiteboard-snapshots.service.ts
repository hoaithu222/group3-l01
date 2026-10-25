import { permissionService } from "../../../core/permission";
import { ScopeNotFoundError, ValidationError } from "../../../core/exceptions";
import { LIMITS } from "../../../core/constants/limits";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { logger } from "../../../infrastructure/logger";
import type { AuthUser } from "../../../core/types/express";
import { getCollabClient, type ICollabClient } from "../../../shared/collab";
import type { CursorPage, PersonRef, SnapshotMeta } from "../entities/whiteboard.interface";
import type { CreateSnapshotDto, ListSnapshotsQueryDto, RestoreSnapshotDto } from "../dtos";
import type { IWhiteboardDirectory } from "../repositories/whiteboard-directory.interface";
import type { IWhiteboardRepository } from "../repositories/whiteboard.repository.interface";
import type { ISnapshotRepository } from "../repositories/snapshot.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import { whiteboardErrors } from "../whiteboards.errors";
import { writeWhiteboardUpdated } from "./whiteboard-events";
import { getWhiteboardLimits } from "./whiteboard-limits";
import type { AuditRecorder } from "./whiteboard-ports";
import { replaceWhiteboardContent } from "./whiteboard-yjs";

export interface SnapshotView {
  id: string;
  kind: SnapshotMeta["kind"];
  label: string | null;
  createdBy: PersonRef | null;
  at: Date;
  elementCount: number;
}

export interface SnapshotDetailView extends SnapshotView {
  /** Trạng thái Yjs (base64) — app dựng bản xem chỉ đọc; KHÔNG có ở danh sách. */
  yjsState: string;
}

export interface RestoreResult {
  /** `yjsVersion` mới sau khi khôi phục. */
  restoredVersion: number;
  /** `version` metadata mới (client dùng làm `expectedVersion` lần sau). */
  version: number;
  preRestoreSnapshotId: string | null;
}

export interface WhiteboardSnapshotsDeps {
  whiteboards: IWhiteboardRepository;
  snapshots: ISnapshotRepository;
  directory: IWhiteboardDirectory;
  tx: ITxRunner;
  outbox: IOutboxPort;
  audit: AuditRecorder;
  collab?: ICollabClient;
  now?: () => Date;
}

const MAX_RESTORE_ATTEMPTS = 3;

/**
 * Lịch sử phiên bản (be.md §5 "Restore: như documents"). Khôi phục KHÔNG phá lịch sử CRDT của client đang mở: BE tính bản thay `elements`/`order` trong MỘT transaction Yjs
 * (origin `restore`), ghi state mới (+ bản `PRE_RESTORE` của state trước đó) rồi gửi DELTA cho collab áp lên các phiên đang mở (`POST /internal/apply`, `kind: "whiteboard"`).
 */
export class WhiteboardSnapshotsService {
  constructor(private readonly d: WhiteboardSnapshotsDeps) {}

  private collab(): ICollabClient {
    return this.d.collab ?? getCollabClient();
  }

  async list(actor: AuthUser, whiteboardId: string, query: ListSnapshotsQueryDto): Promise<CursorPage<SnapshotView>> {
    await permissionService.assert(actor, "whiteboard.read", { type: "WHITEBOARD", id: whiteboardId });
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw new ValidationError("Cursor không hợp lệ");
    const rows = await this.d.snapshots.list({ whiteboardId, ...(query.kind ? { kind: query.kind } : {}), cursor, limit: query.limit });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const people = await this.d.directory.users(page.flatMap((s) => (s.createdBy ? [s.createdBy] : [])));
    const last = page[page.length - 1];
    return {
      data: page.map((s) => this.view(s, people)),
      nextCursor: hasMore && last ? encodeCursor(last.at, last.id) : null,
      hasMore,
      limit: query.limit,
    };
  }

  async get(actor: AuthUser, whiteboardId: string, snapshotId: string): Promise<SnapshotDetailView> {
    await permissionService.assert(actor, "whiteboard.read", { type: "WHITEBOARD", id: whiteboardId });
    const snap = await this.d.snapshots.findWithState(whiteboardId, snapshotId);
    if (!snap) throw new ScopeNotFoundError();
    const people = await this.d.directory.users(snap.createdBy ? [snap.createdBy] : []);
    return { ...this.view(snap, people), yjsState: Buffer.from(snap.yjsState).toString("base64") };
  }

  /** Bản MANUAL: ép collab lưu state đang sống trước (best-effort) để bản chụp = nội dung người dùng đang thấy. */
  async create(actor: AuthUser, whiteboardId: string, dto: CreateSnapshotDto): Promise<SnapshotView> {
    await permissionService.assert(actor, "whiteboard.read", { type: "WHITEBOARD", id: whiteboardId });
    const board = await this.d.whiteboards.findById(whiteboardId);
    if (!board) throw new ScopeNotFoundError();
    if (board.status === "ARCHIVED") throw whiteboardErrors.archived();
    await permissionService.assert(actor, "whiteboard.snapshot", { type: "WHITEBOARD", id: whiteboardId });

    const limits = await getWhiteboardLimits();
    if ((await this.d.snapshots.countByKind(whiteboardId, "MANUAL")) >= limits.snapshotsManualMax) throw whiteboardErrors.tooManySnapshots(limits.snapshotsManualMax);
    await this.collab().flush("whiteboard", whiteboardId);
    const current = await this.d.whiteboards.findWithState(whiteboardId);
    if (!current) throw new ScopeNotFoundError();
    const snap = await this.d.snapshots.create({
      whiteboardId,
      kind: "MANUAL",
      label: dto.label ?? null,
      yjsState: current.yjsState ?? new Uint8Array(),
      elementCount: current.elementCount,
      createdBy: actor.id,
    });
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role ? { actorRole: actor.role } : {}),
      action: "whiteboard.snapshot.create",
      targetType: "Whiteboard",
      targetId: whiteboardId,
      workspaceId: board.workspaceId,
      metadata: { snapshotId: snap.id },
    });
    return this.view(snap, new Map([[actor.id, { id: actor.id, name: actor.name ?? "Người dùng" }]]));
  }

  async restore(actor: AuthUser, whiteboardId: string, snapshotId: string, dto: RestoreSnapshotDto): Promise<RestoreResult> {
    await permissionService.assert(actor, "whiteboard.read", { type: "WHITEBOARD", id: whiteboardId });
    const head = await this.d.whiteboards.findById(whiteboardId);
    if (!head) throw new ScopeNotFoundError();
    if (head.status === "ARCHIVED") throw whiteboardErrors.archived();
    await permissionService.assert(actor, "whiteboard.restore", { type: "WHITEBOARD", id: whiteboardId });
    const snapshot = await this.d.snapshots.findWithState(whiteboardId, snapshotId);
    if (!snapshot) throw new ScopeNotFoundError();
    if (head.version !== dto.expectedVersion) throw whiteboardErrors.versionConflict(head.version);

    // Lưu state đang sống về BE trước để `PRE_RESTORE` và phép thay nội dung dựa trên bản mới nhất (best-effort).
    await this.collab().flush("whiteboard", whiteboardId);
    const limits = await getWhiteboardLimits();

    for (let attempt = 0; attempt < MAX_RESTORE_ATTEMPTS; attempt += 1) {
      const cur = await this.d.whiteboards.findWithState(whiteboardId);
      if (!cur) throw new ScopeNotFoundError();
      if (cur.version !== dto.expectedVersion) throw whiteboardErrors.versionConflict(cur.version);
      const { newState, delta, elementCount } = replaceWhiteboardContent(cur.yjsState, snapshot.yjsState);
      if (newState.byteLength > limits.stateMaxBytes || elementCount > limits.elementsMax) {
        throw whiteboardErrors.tooLarge({ maxBytes: limits.stateMaxBytes, maxElements: limits.elementsMax, elementCount });
      }
      const yjsVersion = cur.yjsVersion + 1;

      const done = await this.d.tx.run(async (tx) => {
        // CAS TRƯỚC (đua với collab lưu xen giữa → `null`, chưa ghi gì), rồi mới tạo PRE_RESTORE từ state đã đọc.
        const written = await this.d.whiteboards.writeState(
          whiteboardId,
          cur.yjsVersion,
          { yjsState: newState, yjsVersion, elementCount, lastEditedBy: actor.id, lastEditedAt: this.d.now?.() ?? new Date(), bumpVersion: true },
          tx
        );
        if (!written) return null;
        const pre =
          cur.yjsState && cur.yjsState.byteLength > 0
            ? await this.d.snapshots.create(
                { whiteboardId, kind: "PRE_RESTORE", label: "Trước khi khôi phục", yjsState: cur.yjsState, elementCount: cur.elementCount, createdBy: actor.id },
                tx
              )
            : null;
        await this.d.snapshots.pruneKeepNewest(whiteboardId, "PRE_RESTORE", LIMITS.whiteboard.preRestoreKeep, tx);
        await writeWhiteboardUpdated(this.d.outbox, tx, written);
        return { board: written, preId: pre?.id ?? null };
      });
      if (!done) continue;

      // Sau commit: phát delta cho các phiên đang mở (collab không mở bảng → không có ai để báo, BE đã ghi state mới).
      const applied = await this.collab().apply("whiteboard", whiteboardId, delta, "restore");
      if (!applied.ok && this.collab().enabled()) logger.warn("[whiteboards] không áp được delta khôi phục lên collab", { whiteboardId, error: applied.error });
      await this.d.audit.record({
        actorId: actor.id,
        ...(actor.role ? { actorRole: actor.role } : {}),
        action: "whiteboard.snapshot.restore",
        targetType: "Whiteboard",
        targetId: whiteboardId,
        workspaceId: cur.workspaceId,
        metadata: { snapshotId, preRestoreSnapshotId: done.preId },
      });
      return { restoredVersion: yjsVersion, version: done.board.version, preRestoreSnapshotId: done.preId };
    }
    throw whiteboardErrors.versionConflict((await this.d.whiteboards.findById(whiteboardId))?.version ?? head.version);
  }

  private view(s: SnapshotMeta, people: ReadonlyMap<string, PersonRef>): SnapshotView {
    return {
      id: s.id,
      kind: s.kind,
      label: s.label,
      createdBy: s.createdBy ? (people.get(s.createdBy) ?? { id: s.createdBy, name: "Người dùng" }) : null,
      at: s.at,
      elementCount: s.elementCount,
    };
  }
}
