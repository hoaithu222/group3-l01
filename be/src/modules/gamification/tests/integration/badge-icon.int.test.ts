/**
 * Integration — ảnh huy hiệu (p4-03 be.md §12) trên Mongo memory replset (`TEST_DB=memory`): `BadgeAdminService` thật (Prisma + transaction +
 * `AssetLinkService` thật), KHÔNG mock DB. Kiểm: tạo/đổi/gỡ ảnh gắn/gỡ `AssetLink BADGE_ICON` ĐÚNG huy hiệu, rollback nguyên tử (trùng mã, lệch
 * phiên bản), asset sai (scope/chủ/chưa READY/đã gắn) bị từ chối, và quyền đọc ảnh theo resolver (`AssetAccessService.canRead`).
 */
import { prisma } from "../../../../infrastructure/database";
import { newObjectId } from "../../../../core/utils/object-id";
import { clearAssetTargetReadResolvers } from "../../../../shared/ports/asset-target-access.port";
import { AssetAccessService } from "../../../assets/services/asset-access.service";
import { PrismaAssetLinkRepository } from "../../../assets/repositories/asset-link.repository.prisma";
import { PrismaBadgeRepository } from "../../repositories/badge.repository.prisma";
import { PrismaTxRunner } from "../../repositories/tx";
import { BadgeAdminService } from "../../services/badge-admin.service";
import { PublicAssetsGamBadgeIcons } from "../../services/badge-icon.port";
import { registerGamificationIntegrations } from "../../services/gamification-integrations";
import type { IGamDirectory } from "../../repositories/directory";

jest.setTimeout(60_000);

const admin = newObjectId();
const stranger = newObjectId();
const tag = newObjectId().slice(0, 8);
const actor = { id: admin, email: "admin@x.vn", role: "admin" };
const criteria = { all: [{ counter: "tasksDone", op: "gte", value: 5 }] };

const badges = new PrismaBadgeRepository();
const service = new BadgeAdminService({
  badges,
  userBadges: { countByBadges: () => Promise.resolve(new Map<string, number>()) } as never,
  badgeService: {} as never,
  audit: { record: () => Promise.resolve() },
  jobs: {} as never,
  icons: new PublicAssetsGamBadgeIcons(),
  tx: new PrismaTxRunner(),
});
const access = new AssetAccessService(new PrismaAssetLinkRepository());

async function seedAsset(over: { ownerId?: string; scope?: "BADGE" | "AVATAR"; status?: "READY" | "PROCESSING"; kind?: "IMAGE" | "FILE" } = {}): Promise<string> {
  const id = newObjectId();
  await prisma.asset.create({
    data: {
      id,
      ownerId: over.ownerId ?? admin,
      scope: over.scope ?? "BADGE",
      kind: over.kind ?? "IMAGE",
      variant: "ORIGINAL",
      status: over.status ?? "READY",
      uploadMethod: "API_PUT",
      mime: "image/png",
      declaredSize: 100,
      size: 100,
      originalName: "icon.png",
      storageKey: `test/${tag}/${id}.png`,
    },
  });
  return id;
}

const createDto = (code: string, over: Record<string, unknown> = {}) =>
  ({ code: `${code}-${tag}`, name: "Huy hiệu thử", description: "", rarity: "COMMON", order: 0, criteria, reason: "Tạo huy hiệu để kiểm thử", ...over }) as never;

const linksOf = (badgeId: string) => prisma.assetLink.findMany({ where: { targetType: "BADGE_ICON", targetId: badgeId } });

