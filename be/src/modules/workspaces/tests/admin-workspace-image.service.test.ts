/**
 * Unit — `AdminWorkspaceImageService.remove` (`POST /admin/workspaces/:id/remove-image`): có ảnh → cột null + `version`+1 + `detach` link +
 * outbox `workspace.updated` + thông báo chủ nhóm (`workspace.admin-change`, `refs.action`) trong CÙNG tx, rồi audit `workspace.image-remove`;
 * không có ảnh loại đó → `removed:false`, không ghi gì; nhóm không tồn tại → 404. Tx giả là MỘT object (kiểm cùng transaction).
 */
const mockOutboxAdd = jest.fn();
const mockAuditRecord = jest.fn();
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

import { AdminWorkspaceImageService } from "../services/admin-workspace-image.service";
import type { AssetLinkService } from "../../assets/public";
import type { Workspace } from "../entities/workspace.interface";

const WS = "65f0000000000000000022a1";
const OWNER = "65f0000000000000000022b1";
const ADMIN = "65f0000000000000000022b2";
const AVATAR = "65f0000000000000000022c1";
const COVER = "65f0000000000000000022c2";
const REASON = "Ảnh vi phạm tiêu chuẩn cộng đồng";
const imageUrl = (assetId: string, variant: "THUMB" | "ORIGINAL") =>
  expect.stringMatching(new RegExp(`/api/v1/assets/${assetId}/image\\?v=${variant}&e=\\d+&s=[0-9a-f]{64}$`));

function workspaceRow(over: Partial<Workspace> = {}): Workspace {
  return {
    id: WS,
    name: "Nhóm vi phạm",
    normalizedName: "nhom vi pham",
    description: null,
    avatarAssetId: AVATAR,
    ownerId: OWNER,
    defaultChannelId: null,
    status: "ACTIVE",
    archivedAt: null,
    archivedBy: null,
    archivedReason: null,
    archiveNote: null,
    memberCount: 4,
    lastActivityAt: new Date("2026-09-20T00:00:00Z"),
    version: 3,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-20T00:00:00Z"),
    coverAssetId: COVER,
    coverPreset: "ocean",
    ...over,
  };
}

/** Tx giả có trạng thái + repo `adminGetDetail` đọc CÙNG trạng thái (như đọc lại sau commit). */
function harness(initial: Workspace | null) {
  const box: { ws: Workspace | null } = { ws: initial ? { ...initial } : null };
  const tx = {
    workspace: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (box.ws && box.ws.id === where.id ? { ...box.ws } : null)),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (!box.ws) throw new Error("không có nhóm");
        const { version, ...rest } = data as { version: { increment: number } } & Record<string, unknown>;
        box.ws = { ...box.ws, ...rest, version: box.ws.version + version.increment } as Workspace;
        return { ...box.ws };
      }),
    },
  };
  mockTx = tx;
  const detach = jest.fn(async (..._args: unknown[]): Promise<void> => undefined);
  const repo = {
    adminGetDetail: jest.fn(async (id: string) => (box.ws && box.ws.id === id ? { workspace: box.ws, owner: { id: OWNER, name: "Chủ nhóm" } } : null)),
  };
  const service = new AdminWorkspaceImageService(repo, { detach } as unknown as Pick<AssetLinkService, "detach">);
  return { box, tx, detach, service };
}

beforeEach(() => {
  mockOutboxAdd.mockReset().mockResolvedValue(undefined);
  mockAuditRecord.mockReset().mockResolvedValue(undefined);
  mockNotify.mockReset().mockResolvedValue({ notificationId: "n1" });
});

