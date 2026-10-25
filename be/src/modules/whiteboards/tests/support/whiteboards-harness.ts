/**
 * Bộ dựng dùng chung cho unit test service của `whiteboards` (KHÔNG phải test): repository in-memory + resolver quyền dùng ĐÚNG ma trận vai của `workspaces`
 * (`computeWorkspaceActions`) + resolver WHITEBOARD thật, nên quyền được kiểm bằng `permissionService` thật (không mock thứ đang được kiểm).
 * Import chéo module CHỈ ở test để lấy ma trận vai. File test PHẢI tự khai `jest.mock` redis (xem đầu các file test).
 */
import * as Y from "yjs";
import { clearScopeRegistry, registerScopeResolver, resetPermissionPorts, setPermissionPorts } from "../../../../core/permission";
import type { AuthUser } from "../../../../core/types/express";
import { newObjectId } from "../../../../core/utils/object-id";
import { CollabTokenService, type CollabCallResult, type CollabKickInput, type ICollabClient } from "../../../../shared/collab";
import type { CollabKind } from "../../../../shared/collab";
import { computeWorkspaceActions } from "../../../workspaces/services/workspace-permission.resolver";
import { InMemoryCollaboratorRepository, InMemoryWhiteboardRepository } from "../../repositories/whiteboard.repository.inmemory";
import { InMemorySnapshotRepository } from "../../repositories/snapshot.repository.inmemory";
import { InMemoryWhiteboardDirectory } from "../../repositories/whiteboard-directory.inmemory";
import { InMemoryOutboxPort, InMemoryTxRunner, type TxHandle } from "../../repositories/tx";
import { registerWhiteboardScopeResolver } from "../../services/whiteboard-access.resolver";
import { WhiteboardCollabService } from "../../services/whiteboard-collab.service";
import { WhiteboardCollaboratorsService } from "../../services/whiteboard-collaborators.service";
import { WhiteboardSnapshotCronService } from "../../services/whiteboard-snapshot-cron.service";
import { WhiteboardSnapshotsService } from "../../services/whiteboard-snapshots.service";
import { WhiteboardsService } from "../../services/whiteboards.service";
import type { AttachableAsset, IWhiteboardAssetPort } from "../../services/whiteboard-ports";
import { WHITEBOARD_ROOT } from "../../services/whiteboard-element.schema";

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export const COLLAB_SECRET = "harness-collab-secret-0123456789-abcdefghij";

export const userOf = (id: string, role = "user"): AuthUser => ({ id, email: `${id}@e.com`, name: `Người ${id.slice(-4)}`, role, permissions: [] });

/** collab giả: ghi lại lời gọi (kèm loại tài nguyên), có thể bật/tắt `enabled` và ép lỗi. */
export class FakeCollab implements ICollabClient {
  isEnabled = true;
  failing = false;
  readonly kicks: CollabKickInput[] = [];
  readonly flushes: Array<{ kind: CollabKind; docId: string }> = [];
  readonly applies: Array<{ kind: CollabKind; docId: string; update: Uint8Array }> = [];

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
  async flush(kind: CollabKind, docId: string) {
    this.flushes.push({ kind, docId });
    return this.result({ open: true, flushed: true, yjsVersion: 1 });
  }
  async apply(kind: CollabKind, docId: string, update: Uint8Array) {
    this.applies.push({ kind, docId, update });
    return this.result({ open: true, applied: true, connections: 1 });
  }
  async stats() {
    return this.result({ connections: { whiteboard: 2 }, documents: { whiteboard: 1 }, pendingStates: 0 });
  }
}

export class FakeAssetPort implements IWhiteboardAssetPort {
  readonly assets = new Map<string, AttachableAsset>();
  readonly replaced: Array<{ assetId: string; whiteboardId: string; workspaceId: string; actorId: string }> = [];
  /** `assetId → url` — Map rỗng = chưa có ảnh xử lý xong. */
  readonly urls = new Map<string, string>();
  failSigning = false;

  async find(assetId: string): Promise<AttachableAsset | null> {
    return this.assets.get(assetId) ?? null;
  }
  async replaceThumbnail(_tx: TxHandle, input: { assetId: string; whiteboardId: string; workspaceId: string; actorId: string }): Promise<void> {
    this.replaced.push(input);
  }
  async signThumbnails(assetIds: string[]): Promise<Map<string, string>> {
    if (this.failSigning) throw new Error("storage lỗi");
    return new Map(assetIds.flatMap((id) => (this.urls.has(id) ? [[id, this.urls.get(id) as string] as [string, string]] : [])));
  }
}

