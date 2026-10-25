/**
 * Bộ dựng dùng chung cho unit test service của `documents` (KHÔNG phải test): repository in-memory + resolver quyền dùng ĐÚNG ma trận vai của `workspaces`
 * (`computeWorkspaceActions`) + resolver DOCUMENT thật, nên quyền được kiểm bằng `permissionService` thật (không mock thứ đang được kiểm).
 * Import chéo module CHỈ ở test để lấy ma trận vai. File test PHẢI tự khai `jest.mock` redis (xem đầu các file test).
 */
import { clearScopeRegistry, registerScopeResolver, resetPermissionPorts, setPermissionPorts } from "../../../../core/permission";
import type { AuthUser } from "../../../../core/types/express";
import { newObjectId } from "../../../../core/utils/object-id";
import type { CollabCallResult, CollabKickInput, ICollabClient } from "../../../../shared/collab";
import { computeWorkspaceActions } from "../../../workspaces/services/workspace-permission.resolver";
import type { DocumentEntity } from "../../entities/document.interface";
import { InMemoryCollaboratorRepository, InMemoryDocumentRepository } from "../../repositories/document.repository.inmemory";
import { InMemoryDocumentDirectory } from "../../repositories/document-directory.inmemory";
import { InMemorySnapshotRepository } from "../../repositories/snapshot.repository.inmemory";
import { InMemoryOutboxPort, InMemoryTxRunner } from "../../repositories/tx";
import { registerDocumentScopeResolver } from "../../services/document-access.resolver";
import { DocumentCollabService } from "../../services/document-collab.service";
import { DocumentCollaboratorsService } from "../../services/document-collaborators.service";
import { DocumentSnapshotCronService } from "../../services/document-snapshot-cron.service";
import { DocumentSnapshotsService } from "../../services/document-snapshots.service";
import { DocumentsService } from "../../services/documents.service";
import { DocumentAssetsService } from "../../services/document-assets.service";
import type { AttachableAsset, IDocumentAssetPort, IDocumentNotifier } from "../../services/document-ports";
import { CollabTokenService } from "../../../../shared/collab";

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export const userOf = (id: string, role = "user"): AuthUser => ({ id, email: `${id}@e.com`, name: `Người ${id.slice(-4)}`, role, permissions: [] });

/** collab giả: ghi lại lời gọi, có thể bật/tắt `enabled` và ép lỗi. */
export class FakeCollab implements ICollabClient {
  isEnabled = true;
  failing = false;
  readonly kicks: CollabKickInput[] = [];
  readonly flushes: string[] = [];
  readonly applies: Array<{ docId: string; update: Uint8Array }> = [];

  enabled(): boolean {
    return this.isEnabled;
  }
  async health() {
    return { status: "ok" as const };
  }
  private result<T>(data: T): CollabCallResult<T> {
    return this.failing ? { ok: false, error: "collab lỗi" } : { ok: true, data };
  }
  async kick(input: CollabKickInput) {
    this.kicks.push(input);
    return this.result({ closed: 1 });
  }
  async flush(_kind: "document" | "whiteboard", docId: string) {
    this.flushes.push(docId);
    return this.result({ open: true, flushed: true, yjsVersion: 1 });
  }
  async apply(_kind: "document" | "whiteboard", docId: string, update: Uint8Array) {
    this.applies.push({ docId, update });
    return this.result({ open: true, applied: true, connections: 1 });
  }
  async stats() {
    return this.result({ connections: { document: 2 }, documents: { document: 1 }, pendingStates: 0 });
  }
}

export class FakeNotifier implements IDocumentNotifier {
  readonly calls: Array<{ docId: string; userIds: string[]; role: string }> = [];
  async collaboratorsAdded(_tx: unknown, input: { doc: DocumentEntity; actorId: string; userIds: string[]; role: "EDITOR" | "VIEWER" }): Promise<void> {
    this.calls.push({ docId: input.doc.id, userIds: input.userIds, role: input.role });
  }
}