describe("AdminWorkspaceImageService.remove", () => {
  it("gỡ ảnh BÌA: cột null + version+1 + detach WORKSPACE_COVER + outbox + notify chủ nhóm (cover-removed) cùng tx, rồi audit", async () => {
    const { box, tx, detach, service } = harness(workspaceRow());

    const result = await service.remove(ADMIN, WS, { kind: "COVER", reason: REASON });

    expect(result.removed).toBe(true);
    expect(box.ws).toMatchObject({ coverAssetId: null, avatarAssetId: AVATAR, coverPreset: "ocean", version: 4 });
    expect(tx.workspace.update).toHaveBeenCalledWith({ where: { id: WS }, data: { coverAssetId: null, version: { increment: 1 } } });
    expect(detach).toHaveBeenCalledWith(tx, { targetType: "WORKSPACE_COVER", targetId: WS });
    expect(mockOutboxAdd).toHaveBeenCalledWith(tx, {
      type: "workspace.updated",
      aggregateType: "Workspace",
      aggregateId: WS,
      queue: "notifications",
      jobName: "workspace.events",
      dedupeKey: `workspace.updated:${WS}:v4`,
      payload: { event: "updated", workspaceId: WS },
    });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: "workspace.admin-change",
        actorId: ADMIN,
        scope: { type: "WORKSPACE", id: WS },
        workspaceId: WS,
        refs: { workspaceId: WS, action: "cover-removed" },
        recipients: [{ userId: OWNER }],
        dedupeKey: `workspace.admin-change:${WS}:cover-removed:v4`,
      })
    );
    expect(mockAuditRecord).toHaveBeenCalledWith({
      actorId: ADMIN,
      action: "workspace.image-remove",
      targetType: "Workspace",
      targetId: WS,
      workspaceId: WS,
      reason: REASON,
      metadata: { kind: "COVER" },
    });
    // Hàng admin trả về: bìa quay về mẫu nền (preset giữ nguyên), ảnh đại diện còn.
    expect(result.workspace).toMatchObject({
      id: WS,
      owner: { id: OWNER, name: "Chủ nhóm" },
      coverUrl: null,
      coverThumbUrl: null,
      coverPreset: "ocean",
      avatarUrl: imageUrl(AVATAR, "THUMB"),
    });
  });

  it("gỡ ẢNH ĐẠI DIỆN: avatarAssetId null + detach WORKSPACE_AVATAR, refs.action = avatar-removed; bìa còn nguyên", async () => {
    const { box, detach, service } = harness(workspaceRow());

    const result = await service.remove(ADMIN, WS, { kind: "AVATAR", reason: REASON });

    expect(result.removed).toBe(true);
    expect(box.ws).toMatchObject({ avatarAssetId: null, coverAssetId: COVER, version: 4 });
    expect(detach).toHaveBeenCalledWith(expect.anything(), { targetType: "WORKSPACE_AVATAR", targetId: WS });
    expect(mockNotify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ refs: { workspaceId: WS, action: "avatar-removed" } }));
    expect(mockAuditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: "workspace.image-remove", metadata: { kind: "AVATAR" } }));
    expect(result.workspace).toMatchObject({ avatarUrl: null, coverUrl: imageUrl(COVER, "ORIGINAL") });
  });

  it("gỡ bìa rồi gỡ ảnh đại diện: mỗi lần một `source.id` RIÊNG (khoá gộp hộp thư theo người nhận) — chủ nhóm nhận đủ 2 thông báo", async () => {
    const { service } = harness(workspaceRow());

    await service.remove(ADMIN, WS, { kind: "COVER", reason: REASON });
    await service.remove(ADMIN, WS, { kind: "AVATAR", reason: REASON });

    const sources = mockNotify.mock.calls.map((c) => (c[1] as { source: { id: string } }).source.id);
    expect(sources).toHaveLength(2);
    expect(new Set(sources).size).toBe(2);
    expect(sources).not.toContain(WS);
  });

  it("nhóm đã LƯU TRỮ vẫn gỡ được (không kiểm status)", async () => {
    const { box, service } = harness(workspaceRow({ status: "ARCHIVED" }));
    await expect(service.remove(ADMIN, WS, { kind: "COVER", reason: REASON })).resolves.toMatchObject({ removed: true });
    expect(box.ws?.coverAssetId).toBeNull();
  });

  it("nhóm KHÔNG có ảnh loại đó → removed:false, không update/detach/outbox/notify/audit, version giữ nguyên", async () => {
    const { box, tx, detach, service } = harness(workspaceRow({ coverAssetId: null }));

    const result = await service.remove(ADMIN, WS, { kind: "COVER", reason: REASON });

    expect(result.removed).toBe(false);
    expect(box.ws?.version).toBe(3);
    expect(tx.workspace.update).not.toHaveBeenCalled();
    expect(detach).not.toHaveBeenCalled();
    expect(mockOutboxAdd).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockAuditRecord).not.toHaveBeenCalled();
    expect(result.workspace).toMatchObject({ id: WS, coverUrl: null, avatarUrl: imageUrl(AVATAR, "THUMB") });
  });

  it("nhóm không tồn tại → 404, không ghi gì", async () => {
    const { tx, detach, service } = harness(null);

    await expect(service.remove(ADMIN, WS, { kind: "AVATAR", reason: REASON })).rejects.toMatchObject({ statusCode: 404 });
    expect(tx.workspace.update).not.toHaveBeenCalled();
    expect(detach).not.toHaveBeenCalled();
    expect(mockOutboxAdd).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockAuditRecord).not.toHaveBeenCalled();
  });
});
