/**
 * Integration — truy vấn Mongo THẬT của `PrismaAssetRepository.findCleanupCandidates`
 * (`coalesce(lastUnlinkedAt, createdAt) < olderThan`, biểu diễn bằng `OR`
 * trong Prisma — be.md §5.7) + `PrismaAssetLinkRepository.existsForAsset`
 * (điều kiện job `assets.cleanup` dùng để loại asset còn gắn khỏi lô xoá).
 * Test wrapper job (`registerJob`) đã có ở `tests/asset.jobs.test.ts` (unit,
 * InMemory) — ở đây chỉ xác nhận TRUY VẤN THẬT đúng, không lặp lại logic đó.
 */
import { prisma } from "../../../../infrastructure/database";
import { PrismaAssetRepository } from "../../repositories/asset.repository.prisma";
import { PrismaAssetLinkRepository } from "../../repositories/asset-link.repository.prisma";
import { newObjectId } from "../../../../core/utils/object-id";
import type { AssetCreateInput } from "../../entities/asset.interface";

const HOUR_MS = 3600_000;

describe("assets.cleanup — findCleanupCandidates (integration — Mongo memory replset)", () => {
  const repo = new PrismaAssetRepository();
  const linkRepo = new PrismaAssetLinkRepository();
  const owner = newObjectId();

  afterEach(async () => {
    await prisma.assetLink.deleteMany({ where: { createdBy: owner } });
    await prisma.asset.deleteMany({ where: { ownerId: owner } });
  });

  async function createAsset(overrides: Partial<AssetCreateInput & { createdAt: Date }> = {}) {
    const { createdAt, ...rest } = overrides;
    const data = {
      id: newObjectId(),
      ownerId: owner,
      scope: "RESOURCE" as const,
      kind: "FILE" as const,
      variant: "ORIGINAL" as const,
      uploadMethod: "API_PUT" as const,
      mime: "application/pdf",
      declaredSize: 10,
      originalName: "a.pdf",
      storageKey: `resource/${owner}/${newObjectId()}.pdf`,
      status: "READY" as const,
      ...rest,
      ...(createdAt && { createdAt }),
    };
    return prisma.asset.create({ data });
  }

  it("KHÔNG chọn asset mới (chưa quá olderThan)", async () => {
    await createAsset({ createdAt: new Date() });
    const candidates = await repo.findCleanupCandidates(new Date(Date.now() - 24 * HOUR_MS), 100);
    expect(candidates.some((c) => c.ownerId === owner)).toBe(false);
  });

  it("chọn asset cũ, chưa từng gắn/gỡ link (lastUnlinkedAt null, createdAt cũ)", async () => {
    const asset = await createAsset({ createdAt: new Date(Date.now() - 25 * HOUR_MS) });
    const candidates = await repo.findCleanupCandidates(new Date(Date.now() - 24 * HOUR_MS), 100);
    expect(candidates.map((c) => c.id)).toContain(asset.id);
  });

  it("KHÔNG chọn asset vừa mất link gần đây dù createdAt rất cũ (coalesce ưu tiên lastUnlinkedAt)", async () => {
    const asset = await createAsset({
      createdAt: new Date(Date.now() - 100 * HOUR_MS),
    });
    await prisma.asset.update({ where: { id: asset.id }, data: { lastUnlinkedAt: new Date() } });

    const candidates = await repo.findCleanupCandidates(new Date(Date.now() - 24 * HOUR_MS), 100);
    expect(candidates.map((c) => c.id)).not.toContain(asset.id);
  });

  it("chọn lại asset đã mất link ĐỦ LÂU (lastUnlinkedAt cũ hơn olderThan)", async () => {
    const asset = await createAsset({ createdAt: new Date(Date.now() - 100 * HOUR_MS) });
    await prisma.asset.update({
      where: { id: asset.id },
      data: { lastUnlinkedAt: new Date(Date.now() - 25 * HOUR_MS) },
    });

    const candidates = await repo.findCleanupCandidates(new Date(Date.now() - 24 * HOUR_MS), 100);
    expect(candidates.map((c) => c.id)).toContain(asset.id);
  });

  it("KHÔNG chọn variant THUMB (chỉ dọn asset gốc, thumbnail dọn theo cha)", async () => {
    const parent = await createAsset({ createdAt: new Date(Date.now() - 25 * HOUR_MS) });
    await createAsset({
      variant: "THUMB",
      parentAssetId: parent.id,
      createdAt: new Date(Date.now() - 25 * HOUR_MS),
    });

    const candidates = await repo.findCleanupCandidates(new Date(Date.now() - 24 * HOUR_MS), 100);
    const thumbCandidates = candidates.filter((c) => c.variant === "THUMB");
    expect(thumbCandidates).toHaveLength(0);
  });

  it("AST-07: asset còn AssetLink bị loại khỏi lô xoá qua existsForAsset", async () => {
    const asset = await createAsset({ createdAt: new Date(Date.now() - 25 * HOUR_MS) });
    await prisma.assetLink.create({
      data: {
        assetId: asset.id,
        targetType: "RESOURCE",
        targetId: newObjectId(),
        scopeType: "NONE",
        scopeId: null,
        createdBy: owner,
      },
    });

    const candidates = await repo.findCleanupCandidates(new Date(Date.now() - 24 * HOUR_MS), 100);
    expect(candidates.map((c) => c.id)).toContain(asset.id); // vẫn là ứng viên...
    expect(await linkRepo.existsForAsset(asset.id)).toBe(true); // ...nhưng job sẽ loại vì còn link
  });
});
