/**
 * Helper DÙNG CHUNG cho các test tích hợp của `conversations` (p1-05) — KHÔNG
 * phải file test (không khớp `testMatch` `*.test.ts`), gom lại boilerplate lặp
 * lại giống hệt nhau ở `channels`/`messages` (`redis` stateful mock,
 * `tokenFor`/`seedUser`/`addMembership`, dọn dữ liệu sau mỗi test) — mỗi file
 * `*.test.ts` vẫn tự `jest.mock(...)` riêng (bắt buộc do Jest hoist
 * `jest.mock` lên đầu module, không thể gọi hộ từ file khác) nhưng dùng LẠI
 * cùng 1 bộ implementation thay vì chép tay 5-7 lần.
 */
import { prisma } from "../../../../infrastructure/database";
import { JwtUtils } from "../../../../core/utils/jwt";
import { newObjectId } from "../../../../core/utils/object-id";

export function makeRedisStore() {
  const redisStore = new Map<string, unknown>();
  const redisHashStore = new Map<string, Record<string, string>>();
  return {
    redisStore,
    redisHashStore,
    redisGetImpl(key: string): Promise<unknown> {
      return Promise.resolve(redisStore.has(key) ? redisStore.get(key) : null);
    },
    redisSetImpl(key: string, value: unknown): Promise<void> {
      redisStore.set(key, value);
      return Promise.resolve();
    },
    redisDelImpl(key: string): Promise<void> {
      redisStore.delete(key);
      return Promise.resolve();
    },
    redisGetdelImpl(key: string): Promise<unknown> {
      const v = redisStore.has(key) ? redisStore.get(key) : null;
      redisStore.delete(key);
      return Promise.resolve(v);
    },
    redisIncrImpl(key: string): Promise<number> {
      const next = ((redisStore.get(key) as number) ?? 0) + 1;
      redisStore.set(key, next);
      return Promise.resolve(next);
    },
    redisExistsImpl(key: string): Promise<boolean> {
      return Promise.resolve(redisStore.has(key));
    },
    redisSetNxImpl(key: string): Promise<boolean> {
      if (redisStore.has(key)) return Promise.resolve(false);
      redisStore.set(key, "1");
      return Promise.resolve(true);
    },
    redisHsetImpl(key: string, field: string, value: string): Promise<void> {
      const h = redisHashStore.get(key) ?? {};
      h[field] = value;
      redisHashStore.set(key, h);
      return Promise.resolve();
    },
    redisHgetallImpl(key: string): Promise<Record<string, string>> {
      return Promise.resolve({ ...(redisHashStore.get(key) ?? {}) });
    },
    redisHdelImpl(key: string, field: string): Promise<void> {
      const h = redisHashStore.get(key);
      if (h) delete h[field];
      return Promise.resolve();
    },
    clear(): void {
      redisStore.clear();
      redisHashStore.clear();
    },
    /** Xoá khoá bắt đầu bằng `prefix` — vd bộ đếm burst gửi tin `rl:msg:` (5 tin/5 giây) để test seed nhiều tin liên tiếp không dính RATE_002. */
    dropPrefix(prefix: string): void {
      for (const key of [...redisStore.keys()]) if (key.startsWith(prefix)) redisStore.delete(key);
    },
  };
}

export type RedisStore = ReturnType<typeof makeRedisStore>;

/** Gắn `mockImplementation` cho object `redis` đã bị `jest.mock` ở file gọi — gọi trong `beforeEach`. */
export function wireRedisMocks(redis: Record<string, jest.Mock>, store: RedisStore): void {
  redis.get.mockImplementation(store.redisGetImpl);
  redis.set.mockImplementation(store.redisSetImpl);
  redis.del.mockImplementation(store.redisDelImpl);
  redis.getdel.mockImplementation(store.redisGetdelImpl);
  redis.incr.mockImplementation(store.redisIncrImpl);
  redis.expire.mockResolvedValue(undefined);
  redis.exists.mockImplementation(store.redisExistsImpl);
  redis.setNx.mockImplementation(store.redisSetNxImpl);
  redis.hset.mockImplementation(store.redisHsetImpl);
  redis.hgetall.mockImplementation(store.redisHgetallImpl);
  redis.hdel.mockImplementation(store.redisHdelImpl);
  redis.scanKeys.mockResolvedValue([]);
  redis.ping.mockResolvedValue(true);
  redis.getClient.mockReturnValue(null);
}

export function tokenFor(userId: string, role = "user"): string {
  return JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });
}

export async function seedUser(overrides: { id?: string; name?: string; readReceipts?: boolean; showPresence?: boolean } = {}): Promise<{
  id: string;
  name: string;
}> {
  const id = overrides.id ?? newObjectId();
  const name = overrides.name ?? "Nguyễn Văn A";
  const hasPrivacyOverride = overrides.readReceipts !== undefined || overrides.showPresence !== undefined;
  await prisma.user.create({
    data: {
      id,
      email: `${id}@e.com`,
      name,
      normalizedName: "",
      ...(hasPrivacyOverride && {
        privacy: { readReceipts: overrides.readReceipts ?? true, showPresence: overrides.showPresence ?? true },
      }),
    },
  });
  return { id, name };
}

export async function addMembership(
  workspaceId: string,
  userId: string,
  role: "OWNER" | "ADMIN" | "MEMBER" | "GUEST" = "MEMBER"
): Promise<void> {
  await prisma.workspaceMembership.create({ data: { workspaceId, userId, role, status: "ACTIVE" } });
}

/** Dọn TOÀN BỘ dữ liệu do 1 test tạo ra — best-effort, gọi trong `afterEach`. */
export async function cleanupConversationsFixtures(input: {
  conversationIds?: string[];
  workspaceIds?: string[];
  userIds?: string[];
}): Promise<void> {
  const conversationIds = input.conversationIds ?? [];
  const workspaceIds = input.workspaceIds ?? [];
  const userIds = input.userIds ?? [];

  if (conversationIds.length > 0) {
    await prisma.message.deleteMany({ where: { scopeType: "CONVERSATION", scopeId: { in: conversationIds } } });
    await prisma.messageHide.deleteMany({ where: { scopeType: "CONVERSATION", scopeId: { in: conversationIds } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Conversation", aggregateId: { in: conversationIds } } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
  }
  if (workspaceIds.length > 0) {
    await prisma.outboxEvent.deleteMany({
      where: { OR: workspaceIds.map((id) => ({ aggregateId: { startsWith: id } })) },
    });
    await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.notification.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  }
  if (userIds.length > 0) {
    await prisma.userBlock.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
    await prisma.conversationMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}
