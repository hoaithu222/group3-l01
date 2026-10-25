import { installMocks } from "./portfolio-test-mocks";
import { prisma } from "../../../../infrastructure/database";
import { newObjectId } from "../../../../core/utils/object-id";
import { withTransaction } from "../../../../infrastructure/database";
import { PublicPortfolioAssets } from "../../services/portfolio.ports";
import { cleanup, seedUser } from "./portfolio-test-kit";

/**
 * Cổng ảnh thật của portfolio (`PublicPortfolioAssets` trên `AssetLifecycleService`/`AssetLinkService` + Mongo): chỉ ảnh READY, kind IMAGE, scope AVATAR, của CHÍNH CHỦ mới dùng được;
 * link `PORTFOLIO` scope NONE (chỉ chủ đọc — trang công khai dùng bản đã copy vào build); thay/gỡ link đúng.
 */
const users: string[] = [];
const assetIds: string[] = [];
let me: string;
let stranger: string;
const port = new PublicPortfolioAssets();

async function asset(over: { ownerId?: string; status?: "READY" | "PROCESSING"; kind?: "IMAGE" | "FILE"; scope?: "AVATAR" | "MESSAGE" } = {}): Promise<string> {
  const id = newObjectId();
  await prisma.asset.create({
    data: {
      id,
      ownerId: over.ownerId ?? me,
      scope: over.scope ?? "AVATAR",
      kind: over.kind ?? "IMAGE",
      status: over.status ?? "READY",
      uploadMethod: "API_PUT",
      mime: "image/png",
      declaredSize: 1000,
      size: 1000,
      originalName: "a.png",
      storageKey: `test/portfolio/${id}/original.png`,
    },
  });
  assetIds.push(id);
  return id;
}

beforeAll(async () => {
  installMocks();
  me = await seedUser("Chủ ảnh");
  stranger = await seedUser("Người lạ");
  users.push(me, stranger);
});

beforeEach(() => installMocks());

afterAll(async () => {
  await prisma.assetLink.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  await cleanup(users, []);
});

describe("assertUsableImage", () => {
  it("ảnh READY, IMAGE, scope AVATAR, của chính chủ → dùng được", async () => {
    await expect(port.assertUsableImage(me, await asset())).resolves.toBeUndefined();
  });

  it("không tồn tại → 404; của người khác → 403 ASSET_005; chưa READY → 409 ASSET_003; không phải ảnh/scope khác → 415 ASSET_001", async () => {
    await expect(port.assertUsableImage(me, newObjectId())).rejects.toMatchObject({ statusCode: 404 });
    await expect(port.assertUsableImage(stranger, await asset())).rejects.toMatchObject({ statusCode: 403, errorCode: "ASSET_005" });
    await expect(port.assertUsableImage(me, await asset({ status: "PROCESSING" }))).rejects.toMatchObject({ statusCode: 409, errorCode: "ASSET_003" });
    await expect(port.assertUsableImage(me, await asset({ kind: "FILE" }))).rejects.toMatchObject({ statusCode: 415, errorCode: "ASSET_001" });
    await expect(port.assertUsableImage(me, await asset({ scope: "MESSAGE" }))).rejects.toMatchObject({ statusCode: 415, errorCode: "ASSET_001" });
  });
});

describe("replace / detachAll (AssetLink PORTFOLIO, scope NONE)", () => {
  it("replace: tạo link đúng loại/đích/scope; thay ảnh khác → chỉ còn link mới; gỡ → mất link và asset được đánh dấu bỏ liên kết", async () => {
    const targetId = newObjectId();
    const a = await asset();
    const b = await asset();
    await withTransaction((tx) => port.replace(tx, { userId: me, assetId: a, targetId }));
    let links = await prisma.assetLink.findMany({ where: { targetType: "PORTFOLIO", targetId } });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ assetId: a, scopeType: "NONE", createdBy: me });
    expect(links[0].scopeId ?? null).toBeNull();

    await withTransaction((tx) => port.replace(tx, { userId: me, assetId: b, targetId }));
    links = await prisma.assetLink.findMany({ where: { targetType: "PORTFOLIO", targetId } });
    expect(links.map((l) => l.assetId)).toEqual([b]);
    expect((await prisma.asset.findUnique({ where: { id: a } }))?.lastUnlinkedAt).not.toBeNull();

    await withTransaction((tx) => port.detachAll(tx, targetId));
    expect(await prisma.assetLink.count({ where: { targetType: "PORTFOLIO", targetId } })).toBe(0);
    expect((await prisma.asset.findUnique({ where: { id: b } }))?.lastUnlinkedAt).not.toBeNull();
  });

  it("gắn ảnh của người khác bị chặn ở tầng link (403 ASSET_005) — không tạo link", async () => {
    const targetId = newObjectId();
    const foreign = await asset({ ownerId: stranger });
    await expect(withTransaction((tx) => port.replace(tx, { userId: me, assetId: foreign, targetId }))).rejects.toMatchObject({ statusCode: 403, errorCode: "ASSET_005" });
    expect(await prisma.assetLink.count({ where: { targetType: "PORTFOLIO", targetId } })).toBe(0);
  });

  it("detachAll trên đích chưa có link → không lỗi", async () => {
    await expect(withTransaction((tx) => port.detachAll(tx, newObjectId()))).resolves.toBeUndefined();
  });
});