describe("ảnh huy hiệu (integration)", () => {
  beforeAll(async () => {
    // Mongo in-memory không chạy `db push` ⇒ không có unique index: tạo tay `Badge.code @unique` để có đường P2002 (trùng mã) thật.
    await prisma.$runCommandRaw({ createIndexes: "Badge", indexes: [{ key: { code: 1 }, name: "Badge_code_key", unique: true }] });
    clearAssetTargetReadResolvers();
    registerGamificationIntegrations({ badges, directory: { getRole: () => Promise.resolve("admin") } as unknown as IGamDirectory });
  });

  afterAll(async () => {
    const assets = await prisma.asset.findMany({ where: { storageKey: { startsWith: `test/${tag}/` } }, select: { id: true } });
    await prisma.assetLink.deleteMany({ where: { assetId: { in: assets.map((a) => a.id) } } });
    await prisma.badge.deleteMany({ where: { code: { endsWith: `-${tag}` } } });
    await prisma.asset.deleteMany({ where: { storageKey: { startsWith: `test/${tag}/` } } });
    // Gỡ index tạo tay để không ảnh hưởng suite khác dùng chung DB in-memory.
    await prisma.$runCommandRaw({ dropIndexes: "Badge", index: "Badge_code_key" });
    clearAssetTargetReadResolvers();
  });

  it("tạo có ảnh: huy hiệu lưu iconAssetId và có ĐÚNG một AssetLink BADGE_ICON (scope NONE) trỏ huy hiệu đó", async () => {
    const assetId = await seedAsset();
    const badge = await service.create(actor, createDto("co-anh", { iconAssetId: assetId }));
    expect(badge.iconAssetId).toBe(assetId);
    const links = await linksOf(badge.id);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ assetId, targetType: "BADGE_ICON", targetId: badge.id, scopeType: "NONE", createdBy: admin });
  });

  it("asset không hợp lệ bị từ chối và KHÔNG tạo huy hiệu: sai scope, của người khác, chưa READY, sai kind, đã gắn nơi khác", async () => {
    const cases: Array<[string, Promise<string>, number, string]> = [
      ["scope-sai", seedAsset({ scope: "AVATAR" }), 415, "ASSET_001"],
      ["kind-sai", seedAsset({ kind: "FILE" }), 415, "ASSET_001"],
      ["chu-khac", seedAsset({ ownerId: stranger }), 403, "ASSET_005"],
      ["chua-ready", seedAsset({ status: "PROCESSING" }), 409, "ASSET_003"],
    ];
    for (const [code, assetPromise, statusCode, errorCode] of cases) {
      const assetId = await assetPromise;
      await expect(service.create(actor, createDto(code, { iconAssetId: assetId }))).rejects.toMatchObject({ statusCode, errorCode });
      expect(await prisma.badge.count({ where: { code: `${code}-${tag}` } })).toBe(0);
    }
    const used = await seedAsset();
    await prisma.assetLink.create({ data: { assetId: used, targetType: "MESSAGE", targetId: newObjectId(), scopeType: "NONE", createdBy: admin } });
    await expect(service.create(actor, createDto("da-gan", { iconAssetId: used }))).rejects.toMatchObject({ statusCode: 409, errorCode: "ASSET_004" });
    expect(await prisma.badge.count({ where: { code: `da-gan-${tag}` } })).toBe(0);
    await expect(service.create(actor, createDto("khong-co", { iconAssetId: newObjectId() }))).rejects.toMatchObject({ statusCode: 404 });
  });

  it("trùng mã: rollback cả transaction — không link nào được gắn cho asset", async () => {
    const first = await service.create(actor, createDto("trung"));
    expect(first.code).toBe(`trung-${tag}`);
    const assetId = await seedAsset();
    await expect(service.create(actor, createDto("trung", { iconAssetId: assetId }))).rejects.toMatchObject({ statusCode: 409, errorCode: "GAME_003" });
    expect(await prisma.assetLink.count({ where: { assetId } })).toBe(0);
  });

  it("đổi ảnh: gỡ link cũ (asset cũ có lastUnlinkedAt) + gắn link mới; gỡ ảnh (null): không còn link", async () => {
    const oldAsset = await seedAsset();
    const newAsset = await seedAsset();
    const badge = await service.create(actor, createDto("doi-anh", { iconAssetId: oldAsset }));

    const changed = await service.patch(actor, badge.id, { expectedVersion: badge.version, iconAssetId: newAsset, reason: "Đổi ảnh huy hiệu mới" } as never);
    expect(changed.iconAssetId).toBe(newAsset);
    expect((await linksOf(badge.id)).map((l) => l.assetId)).toEqual([newAsset]);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: oldAsset } })).lastUnlinkedAt).toBeInstanceOf(Date);

    const cleared = await service.patch(actor, badge.id, { expectedVersion: changed.version, iconAssetId: null, reason: "Gỡ ảnh huy hiệu" } as never);
    expect(cleared.iconAssetId).toBeNull();
    expect(await linksOf(badge.id)).toHaveLength(0);
    expect((await prisma.badge.findUniqueOrThrow({ where: { id: badge.id } })).iconAssetId).toBeNull();
  });

  it("lệch phiên bản khi đổi ảnh: 409 RES_003, huy hiệu + link giữ nguyên, ảnh mới KHÔNG bị gắn", async () => {
    const oldAsset = await seedAsset();
    const newAsset = await seedAsset();
    const badge = await service.create(actor, createDto("lech-ver", { iconAssetId: oldAsset }));
    await expect(service.patch(actor, badge.id, { expectedVersion: badge.version + 5, iconAssetId: newAsset, reason: "Đổi ảnh huy hiệu mới" } as never)).rejects.toMatchObject({ statusCode: 409 });
    expect((await prisma.badge.findUniqueOrThrow({ where: { id: badge.id } })).iconAssetId).toBe(oldAsset);
    expect((await linksOf(badge.id)).map((l) => l.assetId)).toEqual([oldAsset]);
    expect(await prisma.assetLink.count({ where: { assetId: newAsset } })).toBe(0);
  });

  it("quyền đọc ảnh: mọi người đăng nhập đọc được khi huy hiệu còn; chưa gắn (không resolver) chỉ chủ đọc; huy hiệu bị xoá → không ai đọc", async () => {
    const assetId = await seedAsset();
    const orphan = await seedAsset();
    const badge = await service.create(actor, createDto("doc-anh", { iconAssetId: assetId }));
    const subject = (id: string, ownerId: string) => ({ id, ownerId, status: "READY" as const, parentAssetId: null });

    await expect(access.canRead({ id: stranger, email: "s@x.vn" }, subject(assetId, admin))).resolves.toBe(true);
    // Asset mồ côi (chưa link): chỉ chủ.
    await expect(access.canRead({ id: stranger, email: "s@x.vn" }, subject(orphan, admin))).resolves.toBe(false);
    await expect(access.canRead({ id: admin, email: "a@x.vn" }, subject(orphan, admin))).resolves.toBe(true);

    await prisma.badge.delete({ where: { id: badge.id } });
    await expect(access.canRead({ id: stranger, email: "s@x.vn" }, subject(assetId, admin))).resolves.toBe(false);
  });
});
