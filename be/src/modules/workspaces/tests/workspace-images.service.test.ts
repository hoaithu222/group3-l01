/**
 * Unit — ảnh nhóm ở `WorkspaceService.create/patch` + DTO: cột `avatarAssetId`/`coverAssetId`/`coverPreset` ghi CÙNG lượt CAS `updateMany`
 * (tạo: cùng `workspace.create`) và `AssetLink` (`attach`/`replace` scope WORKSPACE, `allowedScopes ["AVATAR"]`; `null` → `detach`) trong CÙNG
 * transaction; không gửi trường ảnh → không đụng link. Tx giả là MỘT object (kiểm cùng transaction) như `workspace-transactions.test.ts`;
 * rollback thật trên Mongo ở `tests/integration/workspaces.routes.test.ts`.
 */
const mockOutboxAdd = jest.fn();
let mockTx: unknown;
jest.mock("../../../infrastructure/database", () => ({
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
}));
jest.mock("../../../infrastructure/queue", () => ({ outbox: { add: (...a: unknown[]) => mockOutboxAdd(...a) } }));
jest.mock("../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: jest.fn() })),
}));
jest.mock("../../notifications/public", () => ({ notify: jest.fn(), registerNotificationType: jest.fn() }));

import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { InMemoryWorkspaceRepository } from "../repositories/workspace.repository.inmemory";
import { WorkspaceService } from "../services/workspace.service";
import { createWorkspaceSchema } from "../dtos/create-workspace.dto";
import { updateWorkspaceSchema } from "../dtos/update-workspace.dto";
import type { ChannelBootstrapPort } from "../../../shared/ports/channel-bootstrap.port";
import type { AssetLinkService } from "../../assets/public";
import type { ResolvedAccess } from "../../../core/permission";
import type { Workspace, WorkspaceMembership } from "../entities/workspace.interface";
import { computeWorkspaceActions } from "../services/workspace-permission.resolver";

const WS = "65f0000000000000000011a1";
const OWNER = "65f0000000000000000011b1";
const AVATAR = "65f0000000000000000011c1";
const COVER = "65f0000000000000000011c2";
const CHANNEL = "65f0000000000000000011d1";
const OWNER_ACCESS: ResolvedAccess = { visible: true, role: "OWNER", actions: computeWorkspaceActions("OWNER", "ACTIVE") };
const imageUrl = (assetId: string, variant: "THUMB" | "ORIGINAL") =>
  expect.stringMatching(new RegExp(`/api/v1/assets/${assetId}/image\\?v=${variant}&e=\\d+&s=[0-9a-f]{64}$`));

function workspaceRow(over: Partial<Workspace> = {}): Workspace {
  return {
    id: WS,
    name: "Nhóm",
    normalizedName: "nhom",
    description: null,
    avatarAssetId: null,
    ownerId: OWNER,
    defaultChannelId: CHANNEL,
    status: "ACTIVE",
    archivedAt: null,
    archivedBy: null,
    archivedReason: null,
    archiveNote: null,
    memberCount: 1,
    lastActivityAt: new Date(),
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    coverAssetId: null,
    coverPreset: null,
    timezone: null,
    ...over,
  };
}

function ownerMembership(): WorkspaceMembership {
  return {
    id: "m1",
    workspaceId: WS,
    userId: OWNER,
    role: "OWNER",
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
  };
}

function assetLinksMock() {
  const calls: string[] = [];
  const track = (name: string) =>
    jest.fn(async (..._args: unknown[]): Promise<void> => {
      calls.push(name);
    });
  const links = { attach: track("attach"), detach: track("detach"), replace: track("replace") };
  return { links, calls, service: links as unknown as AssetLinkService };
}

function buildService(assetLinks: AssetLinkService): { service: WorkspaceService; repo: InMemoryWorkspaceRepository } {
  const repo = new InMemoryWorkspaceRepository();
  repo.seedWorkspace(workspaceRow());
  repo.seedMembership(ownerMembership());
  const bootstrap: ChannelBootstrapPort = { createDefault: jest.fn(async () => ({ id: CHANNEL, name: "Chung" })), joinDefault: jest.fn() };
  return { service: new WorkspaceService(repo, bootstrap, assetLinks), repo };
}

