/**
 * Unit — `AssetLinkService.attach/replace` với `allowedScopes` (ảnh nhóm chỉ nhận asset scope `AVATAR`): sai scope → 415 `ASSET_001`,
 * không ghi link nào; không truyền → hành vi cũ (không kiểm scope). `WORKSPACE_COVER` là đích chỉ nhận ảnh. Transaction giả (một object
 * `tx` duy nhất); kiểm rollback thật của `replace` ở `tests/integration/asset-link.service.test.ts` + `workspaces.routes.test.ts`.
 */
import type { Prisma } from "@prisma/client";
import { ErrorCode } from "../../../core/utils/error.codes";
import { AssetLinkService } from "../services/asset-link.service";
import type { AssetAccessService } from "../services/asset-access.service";

const OWNER = "65f00000000000000000cc01";
const WS = "65f00000000000000000cc02";

interface FakeAsset {
  id: string;
  ownerId: string;
  scope: string;
  kind: string;
  status: string;
  parentAssetId: string | null;
}

function asset(id: string, over: Partial<FakeAsset> = {}): FakeAsset {
  return { id, ownerId: OWNER, scope: "AVATAR", kind: "IMAGE", status: "READY", parentAssetId: null, ...over };
}

function fakeTx(assets: FakeAsset[], existingLinkAssetIds: string[] = []) {
  const calls: string[] = [];
  const tx = {
    asset: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => assets.filter((a) => where.id.in.includes(a.id))),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    assetLink: {
      findMany: jest.fn(async () => {
        calls.push("link.findMany");
        return existingLinkAssetIds.map((assetId) => ({ assetId }));
      }),
      deleteMany: jest.fn(async () => {
        calls.push("link.deleteMany");
        return { count: existingLinkAssetIds.length };
      }),
      upsert: jest.fn(async () => {
        calls.push("link.upsert");
        return {};
      }),
    },
  };
  return { tx, calls, asTx: tx as unknown as Prisma.TransactionClient };
}

const service = () => new AssetLinkService({ canRead: jest.fn() } as unknown as AssetAccessService);
const coverInput = (assetIds: string[]) => ({
  assetIds,
  targetType: "WORKSPACE_COVER" as const,
  targetId: WS,
  scopeType: "WORKSPACE" as const,
  scopeId: WS,
  actorId: OWNER,
});

describe("AssetLinkService — allowedScopes", () => {
  it("attach: scope của asset KHÔNG thuộc allowedScopes → 415 ASSET_001, không upsert link nào", async () => {
    const { tx, asTx } = fakeTx([asset("a1", { scope: "MESSAGE" })]);
    await expect(service().attach(asTx, { ...coverInput(["a1"]), allowedScopes: ["AVATAR"] })).rejects.toMatchObject({
      statusCode: 415,
      errorCode: ErrorCode.ASSET_001,
    });
    expect(tx.assetLink.upsert).not.toHaveBeenCalled();
  });

  it("attach nhiều asset: chỉ một cái sai scope → 415 và KHÔNG gắn cái nào (kiểm hết trước khi ghi)", async () => {
    const { tx, asTx } = fakeTx([asset("a1"), asset("a2", { scope: "RESOURCE" })]);
    await expect(
      service().attach(asTx, { ...coverInput(["a1", "a2"]), targetType: "MESSAGE", scopeType: "NONE", allowedScopes: ["AVATAR"] })
    ).rejects.toMatchObject({ statusCode: 415, errorCode: ErrorCode.ASSET_001 });
    expect(tx.assetLink.upsert).not.toHaveBeenCalled();
  });

  it("attach: scope khớp → upsert link đúng đích/scope (idempotent theo assetId+targetType+targetId)", async () => {
    const { tx, asTx } = fakeTx([asset("a1")]);
    await service().attach(asTx, { ...coverInput(["a1"]), allowedScopes: ["AVATAR"] });
    expect(tx.assetLink.upsert).toHaveBeenCalledTimes(1);
    expect(tx.assetLink.upsert).toHaveBeenCalledWith({
      where: { assetId_targetType_targetId: { assetId: "a1", targetType: "WORKSPACE_COVER", targetId: WS } },
      create: { assetId: "a1", targetType: "WORKSPACE_COVER", targetId: WS, scopeType: "WORKSPACE", scopeId: WS, createdBy: OWNER },
      update: {},
    });
  });

  it("KHÔNG truyền allowedScopes → như cũ: asset scope MESSAGE vẫn gắn được", async () => {
    const { tx, asTx } = fakeTx([asset("a1", { scope: "MESSAGE" })]);
    await service().attach(asTx, coverInput(["a1"]));
    expect(tx.assetLink.upsert).toHaveBeenCalledTimes(1);
  });

  it("WORKSPACE_COVER chỉ nhận kind IMAGE (kể cả không có allowedScopes) → 415 ASSET_001", async () => {
    const { tx, asTx } = fakeTx([asset("v1", { kind: "VIDEO" })]);
    await expect(service().attach(asTx, coverInput(["v1"]))).rejects.toMatchObject({ statusCode: 415, errorCode: ErrorCode.ASSET_001 });
    expect(tx.assetLink.upsert).not.toHaveBeenCalled();
  });

  it("replace: chuyển allowedScopes xuống attach — sai scope → 415 sau khi đã gỡ link cũ (caller rollback), không gắn link mới", async () => {
    const { tx, calls, asTx } = fakeTx([asset("new", { scope: "MESSAGE" })], ["old"]);
    await expect(
      service().replace(asTx, { targetType: "WORKSPACE_COVER", targetId: WS, assetId: "new", scopeType: "WORKSPACE", scopeId: WS, actorId: OWNER, allowedScopes: ["AVATAR"] })
    ).rejects.toMatchObject({ statusCode: 415, errorCode: ErrorCode.ASSET_001 });
    expect(calls).toEqual(["link.findMany", "link.deleteMany"]);
    expect(tx.assetLink.upsert).not.toHaveBeenCalled();
  });

  it("replace: scope khớp → gỡ link cũ (đánh dấu lastUnlinkedAt) rồi gắn link mới, cùng một tx", async () => {
    const { tx, calls, asTx } = fakeTx([asset("new")], ["old"]);
    await service().replace(asTx, { targetType: "WORKSPACE_AVATAR", targetId: WS, assetId: "new", scopeType: "WORKSPACE", scopeId: WS, actorId: OWNER, allowedScopes: ["AVATAR"] });
    expect(calls).toEqual(["link.findMany", "link.deleteMany", "link.upsert"]);
    expect(tx.asset.updateMany).toHaveBeenCalledWith({ where: { id: "old" }, data: { lastUnlinkedAt: expect.any(Date) } });
  });
});
