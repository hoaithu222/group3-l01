/**
 * Unit — tính toàn vẹn của các thao tác nhiều bước trong `workspaces` (README p1-01 §8):
 *   - WS-06: tạo nhóm, lỗi khi tạo kênh → lỗi lan ra NGUYÊN VẸN, mọi bước ghi sau đó
 *     (cập nhật defaultChannelId, gắn ảnh, outbox) KHÔNG chạy — toàn bộ chạy trong CÙNG 1
 *     transaction nên Mongo rollback (kiểm rollback THẬT ở `tests/integration/workspaces-consistency.test.ts`).
 *   - WS-07: chuyển owner — các nhánh throw để rollback (`WS_008` khi có request khác đã
 *     hạ owner cũ/đếm OWNER ≠ 1), `WS_003`/`WS_005`, CAS version.
 *   - Archive/restore ghi đủ 2 dòng outbox (workspace.events + conversations.workspace-*) trong CÙNG tx.
 * Mock `withTransaction` chạy callback với `tx` giả (1 object duy nhất — kiểm cùng transaction).
 */
const mockOutboxAdd = jest.fn();
const mockAuditRecord = jest.fn();
const mockBumpVersion = jest.fn();
const mockNotify = jest.fn();
let mockTx: unknown;
jest.mock("../../../infrastructure/database", () => ({
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
}));
jest.mock("../../../infrastructure/queue", () => ({ outbox: { add: (...a: unknown[]) => mockOutboxAdd(...a) } }));
jest.mock("../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: (...a: unknown[]) => mockAuditRecord(...a) })),
}));
jest.mock("../../notifications/public", () => ({
  notify: (...a: unknown[]) => mockNotify(...a),
  registerNotificationType: jest.fn(),
}));
jest.mock("../../../core/permission", () => ({
  ...jest.requireActual("../../../core/permission"),
  permissionService: { bumpVersion: (...a: unknown[]) => mockBumpVersion(...a) },
}));

import { ErrorCode } from "../../../core/utils/error.codes";
import { InMemoryWorkspaceRepository } from "../repositories/workspace.repository.inmemory";
import { WorkspaceService } from "../services/workspace.service";
import { WorkspaceLifecycleService } from "../services/workspace-lifecycle.service";
import type { ChannelBootstrapPort } from "../../../shared/ports/channel-bootstrap.port";
import type { MembershipLifecyclePort } from "../../../shared/ports/membership-lifecycle.port";
import type { AssetLinkService } from "../../assets/public";
import type { Workspace, WorkspaceMembership } from "../entities/workspace.interface";

const WS = "a1".repeat(12);
const OWNER = "b1".repeat(12);
const TARGET = "b2".repeat(12);
const OTHER = "b3".repeat(12);

