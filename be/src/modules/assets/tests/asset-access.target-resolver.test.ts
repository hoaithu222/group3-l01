import { AssetAccessService } from "../services/asset-access.service";
import { InMemoryAssetLinkRepository } from "../repositories/asset-link.repository.inmemory";
import { clearAssetTargetReadResolvers, registerAssetTargetReadResolver } from "../../../shared/ports/asset-target-access.port";

/**
 * p4-01 — quyền đọc asset theo RESOLVER đăng ký cho target (`STUDY_ITEM`/`STUDY_SET_COVER`): `assets` không import module `study`,
 * chỉ tra registry `shared/ports/asset-target-access.port`. Đã có resolver → CHỈ resolver quyết định link đó; chưa đăng ký
 * (worker) → rơi về `scopeType NONE` = chỉ chủ asset (fail-closed).
 */
describe("AssetAccessService — resolver theo target (STUDY_ITEM / STUDY_SET_COVER)", () => {
  const owner = { id: "owner", email: "o@e.com" };
  const other = { id: "other", email: "x@e.com" };
  const subject = { id: "a1", ownerId: "owner", status: "READY" as const, parentAssetId: null };
  const service = () => new AssetAccessService(new InMemoryAssetLinkRepository());

  beforeEach(() => {
    InMemoryAssetLinkRepository.clearStore();
    clearAssetTargetReadResolvers();
  });
  afterAll(() => clearAssetTargetReadResolvers());

  const link = (targetId: string, targetType: "STUDY_ITEM" | "STUDY_SET_COVER" = "STUDY_ITEM") =>
    InMemoryAssetLinkRepository.seed({ assetId: "a1", targetType, targetId, scopeType: "NONE", scopeId: undefined as never, createdBy: "owner" });

  it("chưa đăng ký resolver: link scopeType NONE → chỉ chủ asset đọc được (fail-closed)", async () => {
    link("item1");
    await expect(service().canRead(owner, subject)).resolves.toBe(true);
    await expect(service().canRead(other, subject)).resolves.toBe(false);
  });

  it("đã đăng ký: resolver quyết định (kể cả cho người KHÔNG phải chủ asset); nhận đúng thông tin link", async () => {
    link("item1");
    const canRead = jest.fn().mockResolvedValue(true);
    registerAssetTargetReadResolver("STUDY_ITEM", { canRead });
    await expect(service().canRead(other, subject)).resolves.toBe(true);
    expect(canRead).toHaveBeenCalledWith(other, expect.objectContaining({ assetId: "a1", targetType: "STUDY_ITEM", targetId: "item1", scopeType: "NONE" }));
  });

  it("resolver từ chối → KHÔNG đọc được, kể cả chủ asset (bộ đã đổi phạm vi thì mọi link theo bộ đều thu hồi)", async () => {
    link("item1");
    registerAssetTargetReadResolver("STUDY_ITEM", { canRead: () => Promise.resolve(false) });
    await expect(service().canRead(owner, subject)).resolves.toBe(false);
    await expect(service().assertRead(other, subject)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("nhiều link (bản gốc + bản sao): chỉ cần MỘT link được resolver cho qua (ST-18)", async () => {
    link("origItem");
    link("copyItem");
    registerAssetTargetReadResolver("STUDY_ITEM", { canRead: (_u, l) => Promise.resolve(l.targetId === "copyItem") });
    await expect(service().canRead(other, subject)).resolves.toBe(true);
  });

  it("resolver đăng ký cho STUDY_ITEM KHÔNG ảnh hưởng target khác (STUDY_SET_COVER dùng resolver riêng)", async () => {
    link("set1", "STUDY_SET_COVER");
    registerAssetTargetReadResolver("STUDY_ITEM", { canRead: () => Promise.resolve(true) });
    await expect(service().canRead(other, subject)).resolves.toBe(false); // cover chưa có resolver → NONE → chỉ chủ
    registerAssetTargetReadResolver("STUDY_SET_COVER", { canRead: () => Promise.resolve(true) });
    await expect(service().canRead(other, subject)).resolves.toBe(true);
  });
});