beforeEach(() => {
  mockOutboxAdd.mockReset().mockResolvedValue(undefined);
});

describe("WorkspaceService.create — ảnh nhóm", () => {
  function createTx(calls: string[]) {
    let created: Record<string, unknown> = {};
    const tx = {
      workspace: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          calls.push("workspace.create");
          created = { ...workspaceRow({ defaultChannelId: null }), ...data };
          return created;
        }),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          calls.push("workspace.update");
          return { ...created, ...data };
        }),
      },
      workspaceMembership: { create: jest.fn(async () => undefined) },
    };
    mockTx = tx;
    return tx;
  }

  it("có avatar + bìa + preset: ghi cột ngay trong workspace.create, attach 2 đích scope WORKSPACE với allowedScopes [AVATAR], cùng tx", async () => {
    const { links, calls, service: assetLinks } = assetLinksMock();
    const tx = createTx(calls);
    const { service } = buildService(assetLinks);

    const result = await service.create(OWNER, { name: "Nhóm mới", avatarAssetId: AVATAR, coverAssetId: COVER, coverPreset: "sunset" });

    expect(tx.workspace.create.mock.calls[0][0].data).toMatchObject({ avatarAssetId: AVATAR, coverAssetId: COVER, coverPreset: "sunset" });
    const common = { targetId: WS, scopeType: "WORKSPACE", scopeId: WS, actorId: OWNER, allowedScopes: ["AVATAR"] };
    expect(links.attach).toHaveBeenNthCalledWith(1, tx, { assetIds: [AVATAR], targetType: "WORKSPACE_AVATAR", ...common });
    expect(links.attach).toHaveBeenNthCalledWith(2, tx, { assetIds: [COVER], targetType: "WORKSPACE_COVER", ...common });
    expect(calls).toEqual(["workspace.create", "workspace.update", "attach", "attach"]);
    expect(mockOutboxAdd).toHaveBeenCalledWith(tx, expect.objectContaining({ type: "workspace.created" }));
    expect(result.workspace).toMatchObject({
      avatarUrl: imageUrl(AVATAR, "THUMB"),
      coverUrl: imageUrl(COVER, "ORIGINAL"),
      coverThumbUrl: imageUrl(COVER, "THUMB"),
      coverPreset: "sunset",
    });
  });

  it("không gửi ảnh: cột ghi null TƯỜNG MINH, không attach", async () => {
    const { links, calls, service: assetLinks } = assetLinksMock();
    const tx = createTx(calls);
    const { service } = buildService(assetLinks);

    const result = await service.create(OWNER, { name: "Nhóm trơn" });

    expect(tx.workspace.create.mock.calls[0][0].data).toMatchObject({ avatarAssetId: null, coverAssetId: null, coverPreset: null });
    expect(links.attach).not.toHaveBeenCalled();
    expect(result.workspace).toMatchObject({ avatarUrl: null, coverUrl: null, coverThumbUrl: null, coverPreset: null });
  });

  it("attach ảnh bìa lỗi (415) → create reject nguyên lỗi, KHÔNG ghi outbox (cả nhóm rollback)", async () => {
    const { links, calls, service: assetLinks } = assetLinksMock();
    createTx(calls);
    const boom = new AppError("Loại tệp không hợp lệ cho mục đích này", 415, ErrorCode.ASSET_001);
    links.attach.mockImplementation(async (...args: unknown[]) => {
      if ((args[1] as { targetType: string }).targetType === "WORKSPACE_COVER") throw boom;
    });
    const { service } = buildService(assetLinks);

    await expect(service.create(OWNER, { name: "Nhóm lỗi", coverAssetId: COVER })).rejects.toBe(boom);
    expect(mockOutboxAdd).not.toHaveBeenCalled();
  });
});