function workspace(over: Partial<Workspace> = {}): Workspace {
  return {
    id: WS,
    name: "Nhóm",
    normalizedName: "nhom",
    description: null,
    avatarAssetId: null,
    ownerId: OWNER,
    defaultChannelId: "c1".repeat(12),
    status: "ACTIVE",
    archivedAt: null,
    archivedBy: null,
    archivedReason: null,
    archiveNote: null,
    memberCount: 2,
    lastActivityAt: new Date(),
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function membership(userId: string, role: WorkspaceMembership["role"], over: Partial<WorkspaceMembership> = {}): WorkspaceMembership {
  return {
    id: `m-${userId}`,
    workspaceId: WS,
    userId,
    role,
    status: "ACTIVE",
    displayName: null,
    joinedAt: new Date(),
    leftAt: null,
    expiresAt: null,
    invitedBy: null,
    inviteLinkId: null,
    banReason: null,
    removedBy: null,
    isFavorite: false,
    position: null,
    notifyMode: "INHERIT",
    lastVisitedAt: null,
    ...over,
  };
}

// ── tx giả có trạng thái tối thiểu cho archive/restore/transfer ─────────────
interface TxState {
  ws: Workspace;
  memberships: WorkspaceMembership[];
  userNames: Record<string, string>;
}

function applyData<T extends object>(target: T, data: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [k, v] of Object.entries(data)) {
    out[k] = typeof v === "object" && v !== null && "increment" in v ? (out[k] as number) + (v as { increment: number }).increment : v;
  }
  return out as T;
}

function makeLifecycleTx(state: TxState) {
  return {
    workspace: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const w = state.ws;
        if (where.id !== w.id || (where.status && where.status !== w.status) || (where.version !== undefined && where.version !== w.version)) {
          return { count: 0 };
        }
        state.ws = applyData(w, data);
        return { count: 1 };
      },
      findUnique: async () => ({ ...state.ws }),
      findUniqueOrThrow: async () => ({ ...state.ws }),
    },
    workspaceMembership: {
      findUnique: async ({ where }: { where: { workspaceId_userId: { userId: string } } }) =>
        state.memberships.find((m) => m.userId === where.workspaceId_userId.userId) ?? null,
      updateMany: async ({ where, data }: { where: { userId: string; role: string }; data: Record<string, unknown> }) => {
        const idx = state.memberships.findIndex((m) => m.userId === where.userId && m.role === where.role);
        if (idx < 0) return { count: 0 };
        state.memberships[idx] = applyData(state.memberships[idx], data);
        return { count: 1 };
      },
      update: async ({ where, data }: { where: { workspaceId_userId: { userId: string } }; data: Record<string, unknown> }) => {
        const idx = state.memberships.findIndex((m) => m.userId === where.workspaceId_userId.userId);
        state.memberships[idx] = applyData(state.memberships[idx], data);
      },
      count: async ({ where }: { where: { role: string; status: string } }) =>
        state.memberships.filter((m) => m.role === where.role && m.status === where.status).length,
    },
    user: { findUnique: async ({ where }: { where: { id: string } }) => (state.userNames[where.id] ? { name: state.userNames[where.id] } : null) },
  };
}

function lifecycleService(state: TxState): WorkspaceLifecycleService {
  const repo = new InMemoryWorkspaceRepository();
  repo.seedWorkspace(state.ws);
  for (const m of state.memberships) repo.seedMembership(m);
  mockTx = makeLifecycleTx(state);
  return new WorkspaceLifecycleService(repo, { leave: jest.fn() } as unknown as MembershipLifecyclePort);
}

const outboxTypes = (): string[] => mockOutboxAdd.mock.calls.map((c) => (c[1] as { type: string }).type);

beforeEach(() => {
  mockOutboxAdd.mockReset().mockResolvedValue(undefined);
  mockAuditRecord.mockReset().mockResolvedValue(undefined);
  mockBumpVersion.mockReset().mockResolvedValue(undefined);
  mockNotify.mockReset().mockResolvedValue(undefined);
});

