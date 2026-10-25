/**
 * Integration — `AssetAccessService.canRead/assertRead` (be.md §5.4) với
 * `PrismaAssetLinkRepository` thật (Mongo memory replset) + fake
 * `ScopeResolver` CONVERSATION (đăng ký qua `registerScopeResolver`, giống
 * cách module Phase 1+ sẽ làm — `core/permission` chưa có resolver thật nào
 * ở Phase 0). KHÔNG cần Redis thật: `permissionService` fail-open việc CACHE
 * khi Redis chưa `connect()` (chỉ gọi ở `server.ts`/`worker.ts`, không gọi
 * trong test) — mọi lần gọi `canRead()` đi thẳng vào resolver, không cache
 * (tiện cho test đổi quyền linh hoạt giữa các bước).
 */
import { prisma } from "../../../../infrastructure/database";
import {
  registerScopeResolver,
  clearScopeRegistry,
  type ScopeResolver,
  type ResolvedAccess,
  type ResolveContext,
} from "../../../../core/permission";
import type { AuthUser } from "../../../../core/types/express";
import { AssetAccessService } from "../../services/asset-access.service";
import { PrismaAssetLinkRepository } from "../../repositories/asset-link.repository.prisma";
import { PrismaAssetRepository } from "../../repositories/asset.repository.prisma";
import { newObjectId } from "../../../../core/utils/object-id";
import type { AssetCreateInput } from "../../entities/asset.interface";

class FakeConversationResolver implements ScopeResolver {
  readonly type = "CONVERSATION" as const;
  /** `{ [conversationId]: Set<userId> }` */
  members = new Map<string, Set<string>>();

  async resolve(user: AuthUser, scopeId: string, _ctx: ResolveContext): Promise<ResolvedAccess> {
    const has = this.members.get(scopeId)?.has(user.id) ?? false;
    if (!has) return { visible: false, role: null, actions: new Set() };
    return { visible: true, role: "MEMBER", actions: new Set(["conversation.read"]) };
  }
}

describe("AssetAccessService (integration — Mongo memory replset)", () => {
  const repo = new PrismaAssetRepository();
  const linkRepo = new PrismaAssetLinkRepository();
  const access = new AssetAccessService(linkRepo);
  const resolver = new FakeConversationResolver();
  const owner = newObjectId();
  const stranger = newObjectId();
  const ownerUser: AuthUser = { id: owner, email: "owner@example.com" };
  const strangerUser: AuthUser = { id: stranger, email: "stranger@example.com" };

  beforeAll(() => {
    registerScopeResolver(resolver);
  });

  afterAll(() => {
    clearScopeRegistry();
  });

  afterEach(async () => {
    await prisma.assetLink.deleteMany({ where: { createdBy: owner } });
    await prisma.asset.deleteMany({ where: { ownerId: owner } });
    resolver.members.clear();
  });

  async function createReadyAsset(): Promise<Awaited<ReturnType<typeof repo.create>>> {
    const input: AssetCreateInput = {
      id: newObjectId(),
      ownerId: owner,
      scope: "MESSAGE",
      kind: "IMAGE",
      uploadMethod: "API_PUT",
      mime: "image/png",
      declaredSize: 10,
      originalName: "a.png",
      storageKey: `resource/${owner}/${newObjectId()}.png`,
      status: "READY",
    };
    return repo.create(input);
  }

  it("AST-04: người ngoài scope không đọc được asset gắn vào hội thoại riêng tư → assertRead ném PERM_404", async () => {
    const asset = await createReadyAsset();
    const convId = newObjectId();
    resolver.members.set(convId, new Set([owner])); // chỉ owner là thành viên

    await prisma.assetLink.create({
      data: {
        assetId: asset.id,
        targetType: "MESSAGE",
        targetId: newObjectId(),
        scopeType: "CONVERSATION",
        scopeId: convId,
        createdBy: owner,
      },
    });

    expect(await access.canRead(strangerUser, asset)).toBe(false);
    await expect(access.assertRead(strangerUser, asset)).rejects.toMatchObject({
      statusCode: 404,
      errorCode: "PERM_404",
    });
  });

  it("AST-05: asset gắn 2 hội thoại — mất quyền hội thoại 1 vẫn đọc qua hội thoại 2; mất cả 2 → không đọc được", async () => {
    const asset = await createReadyAsset();
    const conv1 = newObjectId();
    const conv2 = newObjectId();
    resolver.members.set(conv1, new Set([stranger]));
    resolver.members.set(conv2, new Set([stranger]));

    await prisma.assetLink.create({
      data: {
        assetId: asset.id,
        targetType: "MESSAGE",
        targetId: newObjectId(),
        scopeType: "CONVERSATION",
        scopeId: conv1,
        createdBy: owner,
      },
    });
    await prisma.assetLink.create({
      data: {
        assetId: asset.id,
        targetType: "MESSAGE",
        targetId: newObjectId(),
        scopeType: "CONVERSATION",
        scopeId: conv2,
        createdBy: owner,
      },
    });

    expect(await access.canRead(strangerUser, asset)).toBe(true);

    resolver.members.get(conv1)!.delete(stranger); // mất quyền hội thoại 1
    expect(await access.canRead(strangerUser, asset)).toBe(true); // vẫn đọc được qua hội thoại 2

    resolver.members.get(conv2)!.delete(stranger); // mất luôn hội thoại 2
    expect(await access.canRead(strangerUser, asset)).toBe(false);
  });

  it("chủ asset cũng mất quyền đọc khi mất quyền scope đã gắn (thu hồi xuyên suốt, be.md §5.4 chốt)", async () => {
    const asset = await createReadyAsset();
    const convId = newObjectId();
    // KHÔNG thêm owner vào resolver.members(convId) — owner không còn quyền scope này.
    await prisma.assetLink.create({
      data: {
        assetId: asset.id,
        targetType: "MESSAGE",
        targetId: newObjectId(),
        scopeType: "CONVERSATION",
        scopeId: convId,
        createdBy: owner,
      },
    });

    expect(await access.canRead(ownerUser, asset)).toBe(false);
  });

  it("chủ đọc được asset CHƯA gắn link nào; người khác thì không", async () => {
    const asset = await createReadyAsset();
    expect(await access.canRead(ownerUser, asset)).toBe(true);
    expect(await access.canRead(strangerUser, asset)).toBe(false);
  });

  it("scopeType USER (avatar) — mọi user đăng nhập đọc được, không cần resolver", async () => {
    const asset = await createReadyAsset();
    await prisma.assetLink.create({
      data: {
        assetId: asset.id,
        targetType: "USER_AVATAR",
        targetId: owner,
        scopeType: "USER",
        scopeId: null,
        createdBy: owner,
      },
    });
    expect(await access.canRead(strangerUser, asset)).toBe(true);
  });

  it("asset DELETED — không ai đọc được kể cả chủ, dù có link scope hợp lệ", async () => {
    const asset = await createReadyAsset();
    const convId = newObjectId();
    resolver.members.set(convId, new Set([owner, stranger]));
    await prisma.assetLink.create({
      data: {
        assetId: asset.id,
        targetType: "MESSAGE",
        targetId: newObjectId(),
        scopeType: "CONVERSATION",
        scopeId: convId,
        createdBy: owner,
      },
    });
    await repo.markDeleted(asset.id);
    const deleted = await repo.findById(asset.id);
    expect(await access.canRead(ownerUser, deleted!)).toBe(false);
  });
});