describe("WorkspaceService.patch — ảnh nhóm", () => {
  function patchTx(calls: string[], current: Workspace = workspaceRow()) {
    let state: Workspace = { ...current };
    const tx = {
      workspace: {
        updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          calls.push("workspace.updateMany");
          if (where.id !== state.id || where.version !== state.version || where.status !== state.status) return { count: 0 };
          const { version, ...rest } = data as { version: { increment: number } } & Record<string, unknown>;
          state = { ...state, ...rest, version: state.version + version.increment } as Workspace;
          return { count: 1 };
        }),
        findUnique: jest.fn(async () => ({ ...state })),
        findUniqueOrThrow: jest.fn(async () => ({ ...state })),
      },
    };
    mockTx = tx;
    return { tx, state: () => state };
  }

  const dataOf = (tx: ReturnType<typeof patchTx>["tx"]) => tx.workspace.updateMany.mock.calls[0][0].data as Record<string, unknown>;

  it("coverAssetId = id → cột ghi trong CÙNG updateMany CAS (version+1) rồi replace WORKSPACE_COVER scope WORKSPACE, allowedScopes [AVATAR]", async () => {
    const { links, calls, service: assetLinks } = assetLinksMock();
    const { tx } = patchTx(calls);
    const { service } = buildService(assetLinks);

    const detail = await service.patch(OWNER, WS, { coverAssetId: COVER, expectedVersion: 1 }, OWNER_ACCESS);

    expect(tx.workspace.updateMany).toHaveBeenCalledWith({
      where: { id: WS, version: 1, status: "ACTIVE" },
      data: { coverAssetId: COVER, version: { increment: 1 } },
    });
    expect(links.replace).toHaveBeenCalledWith(tx, {
      targetType: "WORKSPACE_COVER",
      targetId: WS,
      assetId: COVER,
      scopeType: "WORKSPACE",
      scopeId: WS,
      actorId: OWNER,
      allowedScopes: ["AVATAR"],
    });
    expect(links.detach).not.toHaveBeenCalled();
    expect(calls).toEqual(["workspace.updateMany", "replace"]);
    expect(mockOutboxAdd).toHaveBeenCalledWith(tx, expect.objectContaining({ type: "workspace.updated", dedupeKey: `workspace.updated:${WS}:v2` }));
    expect(detail).toMatchObject({ version: 2, coverUrl: imageUrl(COVER, "ORIGINAL"), coverThumbUrl: imageUrl(COVER, "THUMB") });
  });

  it("coverAssetId = null → cột null + detach WORKSPACE_COVER (không replace)", async () => {
    const { links, calls, service: assetLinks } = assetLinksMock();
    const { tx } = patchTx(calls, workspaceRow({ coverAssetId: COVER }));
    const { service } = buildService(assetLinks);

    const detail = await service.patch(OWNER, WS, { coverAssetId: null, expectedVersion: 1 }, OWNER_ACCESS);

    expect(dataOf(tx)).toEqual({ coverAssetId: null, version: { increment: 1 } });
    expect(links.detach).toHaveBeenCalledWith(tx, { targetType: "WORKSPACE_COVER", targetId: WS });
    expect(links.replace).not.toHaveBeenCalled();
    expect(detail).toMatchObject({ coverUrl: null, coverThumbUrl: null });
  });

  it("avatarAssetId = id + coverPreset = null → replace WORKSPACE_AVATAR; preset ghi cột null; bìa không đụng", async () => {
    const { links, calls, service: assetLinks } = assetLinksMock();
    const { tx } = patchTx(calls, workspaceRow({ coverPreset: "rose" }));
    const { service } = buildService(assetLinks);

    await service.patch(OWNER, WS, { avatarAssetId: AVATAR, coverPreset: null, expectedVersion: 1 }, OWNER_ACCESS);

    expect(dataOf(tx)).toEqual({ avatarAssetId: AVATAR, coverPreset: null, version: { increment: 1 } });
    expect(links.replace).toHaveBeenCalledTimes(1);
    expect(links.replace).toHaveBeenCalledWith(tx, expect.objectContaining({ targetType: "WORKSPACE_AVATAR", assetId: AVATAR, allowedScopes: ["AVATAR"] }));
    expect(links.detach).not.toHaveBeenCalled();
  });

  it("chỉ coverPreset → ghi cột, KHÔNG gọi attach/detach/replace", async () => {
    const { links, calls, service: assetLinks } = assetLinksMock();
    const { tx } = patchTx(calls);
    const { service } = buildService(assetLinks);

    const detail = await service.patch(OWNER, WS, { coverPreset: "ocean", expectedVersion: 1 }, OWNER_ACCESS);

    expect(dataOf(tx)).toEqual({ coverPreset: "ocean", version: { increment: 1 } });
    expect([links.attach, links.detach, links.replace].every((fn) => fn.mock.calls.length === 0)).toBe(true);
    expect(detail.coverPreset).toBe("ocean");
  });

  it("không gửi trường ảnh (chỉ đổi tên) → data không có cột ảnh, không đụng link", async () => {
    const { links, calls, service: assetLinks } = assetLinksMock();
    const { tx } = patchTx(calls);
    const { service } = buildService(assetLinks);

    await service.patch(OWNER, WS, { name: "Tên mới", expectedVersion: 1 }, OWNER_ACCESS);

    const data = dataOf(tx);
    for (const key of ["avatarAssetId", "coverAssetId", "coverPreset"]) expect(data).not.toHaveProperty(key);
    expect(calls).toEqual(["workspace.updateMany"]);
    expect(links.replace).not.toHaveBeenCalled();
  });

  it("version lệch → 409 RES_003, KHÔNG đổi link (syncImage chạy sau CAS)", async () => {
    const { links, calls, service: assetLinks } = assetLinksMock();
    patchTx(calls, workspaceRow({ version: 5 }));
    const { service } = buildService(assetLinks);

    await expect(service.patch(OWNER, WS, { coverAssetId: COVER, expectedVersion: 1 }, OWNER_ACCESS)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: ErrorCode.RES_003,
    });
    expect(links.replace).not.toHaveBeenCalled();
    expect(mockOutboxAdd).not.toHaveBeenCalled();
  });

  it("replace lỗi (sai scope/không phải chủ asset) → patch reject nguyên lỗi, KHÔNG ghi outbox (tx rollback cả cột lẫn version)", async () => {
    const { links, calls, service: assetLinks } = assetLinksMock();
    patchTx(calls);
    const boom = new AppError("Loại tệp không hợp lệ cho mục đích này", 415, ErrorCode.ASSET_001);
    links.replace.mockRejectedValue(boom);
    const { service } = buildService(assetLinks);

    await expect(service.patch(OWNER, WS, { coverAssetId: COVER, expectedVersion: 1 }, OWNER_ACCESS)).rejects.toBe(boom);
    expect(mockOutboxAdd).not.toHaveBeenCalled();
  });
});