describe("WS-06 — WorkspaceService.create() chạy trong MỘT transaction, lỗi giữa chừng không để lại gì", () => {
  function buildCreate(createDefault: ChannelBootstrapPort["createDefault"]) {
    const calls: string[] = [];
    const tx = {
      workspace: {
        create: jest.fn(async () => {
          calls.push("workspace.create");
          return { id: WS, name: "Nhóm mới", description: null, status: "ACTIVE", version: 1 };
        }),
        update: jest.fn(async () => {
          calls.push("workspace.update");
          return { id: WS, name: "Nhóm mới", description: null, status: "ACTIVE", version: 1, defaultChannelId: "c1".repeat(12) };
        }),
      },
      workspaceMembership: { create: jest.fn(async () => calls.push("membership.create")) },
    };
    mockTx = tx;
    const bootstrap: ChannelBootstrapPort = {
      createDefault: async (t, input) => {
        calls.push("channel.createDefault");
        expect(t).toBe(tx); // cùng transaction
        return createDefault(t, input);
      },
      joinDefault: jest.fn(),
    };
    const attach = jest.fn(async () => undefined);
    const assetLinks = { attach, detach: jest.fn(), replace: jest.fn() } as unknown as AssetLinkService;
    return { calls, tx, attach, service: new WorkspaceService(new InMemoryWorkspaceRepository(), bootstrap, assetLinks) };
  }

  it("lỗi khi tạo kênh (inject) → create() reject đúng lỗi đó; KHÔNG cập nhật defaultChannelId, KHÔNG gắn ảnh, KHÔNG outbox", async () => {
    const boom = new Error("inject: tạo kênh thất bại");
    const { service, calls, tx, attach } = buildCreate(async () => {
      throw boom;
    });

    await expect(service.create(OWNER, { name: "Nhóm mới", avatarAssetId: "d1".repeat(12) })).rejects.toBe(boom);

    expect(calls).toEqual(["workspace.create", "membership.create", "channel.createDefault"]);
    expect(tx.workspace.update).not.toHaveBeenCalled();
    expect(attach).not.toHaveBeenCalled();
    expect(mockOutboxAdd).not.toHaveBeenCalled();
  });

  it("đường thành công: đủ 4 bước theo thứ tự trong cùng tx, outbox workspace.created ghi cuối cùng", async () => {
    const { service, calls } = buildCreate(async () => ({ id: "c1".repeat(12), name: "Chung" }));
    const result = await service.create(OWNER, { name: "Nhóm mới" });

    expect(calls).toEqual(["workspace.create", "membership.create", "channel.createDefault", "workspace.update"]);
    expect(result.defaultChannel).toEqual({ id: "c1".repeat(12), name: "Chung" });
    expect(outboxTypes()).toEqual(["workspace.created"]);
  });
});