const CREATOR_ID = "66f1a2b3c4d5e6f708192a3b";

/** Phần tử hợp lệ theo `contracts/whiteboard-elements.schema.json`; `over` ghi đè từng trường. */
export function elementOf(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    type: "rect",
    x: 0,
    y: 0,
    w: 100,
    h: 60,
    rotation: 0,
    strokeColor: "ink",
    fillColor: null,
    strokeWidth: 2,
    createdBy: CREATOR_ID,
    updatedBy: CREATOR_ID,
    updatedAt: 1_700_000_000_000,
    ...over,
  };
}

/** Dựng state Yjs như app ghi: `elements` Y.Map<id, Y.Map>, `order` Y.Array<id>. */
export function buildState(elements: Array<Record<string, unknown>>): Uint8Array {
  const doc = new Y.Doc();
  doc.transact(() => {
    const map = doc.getMap(WHITEBOARD_ROOT.elements);
    const order = doc.getArray<string>(WHITEBOARD_ROOT.order);
    for (const el of elements) {
      const m = new Y.Map<unknown>();
      for (const [k, v] of Object.entries(el)) m.set(k, v);
      map.set(String(el["id"]), m);
      order.push([String(el["id"])]);
    }
  });
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return state;
}

/** Đọc lại `{ id: element }` và `order` từ một state — cho assert. */
export function readState(state: Uint8Array | null): { elements: Record<string, Record<string, unknown>>; order: string[] } {
  const doc = new Y.Doc();
  if (state && state.byteLength > 0) Y.applyUpdate(doc, state);
  const elements = doc.getMap(WHITEBOARD_ROOT.elements).toJSON() as Record<string, Record<string, unknown>>;
  const order = doc.getArray<string>(WHITEBOARD_ROOT.order).toArray();
  doc.destroy();
  return { elements, order };
}

export class WhiteboardsHarness {
  readonly workspaceId = newObjectId();
  readonly directory = new InMemoryWhiteboardDirectory();
  readonly collaboratorRepo = new InMemoryCollaboratorRepository();
  clock = new Date("2026-09-26T10:00:00.000Z");
  readonly boards = new InMemoryWhiteboardRepository(() => this.collaboratorRepo, () => this.clock);
  readonly snapshotRepo = new InMemorySnapshotRepository(() => this.clock);
  readonly outbox = new InMemoryOutboxPort();
  readonly tx = new InMemoryTxRunner();
  readonly assetPort = new FakeAssetPort();
  readonly collab = new FakeCollab();
  readonly audit = { record: jest.fn().mockResolvedValue(undefined) };
  /** `permission:revoked` đã phát (qua cổng realtime của `revokeScope`). */
  readonly revoked: Array<{ userIds: string[]; payload: unknown }> = [];

  readonly service: WhiteboardsService;
  readonly collaborators: WhiteboardCollaboratorsService;
  readonly snapshots: WhiteboardSnapshotsService;
  readonly collabService: WhiteboardCollabService;
  readonly cron: WhiteboardSnapshotCronService;

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
    registerWhiteboardScopeResolver({ whiteboards: this.boards, collaborators: this.collaboratorRepo, directory: this.directory });
    setPermissionPorts({
      realtime: {
        leaveRooms: async () => undefined,
        emitToUsers: async (userIds, event, payload) => {
          if (event === "permission:revoked") this.revoked.push({ userIds, payload });
        },
      },
      outbox: { enqueueNow: async () => undefined },
    });

    const common = { whiteboards: this.boards, directory: this.directory, tx: this.tx, outbox: this.outbox, audit: this.audit };
    this.service = new WhiteboardsService({ ...common, collaborators: this.collaboratorRepo, assets: this.assetPort, now: () => this.clock });
    this.collaborators = new WhiteboardCollaboratorsService({ ...common, collaborators: this.collaboratorRepo });
    this.snapshots = new WhiteboardSnapshotsService({ ...common, snapshots: this.snapshotRepo, collab: this.collab, now: () => this.clock });
    this.collabService = new WhiteboardCollabService({
      whiteboards: this.boards,
      directory: this.directory,
      tx: this.tx,
      now: () => this.clock,
      tokens: new CollabTokenService({ secret: () => COLLAB_SECRET, publicUrl: () => "wss://collab.test/collab", now: () => this.clock }),
    });
    this.cron = new WhiteboardSnapshotCronService(this.boards, this.snapshotRepo, () => this.clock);
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
