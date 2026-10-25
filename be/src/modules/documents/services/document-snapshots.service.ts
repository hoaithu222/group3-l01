import { permissionService } from "../../../core/permission";
import { ScopeNotFoundError, ValidationError } from "../../../core/exceptions";
import { LIMITS } from "../../../core/constants/limits";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { logger } from "../../../infrastructure/logger";
import type { AuthUser } from "../../../core/types/express";
import { getCollabClient, replaceFragmentContent, type ICollabClient } from "../../../shared/collab";
import type { CursorPage, PersonRef, SnapshotMeta } from "../entities/document.interface";
import type { CreateSnapshotDto, ListSnapshotsQueryDto, RestoreSnapshotDto } from "../dtos";
import type { IDocumentDirectory } from "../repositories/document-directory.interface";
import type { IDocumentRepository } from "../repositories/document.repository.interface";
import type { ISnapshotRepository } from "../repositories/snapshot.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import { documentErrors } from "../documents.errors";
import { writeDocumentUpdated, writePlaintextJob } from "./document-events";
import { getDocumentLimits } from "./document-limits";
import type { AuditRecorder } from "./document-ports";

export interface SnapshotView {
  id: string;
  kind: SnapshotMeta["kind"];
  label: string | null;
  createdBy: PersonRef | null;
  at: Date;
  sizeBytes: number;
}

export interface SnapshotDetailView extends SnapshotView {
  yjsVersion: number;
  /** Trạng thái Yjs (base64) — editor dựng bản xem chỉ đọc; KHÔNG có ở danh sách. */
  yjsState: string;
}

export interface RestoreResult {
  /** `yjsVersion` mới sau khi khôi phục. */
  restoredVersion: number;
  /** `version` metadata mới (client dùng làm `expectedVersion` lần sau). */
  version: number;
  preRestoreSnapshotId: string | null;
}

export interface DocumentSnapshotsDeps {
  documents: IDocumentRepository;
  snapshots: ISnapshotRepository;
  directory: IDocumentDirectory;
  tx: ITxRunner;
  outbox: IOutboxPort;
  audit: AuditRecorder;
  collab?: ICollabClient;
  now?: () => Date;
}

const MAX_RESTORE_ATTEMPTS = 3;

/**
 * Lịch sử phiên bản (be.md §5). Khôi phục KHÔNG phá lịch sử CRDT của client đang mở: BE tính bản thay nội dung fragment trong MỘT transaction Yjs,
 * ghi state mới (+ bản `PRE_RESTORE` của state trước đó) rồi gửi DELTA cho collab áp lên các phiên đang mở (`POST /internal/apply`).
 */
export class DocumentSnapshotsService {
  constructor(private readonly d: DocumentSnapshotsDeps) {}

  private collab(): ICollabClient {
    return this.d.collab ?? getCollabClient();
  }