describe("WS-07 — WorkspaceLifecycleService.transferOwner(): luôn còn ĐÚNG MỘT owner, nhánh nào sai thì throw để rollback", () => {
  const dto = { toUserId: TARGET, confirmName: "Người nhận", expectedVersion: 1 };
  const freshState = (): TxState => ({
    ws: workspace(),
    memberships: [membership(OWNER, "OWNER"), membership(TARGET, "MEMBER")],
    userNames: { [TARGET]: "Người nhận", [OWNER]: "Chủ cũ" },
  });

  it("thành công: owner cũ → ADMIN, người nhận → OWNER, ownerId đổi, version tăng, audit + outbox owner-transferred, bumpVersion sau commit", async () => {
    const state = freshState();
    const service = lifecycleService(state);

    const { workspace: updated, previousOwnerRole } = await service.transferOwner(OWNER, WS, dto);

    expect(previousOwnerRole).toBe("ADMIN");
    expect(state.memberships.find((m) => m.userId === OWNER)?.role).toBe("ADMIN");
    expect(state.memberships.find((m) => m.userId === TARGET)?.role).toBe("OWNER");
    expect(state.memberships.filter((m) => m.role === "OWNER")).toHaveLength(1);
    expect(updated).toMatchObject({ ownerId: TARGET, version: 2 });
    expect(mockAuditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: "workspace.transfer-owner", metadata: { toUserId: TARGET } }));
    expect(outboxTypes()).toEqual(["workspace.owner-transferred"]);
    expect(mockBumpVersion).toHaveBeenCalledWith({ type: "WORKSPACE", id: WS });
  });

  it("confirmName so KHÔNG DẤU/hoa thường (normalizeSearch): 'NGUOI NHAN' khớp 'Người nhận'; sai tên → 400 WS_005, chưa đổi role", async () => {
    const ok = freshState();
    await expect(lifecycleService(ok).transferOwner(OWNER, WS, { ...dto, confirmName: "NGUOI NHAN" })).resolves.toBeDefined();

    const bad = freshState();
    const service = lifecycleService(bad);
    await expect(service.transferOwner(OWNER, WS, { ...dto, confirmName: "Người khác" })).rejects.toMatchObject({
      errorCode: ErrorCode.WS_005,
      statusCode: 400,
    });
    expect(bad.memberships.find((m) => m.userId === OWNER)?.role).toBe("OWNER");
  });

  it("người nhận không ACTIVE / đã là OWNER / không phải thành viên → 409 WS_003, không ghi gì", async () => {
    for (const memberships of [
      [membership(OWNER, "OWNER"), membership(TARGET, "MEMBER", { status: "LEFT" })],
      [membership(OWNER, "OWNER"), membership(TARGET, "OWNER")],
      [membership(OWNER, "OWNER")],
    ]) {
      mockAuditRecord.mockClear();
      const state: TxState = { ...freshState(), memberships };
      await expect(lifecycleService(state).transferOwner(OWNER, WS, dto)).rejects.toMatchObject({ errorCode: ErrorCode.WS_003, statusCode: 409 });
      expect(mockAuditRecord).not.toHaveBeenCalled();
    }
  });

  it("request thứ 2 thua cuộc đua: owner cũ ĐÃ bị hạ bởi request 1 (updateMany count=0) → 409 WS_008, KHÔNG thăng người nhận, KHÔNG outbox/audit", async () => {
    const state = freshState();
    state.memberships = [membership(OWNER, "ADMIN"), membership(TARGET, "MEMBER"), membership(OTHER, "OWNER")]; // OWNER mới là OTHER
    const service = lifecycleService(state);

    await expect(service.transferOwner(OWNER, WS, dto)).rejects.toMatchObject({ errorCode: ErrorCode.WS_008, statusCode: 409 });

    expect(state.memberships.find((m) => m.userId === TARGET)?.role).toBe("MEMBER");
    expect(mockAuditRecord).not.toHaveBeenCalled();
    expect(mockOutboxAdd).not.toHaveBeenCalled();
    expect(mockBumpVersion).not.toHaveBeenCalled();
  });

  it("kiểm đếm cuối: sau đổi vai vẫn ≠ 1 OWNER ACTIVE (dữ liệu hỏng) → 409 WS_008 để rollback, không ghi workspace/audit/outbox", async () => {
    const state = freshState();
    state.memberships.push(membership(OTHER, "OWNER")); // 2 OWNER khác nhau: hạ 1 + thăng 1 → vẫn 2
    const service = lifecycleService(state);

    await expect(service.transferOwner(OWNER, WS, dto)).rejects.toMatchObject({ errorCode: ErrorCode.WS_008 });
    expect(mockAuditRecord).not.toHaveBeenCalled();
    expect(mockOutboxAdd).not.toHaveBeenCalled();
  });

  it("expectedVersion cũ → 409 RES_003 mang version hiện tại; workspace không đổi owner", async () => {
    const state = freshState();
    state.ws = workspace({ version: 5 });
    await expect(lifecycleService(state).transferOwner(OWNER, WS, dto)).rejects.toMatchObject({ errorCode: ErrorCode.RES_003, statusCode: 409 });
    expect(mockAuditRecord).not.toHaveBeenCalled();
  });

  it("workspace đã ARCHIVED → 403 WS_002 (không chuyển owner khi đã lưu trữ)", async () => {
    const state = freshState();
    state.ws = workspace({ status: "ARCHIVED" });
    await expect(lifecycleService(state).transferOwner(OWNER, WS, dto)).rejects.toMatchObject({ errorCode: ErrorCode.WS_002, statusCode: 403 });
  });
});

