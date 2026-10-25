import { permissionService } from "../../../core/permission";
import { AssetAccessService } from "../services/asset-access.service";
import { InMemoryAssetLinkRepository } from "../repositories/asset-link.repository.inmemory";
import type { AssetLinkTargetType, AssetLinkScopeType } from "../entities/asset.interface";

/**
 * D-28 (foundation Phase 3) — quyền đọc asset theo TARGET của link: tệp kho tài liệu / đính kèm thẻ / bình luận
 * gắn `scopeType WORKSPACE` nhưng phải hỏi action riêng (không phải `workspace.read`) để GUEST bị 404
 * (p3-04 README §2/§6, ST-17, PM2-24).
 */
describe("AssetAccessService — quyền đọc theo target (Phase 3)", () => {
  const user = { id: "u1", email: "u1@example.com" };
  const subject = (id: string) => ({ id, ownerId: "owner", status: "READY" as const, parentAssetId: null });

  beforeEach(() => InMemoryAssetLinkRepository.clearStore());

  function seedLink(targetType: AssetLinkTargetType, scopeType: AssetLinkScopeType, scopeId: string): void {
    InMemoryAssetLinkRepository.seed({ assetId: "a1", targetType, targetId: "t1", scopeType, scopeId, createdBy: "owner" });
  }

  it.each([
    ["RESOURCE", "workspace.resource.read"],
    ["TASK", "workspace.board.read"],
    ["TASK_COMMENT", "workspace.board.read"],
  ] as const)("target %s (scope WORKSPACE) hỏi action %s và KHÔNG hỏi `workspace.read`", async (targetType, action) => {
    seedLink(targetType, "WORKSPACE", "ws1");
    const can = jest.spyOn(permissionService, "can").mockResolvedValue(true);
    const service = new AssetAccessService(new InMemoryAssetLinkRepository());

    await expect(service.canRead(user, subject("a1"))).resolves.toBe(true);
    expect(can).toHaveBeenCalledWith(user, action, { type: "WORKSPACE", id: "ws1" });
    expect(can).not.toHaveBeenCalledWith(user, "workspace.read", expect.anything());
  });

  it("GUEST (không có action tài liệu/board) → không đọc được tệp RESOURCE/TASK dù có `workspace.read`", async () => {
    seedLink("RESOURCE", "WORKSPACE", "ws1");
    // Mô phỏng GUEST: có `workspace.read` nhưng KHÔNG có `workspace.resource.read`.
    jest.spyOn(permissionService, "can").mockImplementation((_u, action) => Promise.resolve(action === "workspace.read"));
    const service = new AssetAccessService(new InMemoryAssetLinkRepository());

    await expect(service.canRead(user, subject("a1"))).resolves.toBe(false);
    await expect(service.assertRead(user, subject("a1"))).rejects.toMatchObject({ statusCode: 404 });
  });

  it("target Phase 1 (MESSAGE + CHANNEL) vẫn dùng action theo scope — không đổi hành vi cũ", async () => {
    seedLink("MESSAGE", "CHANNEL", "ch1");
    const can = jest.spyOn(permissionService, "can").mockResolvedValue(true);
    const service = new AssetAccessService(new InMemoryAssetLinkRepository());

    await expect(service.canRead(user, subject("a1"))).resolves.toBe(true);
    expect(can).toHaveBeenCalledWith(user, "channel.read", { type: "CHANNEL", id: "ch1" });
  });
});
