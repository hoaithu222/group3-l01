import type { Asset } from "../../assets/public";
import { PublicAssetsGamBadgeIcons } from "../services/badge-icon.port";
import type { TxHandle } from "../repositories/tx";

const getForAttach = jest.fn();
const attach = jest.fn(() => Promise.resolve());
const detach = jest.fn(() => Promise.resolve());

jest.mock("../../assets/public", () => ({
  createAssetLifecycleService: () => ({ getForAttach }),
  createAssetLinkService: () => ({ attach, detach }),
}));

const asset = (over: Partial<Asset> = {}): { asset: Asset; linked: boolean } => ({
  asset: { id: "a1", ownerId: "admin1", scope: "BADGE", kind: "IMAGE", status: "READY", parentAssetId: null, ...over } as Asset,
  linked: false,
});

describe("PublicAssetsGamBadgeIcons.assertUsable — kiểm ảnh huy hiệu", () => {
  const port = new PublicAssetsGamBadgeIcons();
  beforeEach(() => jest.clearAllMocks());

  it("asset READY, scope BADGE, IMAGE gốc, của người lưu, chưa gắn → hợp lệ", async () => {
    getForAttach.mockResolvedValueOnce(asset());
    await expect(port.assertUsable("a1", "admin1")).resolves.toBeUndefined();
  });

  it("không tồn tại → 404", async () => {
    getForAttach.mockResolvedValueOnce(null);
    await expect(port.assertUsable("a1", "admin1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("chưa READY (UPLOADING/PROCESSING/REJECTED) → 409 ASSET_003", async () => {
    for (const status of ["UPLOADING", "PROCESSING", "REJECTED", "DELETED"] as const) {
      getForAttach.mockResolvedValueOnce(asset({ status }));
      await expect(port.assertUsable("a1", "admin1")).rejects.toMatchObject({ statusCode: 409, errorCode: "ASSET_003" });
    }
  });

  it("sai scope (AVATAR/STUDY/MESSAGE), sai kind, hoặc là thumbnail con → 415 ASSET_001", async () => {
    for (const over of [{ scope: "AVATAR" }, { scope: "STUDY" }, { scope: "MESSAGE" }, { kind: "FILE" }, { parentAssetId: "root" }] as Array<Partial<Asset>>) {
      getForAttach.mockResolvedValueOnce(asset(over));
      await expect(port.assertUsable("a1", "admin1")).rejects.toMatchObject({ statusCode: 415, errorCode: "ASSET_001" });
    }
  });

  it("của người khác → 403 ASSET_005", async () => {
    getForAttach.mockResolvedValueOnce(asset({ ownerId: "someone" }));
    await expect(port.assertUsable("a1", "admin1")).rejects.toMatchObject({ statusCode: 403, errorCode: "ASSET_005" });
  });

  it("đã gắn nơi khác → 409 ASSET_004", async () => {
    getForAttach.mockResolvedValueOnce({ ...asset(), linked: true });
    await expect(port.assertUsable("a1", "admin1")).rejects.toMatchObject({ statusCode: 409, errorCode: "ASSET_004" });
  });
});

describe("PublicAssetsGamBadgeIcons.attach/detach", () => {
  const port = new PublicAssetsGamBadgeIcons();
  const tx = {} as TxHandle;
  beforeEach(() => jest.clearAllMocks());

  it("attach: đích BADGE_ICON, scope NONE (quyền đọc do resolver), targetId = id huy hiệu", async () => {
    await port.attach(tx, { badgeId: "b1", assetId: "a1", actorId: "admin1" });
    expect(attach).toHaveBeenCalledWith(tx, { assetIds: ["a1"], targetType: "BADGE_ICON", targetId: "b1", scopeType: "NONE", actorId: "admin1" });
  });

  it("detach: chỉ gỡ link của asset đó khỏi huy hiệu đó", async () => {
    await port.detach(tx, { badgeId: "b1", assetId: "a1" });
    expect(detach).toHaveBeenCalledWith(tx, { targetType: "BADGE_ICON", targetId: "b1", assetIds: ["a1"] });
  });
});