  async list(actor: AuthUser, documentId: string, query: ListSnapshotsQueryDto): Promise<CursorPage<SnapshotView>> {
    await permissionService.assert(actor, "document.read", { type: "DOCUMENT", id: documentId });
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw new ValidationError("Cursor không hợp lệ");
    const rows = await this.d.snapshots.list({ documentId, ...(query.kind ? { kind: query.kind } : {}), cursor, limit: query.limit });
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

  async get(actor: AuthUser, documentId: string, snapshotId: string): Promise<SnapshotDetailView> {
    await permissionService.assert(actor, "document.read", { type: "DOCUMENT", id: documentId });
    const snap = await this.d.snapshots.findWithState(documentId, snapshotId);
    if (!snap) throw new ScopeNotFoundError();
    const people = await this.d.directory.users(snap.createdBy ? [snap.createdBy] : []);
    return { ...this.view(snap, people), yjsVersion: snap.yjsVersion, yjsState: Buffer.from(snap.yjsState).toString("base64") };
  }

  /** Bản MANUAL: ép collab lưu state đang sống trước (best-effort) để bản chụp = nội dung người dùng đang thấy. */
  async create(actor: AuthUser, documentId: string, dto: CreateSnapshotDto): Promise<SnapshotView> {
    await permissionService.assert(actor, "document.read", { type: "DOCUMENT", id: documentId });
    const doc = await this.d.documents.findById(documentId);
    if (!doc) throw new ScopeNotFoundError();
    if (doc.status === "ARCHIVED") throw documentErrors.archived();
    await permissionService.assert(actor, "document.snapshot", { type: "DOCUMENT", id: documentId });

    const limits = await getDocumentLimits();
    if ((await this.d.snapshots.countByKind(documentId, "MANUAL")) >= limits.snapshotsManualMax) throw documentErrors.tooManySnapshots(limits.snapshotsManualMax);
    await this.collab().flush("document", documentId);
    const current = await this.d.documents.findWithState(documentId);
    if (!current) throw new ScopeNotFoundError();
    const snap = await this.d.snapshots.create({
      documentId,
      kind: "MANUAL",
      label: dto.label ?? null,
      yjsState: current.yjsState ?? new Uint8Array(),
      yjsVersion: current.yjsVersion,
      createdBy: actor.id,
    });
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role ? { actorRole: actor.role } : {}),
      action: "document.snapshot.create",
      targetType: "Document",
      targetId: documentId,
      workspaceId: doc.workspaceId,
      metadata: { snapshotId: snap.id },
    });
    return this.view(snap, new Map([[actor.id, { id: actor.id, name: actor.name ?? "Người dùng" }]]));
  }

  async restore(actor: AuthUser, documentId: string, snapshotId: string, dto: RestoreSnapshotDto): Promise<RestoreResult> {
    await permissionService.assert(actor, "document.read", { type: "DOCUMENT", id: documentId });
    const head = await this.d.documents.findById(documentId);
    if (!head) throw new ScopeNotFoundError();
    if (head.status === "ARCHIVED") throw documentErrors.archived();
    await permissionService.assert(actor, "document.restore", { type: "DOCUMENT", id: documentId });
    const snapshot = await this.d.snapshots.findWithState(documentId, snapshotId);
    if (!snapshot) throw new ScopeNotFoundError();
    if (head.version !== dto.expectedVersion) throw documentErrors.versionConflict(head.version);

    // Lưu state đang sống về BE trước để `PRE_RESTORE` và phép thay nội dung dựa trên bản mới nhất (best-effort).
    await this.collab().flush("document", documentId);

    for (let attempt = 0; attempt < MAX_RESTORE_ATTEMPTS; attempt += 1) {
      const cur = await this.d.documents.findWithState(documentId);
      if (!cur) throw new ScopeNotFoundError();
      if (cur.version !== dto.expectedVersion) throw documentErrors.versionConflict(cur.version);
      const { newState, delta } = replaceFragmentContent(cur.yjsState, snapshot.yjsState);
      if (newState.byteLength > LIMITS.document.stateMaxBytes) throw documentErrors.tooLarge(LIMITS.document.stateMaxBytes);
      const yjsVersion = cur.yjsVersion + 1;

      const done = await this.d.tx.run(async (tx) => {
        // CAS TRƯỚC (đua với collab lưu xen giữa → `null`, chưa ghi gì), rồi mới tạo PRE_RESTORE từ state đã đọc.
        const written = await this.d.documents.writeState(
          documentId,
          cur.yjsVersion,
          { yjsState: newState, yjsVersion, stateBytes: newState.byteLength, lastEditedBy: actor.id, lastEditedAt: this.d.now?.() ?? new Date(), bumpVersion: true },
          tx
        );
        if (!written) return null;
        const pre =
          cur.yjsState && cur.yjsState.byteLength > 0
            ? await this.d.snapshots.create({ documentId, kind: "PRE_RESTORE", label: "Trước khi khôi phục", yjsState: cur.yjsState, yjsVersion: cur.yjsVersion, createdBy: actor.id }, tx)
            : null;
        await this.d.snapshots.pruneKeepNewest(documentId, "PRE_RESTORE", LIMITS.document.preRestoreKeep, tx);
        await writePlaintextJob(this.d.outbox, tx, documentId, yjsVersion);
        await writeDocumentUpdated(this.d.outbox, tx, written);
        return { doc: written, preId: pre?.id ?? null };
      });
      if (!done) continue;

      // Sau commit: phát delta cho các phiên đang mở (collab không mở tài liệu → không có ai để báo, BE đã ghi state mới).
      const applied = await this.collab().apply("document", documentId, delta, "restore");
      if (!applied.ok && this.collab().enabled()) logger.warn("[documents] không áp được delta khôi phục lên collab", { documentId, error: applied.error });
      await this.d.audit.record({
        actorId: actor.id,
        ...(actor.role ? { actorRole: actor.role } : {}),
        action: "document.snapshot.restore",
        targetType: "Document",
        targetId: documentId,
        workspaceId: cur.workspaceId,
        metadata: { snapshotId, preRestoreSnapshotId: done.preId },
      });
      return { restoredVersion: yjsVersion, version: done.doc.version, preRestoreSnapshotId: done.preId };
    }
    throw documentErrors.versionConflict((await this.d.documents.findById(documentId))?.version ?? head.version);
  }

  private view(s: SnapshotMeta, people: ReadonlyMap<string, PersonRef>): SnapshotView {
    return {
      id: s.id,
      kind: s.kind,
      label: s.label,
      createdBy: s.createdBy ? (people.get(s.createdBy) ?? { id: s.createdBy, name: "Người dùng" }) : null,
      at: s.at,
      sizeBytes: s.sizeBytes,
    };
  }
}