export class FakeAssetPort implements IDocumentAssetPort {
  readonly assets = new Map<string, AttachableAsset>();
  readonly attached: Array<{ assetId: string; documentId: string; workspaceId: string; actorId: string }> = [];
  async find(assetId: string): Promise<AttachableAsset | null> {
    return this.assets.get(assetId) ?? null;
  }
  async attach(_tx: unknown, input: { assetId: string; documentId: string; workspaceId: string; actorId: string }): Promise<void> {
    this.attached.push(input);
  }
}

export class DocumentsHarness {
  readonly workspaceId = newObjectId();
  readonly directory = new InMemoryDocumentDirectory();
  readonly collaboratorRepo = new InMemoryCollaboratorRepository();
  clock = new Date("2026-09-26T10:00:00.000Z");
  readonly docs = new InMemoryDocumentRepository(() => this.collaboratorRepo, () => this.clock);
  readonly snapshotRepo = new InMemorySnapshotRepository(() => this.clock);
  readonly outbox = new InMemoryOutboxPort();
  readonly tx = new InMemoryTxRunner();
  readonly notifier = new FakeNotifier();
  readonly assetPort = new FakeAssetPort();
  readonly collab = new FakeCollab();
  readonly audit = { record: jest.fn().mockResolvedValue(undefined) };
  /** `permission:revoked` đã phát (qua cổng realtime của `revokeScope`). */
  readonly revoked: Array<{ userIds: string[]; payload: unknown }> = [];

  readonly service: DocumentsService;
  readonly collaborators: DocumentCollaboratorsService;
  readonly snapshots: DocumentSnapshotsService;
  readonly collabService: DocumentCollabService;
  readonly assets: DocumentAssetsService;
  readonly cron: DocumentSnapshotCronService;

  constructor() {
    clearScopeRegistry();
    this.directory.addWorkspace(this.workspaceId);
    registerScopeResolver({
      type: "WORKSPACE",
      resolve: async (user) => {
        const role = (await this.directory.activeRoles(this.workspaceId, [user.id])).get(user.id);
        const status = (await this.directory.workspaceStatus(this.workspaceId)) === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
        if (!role) return { visible: false, role: null, actions: new Set() };
        return { visible: true, role, actions: computeWorkspaceActions(role, status) };
      },
    });
    registerDocumentScopeResolver({ documents: this.docs, collaborators: this.collaboratorRepo, directory: this.directory });
    setPermissionPorts({
      realtime: {
        leaveRooms: async () => undefined,
        emitToUsers: async (userIds, event, payload) => {
          if (event === "permission:revoked") this.revoked.push({ userIds, payload });
        },
      },
      outbox: { enqueueNow: async () => undefined },
    });

    const common = { documents: this.docs, directory: this.directory, tx: this.tx, outbox: this.outbox, audit: this.audit };
    this.service = new DocumentsService({ ...common, collaborators: this.collaboratorRepo, now: () => this.clock });
    this.collaborators = new DocumentCollaboratorsService({ ...common, collaborators: this.collaboratorRepo, notifier: this.notifier });
    this.snapshots = new DocumentSnapshotsService({ ...common, snapshots: this.snapshotRepo, collab: this.collab, now: () => this.clock });
    this.collabService = new DocumentCollabService({
      documents: this.docs,
      directory: this.directory,
      tx: this.tx,
      outbox: this.outbox,
      now: () => this.clock,
      tokens: new CollabTokenService({ secret: () => "harness-collab-secret-0123456789-abcdefghij", publicUrl: () => "wss://collab.test/collab", now: () => this.clock }),
    });
    this.assets = new DocumentAssetsService(this.docs, this.assetPort, this.tx);
    this.cron = new DocumentSnapshotCronService(this.docs, this.snapshotRepo, () => this.clock);
  }

  dispose(): void {
    clearScopeRegistry();
    resetPermissionPorts();
  }

  /** Thêm người dùng vào workspace với vai trò cho trước. */
  addUser(role: Role | null = "MEMBER"): AuthUser {
    const id = newObjectId();
    this.directory.addUser(id);
    if (role) this.directory.addMember(this.workspaceId, id, role);
    return userOf(id);
  }

  setWorkspaceStatus(status: "ACTIVE" | "ARCHIVED"): void {
    this.directory.addWorkspace(this.workspaceId, status);
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }
}
