/**
 * Unit — `UserAvatarService.removeByAdmin` (`POST /admin/users/:id/avatar/remove`): có ảnh → gỡ link USER_AVATAR + `avatarAssetId = null`
 * trong transaction rồi audit `user.avatar-remove` (kèm lý do); chưa có ảnh → `false`, không ghi gì; ANONYMIZED/không có → 404.
 * `withTransaction` giả (tx một object); HTTP + Prisma thật ở `avatar.test.ts` (Mongo memory).
 */
let mockTx: unknown;
jest.mock("../../../infrastructure/database", () => ({
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
}));

import { InMemoryUserRepository } from "../repositories/user.repository.inmemory";
import { UserAvatarService } from "../services/user-avatar.service";
import type { AssetLinkService, AssetUrlPort } from "../../assets/public";

const ADMIN = { id: "65f0000000000000000033a1" };
const AVATAR = "65f0000000000000000033c1";
const REASON = "Ảnh đại diện phản cảm, vi phạm quy định";

function harness() {
  const calls: string[] = [];
  const repo = new InMemoryUserRepository();
  const tx = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const u = await repo.findById(where.id);
        return u ? { id: u.id, status: u.status ?? "ACTIVE" } : null;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { avatarAssetId: string | null } }) => {
        calls.push("user.update");
        return repo.update(where.id, data);
      }),
    },
    asset: { findUnique: jest.fn(async () => null) },
  };
  mockTx = tx;
  const detach = jest.fn(async (..._args: unknown[]): Promise<void> => {
    calls.push("detach");
  });
  const replace = jest.fn(async (..._args: unknown[]): Promise<void> => undefined);
  const record = jest.fn(async (..._args: unknown[]): Promise<void> => {
    calls.push("audit");
  });
  const links = { detach, replace } as unknown as Pick<AssetLinkService, "replace" | "detach">;
  const urls = { getUrl: jest.fn() } as unknown as Pick<AssetUrlPort, "getUrl">;
  return { calls, repo, tx, detach, replace, record, service: new UserAvatarService(repo, links, urls, { record }), links, urls };
}

async function userWithAvatar(repo: InMemoryUserRepository, avatar: string | null): Promise<string> {
  const user = await repo.create({ email: `${Math.random().toString(36).slice(2)}@avatar.test`, name: "Người dùng", passwordHash: "h" });
  if (avatar) await repo.update(user.id, { avatarAssetId: avatar });
  return user.id;
}

beforeEach(() => InMemoryUserRepository.clearStore());

describe("UserAvatarService.removeByAdmin", () => {
  it("có ảnh → detach USER_AVATAR + avatarAssetId null trong tx, SAU ĐÓ audit user.avatar-remove kèm lý do; trả true", async () => {
    const h = harness();
    const userId = await userWithAvatar(h.repo, AVATAR);

    await expect(h.service.removeByAdmin(ADMIN, userId, REASON)).resolves.toBe(true);

    expect(h.detach).toHaveBeenCalledWith(h.tx, { targetType: "USER_AVATAR", targetId: userId });
    expect(h.tx.user.update).toHaveBeenCalledWith({ where: { id: userId }, data: { avatarAssetId: null } });
    expect((await h.repo.findById(userId))?.avatarAssetId).toBeNull();
    expect(h.record).toHaveBeenCalledWith({ actorId: ADMIN.id, action: "user.avatar-remove", targetType: "User", targetId: userId, reason: REASON });
    expect(h.calls).toEqual(["detach", "user.update", "audit"]);
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("chưa đặt ảnh → false, KHÔNG mở transaction/detach/audit (bấm lặp vô hại)", async () => {
    const h = harness();
    const userId = await userWithAvatar(h.repo, null);

    await expect(h.service.removeByAdmin(ADMIN, userId, REASON)).resolves.toBe(false);

    expect(h.tx.user.findUnique).not.toHaveBeenCalled();
    expect(h.detach).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
  });

  it("tài khoản ANONYMIZED hoặc không tồn tại → 404, không ghi gì", async () => {
    const h = harness();
    const anonymized = await userWithAvatar(h.repo, AVATAR);
    await h.repo.setStatus(anonymized, "ANONYMIZED");

    await expect(h.service.removeByAdmin(ADMIN, anonymized, REASON)).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.service.removeByAdmin(ADMIN, "65f0000000000000000033ff", REASON)).rejects.toMatchObject({ statusCode: 404 });
    expect(h.detach).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
  });

  it("transaction lỗi (gỡ link thất bại) → reject nguyên lỗi, KHÔNG ghi audit", async () => {
    const h = harness();
    const userId = await userWithAvatar(h.repo, AVATAR);
    const boom = new Error("mongo down");
    h.detach.mockRejectedValue(boom);

    await expect(h.service.removeByAdmin(ADMIN, userId, REASON)).rejects.toBe(boom);
    expect(h.record).not.toHaveBeenCalled();
  });

  it("không truyền audit (wiring cũ/test cũ) vẫn gỡ được", async () => {
    const h = harness();
    const userId = await userWithAvatar(h.repo, AVATAR);
    const withoutAudit = new UserAvatarService(h.repo, h.links, h.urls);

    await expect(withoutAudit.removeByAdmin(ADMIN, userId, REASON)).resolves.toBe(true);
    expect((await h.repo.findById(userId))?.avatarAssetId).toBeNull();
  });
});