describe("DTO tạo/sửa nhóm — ảnh", () => {
  const base = { expectedVersion: 1 };

  it("updateWorkspaceSchema: CHỈ gửi coverPreset (hợp lệ hoặc null) là một thay đổi hợp lệ; preset lạ → lỗi", () => {
    expect(updateWorkspaceSchema.safeParse({ ...base, coverPreset: "ocean" }).success).toBe(true);
    expect(updateWorkspaceSchema.safeParse({ ...base, coverPreset: null }).success).toBe(true);
    for (const coverPreset of ["neon", "Ocean", "", 1]) {
      expect(updateWorkspaceSchema.safeParse({ ...base, coverPreset }).success).toBe(false);
    }
  });

  it("updateWorkspaceSchema: coverAssetId ObjectId/null là thay đổi hợp lệ; sai định dạng → lỗi; không gửi gì → 'Không có thay đổi'", () => {
    expect(updateWorkspaceSchema.safeParse({ ...base, coverAssetId: COVER }).success).toBe(true);
    expect(updateWorkspaceSchema.safeParse({ ...base, coverAssetId: null }).success).toBe(true);
    expect(updateWorkspaceSchema.safeParse({ ...base, coverAssetId: "khong-phai-id" }).success).toBe(false);
    const empty = updateWorkspaceSchema.safeParse(base);
    expect(empty.success).toBe(false);
    expect(empty.success ? [] : empty.error.issues.map((i) => i.message)).toContain("Không có thay đổi");
  });

  it("createWorkspaceSchema: coverAssetId phải là ObjectId (không nhận null khi tạo); coverPreset theo bảng khoá", () => {
    expect(createWorkspaceSchema.safeParse({ name: "Nhóm học", coverAssetId: COVER, coverPreset: "violet" }).success).toBe(true);
    expect(createWorkspaceSchema.safeParse({ name: "Nhóm học", coverAssetId: null }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: "Nhóm học", coverAssetId: "abc" }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: "Nhóm học", coverPreset: "neon" }).success).toBe(false);
  });
});