describe("archive/restore — 2 dòng outbox trong cùng transaction (nối ConversationHooks p1-05)", () => {
  const archiveDto = { expectedVersion: 1 };
  const freshState = (over: Partial<Workspace> = {}): TxState => ({
    ws: workspace(over),
    memberships: [membership(OWNER, "OWNER")],
    userNames: {},
  });

  it("archive thủ công: workspace.archived (workspace.events) rồi conversation.workspace-archived (conversations.workspace-archived) — dedupeKey theo version", async () => {
    const state = freshState();
    await lifecycleService(state).archive(OWNER, WS, archiveDto, "OWNER");

    expect(outboxTypes()).toEqual(["workspace.archived", "conversation.workspace-archived"]);
    const [first, second] = mockOutboxAdd.mock.calls.map((c) => c[1]);
    expect(first).toMatchObject({ jobName: "workspace.events", payload: { event: "archived", workspaceId: WS, reason: "MANUAL" } });
    expect(second).toEqual({
      type: "conversation.workspace-archived",
      aggregateType: "Workspace",
      aggregateId: WS,
      queue: "notifications",
      jobName: "conversations.workspace-archived",
      dedupeKey: `conversations.workspace-archived:${WS}:v2`,
      payload: { workspaceId: WS },
    });
    expect(state.ws).toMatchObject({ status: "ARCHIVED", archivedReason: "MANUAL", version: 2 });
    expect(mockAuditRecord).not.toHaveBeenCalled(); // archive thủ công không ghi audit nền tảng
    expect(mockBumpVersion).toHaveBeenCalledWith({ type: "WORKSPACE", id: WS });
  });

  it("platformArchive: thêm audit + thông báo ADMIN_CHANGE cho OWNER, vẫn đủ 2 dòng outbox", async () => {
    await lifecycleService(freshState()).platformArchive("e1".repeat(12), WS, "Vi phạm điều khoản (lý do đủ dài)");
    expect(mockAuditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: "workspace.platform-archive", reason: "Vi phạm điều khoản (lý do đủ dài)" }));
    expect(mockNotify).toHaveBeenCalledWith(mockTx, expect.objectContaining({ type: "workspace.admin-change", recipients: [{ userId: OWNER }] }));
    expect(outboxTypes()).toEqual(["workspace.archived", "conversation.workspace-archived"]);
  });

  it("restore: workspace.restored rồi conversation.workspace-restored; khoá version khác dòng archive (không đụng dedupeKey)", async () => {
    const state = freshState({ status: "ARCHIVED", version: 2, archivedReason: "MANUAL", archivedAt: new Date() });
    await lifecycleService(state).restore(OWNER, WS, { expectedVersion: 2 }, "OWNER");

    expect(outboxTypes()).toEqual(["workspace.restored", "conversation.workspace-restored"]);
    expect(mockOutboxAdd.mock.calls[1][1]).toMatchObject({
      jobName: "conversations.workspace-restored",
      dedupeKey: `conversations.workspace-restored:${WS}:v3`,
      payload: { workspaceId: WS },
    });
    expect(state.ws).toMatchObject({ status: "ACTIVE", archivedReason: null });
  });

  it("archive khi đã ARCHIVED → 403 WS_002; version cũ → 409 RES_003; restore khi đang ACTIVE → 409 WS_007 — KHÔNG ghi outbox", async () => {
    await expect(lifecycleService(freshState({ status: "ARCHIVED", version: 2 })).archive(OWNER, WS, { expectedVersion: 2 }, "OWNER")).rejects.toMatchObject({
      errorCode: ErrorCode.WS_002,
    });
    await expect(lifecycleService(freshState()).archive(OWNER, WS, { expectedVersion: 99 }, "OWNER")).rejects.toMatchObject({
      errorCode: ErrorCode.RES_003,
    });
    await expect(lifecycleService(freshState()).restore(OWNER, WS, { expectedVersion: 1 }, "OWNER")).rejects.toMatchObject({
      errorCode: ErrorCode.WS_007,
    });
    expect(mockOutboxAdd).not.toHaveBeenCalled();
  });

  it("workspace bị lưu trữ bởi NỀN TẢNG: OWNER khôi phục → 403 WS_009, không ghi outbox", async () => {
    const state = freshState({ status: "ARCHIVED", version: 2, archivedReason: "PLATFORM" });
    await expect(lifecycleService(state).restore(OWNER, WS, { expectedVersion: 2 }, "OWNER")).rejects.toMatchObject({
      errorCode: ErrorCode.WS_009,
      statusCode: 403,
    });
    expect(mockOutboxAdd).not.toHaveBeenCalled();
  });
});
