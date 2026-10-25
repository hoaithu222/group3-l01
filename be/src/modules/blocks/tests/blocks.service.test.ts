/**
 * Unit — `BlocksService` (be.md p1-08 §5.7): tự chặn BLOCK_001, giới hạn BLOCK_004, idempotent, race P2002 đọc lại NGOÀI
 * transaction, hook `onUserBlocked` gọi SAU commit, không thông báo người bị chặn. Repo/port/hook giả; `withTransaction`/
 * `outbox` mock (không cần Mongo/Redis).
 */
const mockOutboxAdd = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  withTransaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));
jest.mock("../../../infrastructure/queue", () => ({
  outbox: { add: (...args: unknown[]) => mockOutboxAdd(...args) },
}));

import { LIMITS } from "../../../core/constants/limits";
import { BlocksService } from "../blocks.service";
import type { IBlocksRepo, UserBlockEntity } from "../blocks.repo";
import type { BlockPort } from "../../../shared/ports/block.port";

const ME = "a".repeat(24);
const OTHER = "b".repeat(24);

function makeRepo(overrides: Partial<IBlocksRepo> = {}): jest.Mocked<IBlocksRepo> {
  const row: UserBlockEntity = { id: "blk1", blockerId: ME, blockedId: OTHER, createdAt: new Date("2026-09-19T00:00:00Z") };
  return {
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(row),
    deletePair: jest.fn().mockResolvedValue(1),
    listByBlocker: jest.fn().mockResolvedValue([]),
    listBlockedIds: jest.fn().mockResolvedValue([]),
    listBlockerIds: jest.fn().mockResolvedValue([]),
    findUsers: jest.fn().mockResolvedValue([]),
    userExists: jest.fn().mockResolvedValue(true),
    ...overrides,
  } as jest.Mocked<IBlocksRepo>;
}

function makePort(): jest.Mocked<Pick<BlockPort, "invalidate">> & BlockPort {
  return { invalidate: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<Pick<BlockPort, "invalidate">> & BlockPort;
}

describe("BlocksService", () => {
  beforeEach(() => {
    mockOutboxAdd.mockReset();
  });

  it("BLOCK_001: tự chặn chính mình → 400, không chạm DB", async () => {
    const repo = makeRepo();
    const service = new BlocksService(repo, makePort(), () => null);
    await expect(service.block(ME, ME)).rejects.toMatchObject({ statusCode: 400, errorCode: "BLOCK_001" });
    expect(repo.find).not.toHaveBeenCalled();
  });

  it("chặn thành công: 1 outbox `user.blocked`, xoá cache 2 phía, gọi hook onUserBlocked(A,B), alreadyBlocked=false", async () => {
    const repo = makeRepo();
    const port = makePort();
    const onUserBlocked = jest.fn().mockResolvedValue(undefined);
    const service = new BlocksService(repo, port, () => ({ onUserBlocked }) as never);

    const result = await service.block(ME, OTHER);

    expect(result).toMatchObject({ userId: OTHER, alreadyBlocked: false });
    expect(mockOutboxAdd).toHaveBeenCalledTimes(1);
    expect(mockOutboxAdd.mock.calls[0][1]).toMatchObject({ type: "user.blocked", jobName: "block.events", dedupeKey: "user.blocked:blk1" });
    expect(port.invalidate).toHaveBeenCalledWith([ME, OTHER]);
    expect(onUserBlocked).toHaveBeenCalledWith(ME, OTHER);
  });

  it("idempotent: đã chặn từ trước → trả bản cũ (alreadyBlocked=true), KHÔNG tạo mới/outbox/hook", async () => {
    const existing: UserBlockEntity = { id: "old", blockerId: ME, blockedId: OTHER, createdAt: new Date("2026-01-01T00:00:00Z") };
    const repo = makeRepo({ find: jest.fn().mockResolvedValue(existing) });
    const onUserBlocked = jest.fn();
    const service = new BlocksService(repo, makePort(), () => ({ onUserBlocked }) as never);

    const result = await service.block(ME, OTHER);

    expect(result).toEqual({ userId: OTHER, blockedAt: existing.createdAt, alreadyBlocked: true });
    expect(repo.create).not.toHaveBeenCalled();
    expect(mockOutboxAdd).not.toHaveBeenCalled();
    expect(onUserBlocked).not.toHaveBeenCalled();
  });

  it("user không tồn tại → 404", async () => {
    const repo = makeRepo({ userExists: jest.fn().mockResolvedValue(false) });
    const service = new BlocksService(repo, makePort(), () => null);
    await expect(service.block(ME, OTHER)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("BLOCK_004: đã đủ LIMITS.block.max người → 409", async () => {
    const repo = makeRepo({ count: jest.fn().mockResolvedValue(LIMITS.block.max) });
    const service = new BlocksService(repo, makePort(), () => null);
    await expect(service.block(ME, OTHER)).rejects.toMatchObject({ statusCode: 409, errorCode: "BLOCK_004" });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("race: 2 request chặn cùng lúc (P2002) → đọc lại NGOÀI transaction, trả bản thắng (alreadyBlocked=true)", async () => {
    const winner: UserBlockEntity = { id: "win", blockerId: ME, blockedId: OTHER, createdAt: new Date("2026-09-19T01:00:00Z") };
    const { Prisma } = jest.requireActual("@prisma/client") as typeof import("@prisma/client");
    const dup = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" });
    const repo = makeRepo({
      find: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(winner),
      create: jest.fn().mockRejectedValue(dup),
    });
    const service = new BlocksService(repo, makePort(), () => null);

    await expect(service.block(ME, OTHER)).resolves.toEqual({ userId: OTHER, blockedAt: winner.createdAt, alreadyBlocked: true });
  });

  it("hook lỗi không làm hỏng việc chặn (đã commit) — chỉ log", async () => {
    const service = new BlocksService(makeRepo(), makePort(), () => ({ onUserBlocked: jest.fn().mockRejectedValue(new Error("boom")) }) as never);
    await expect(service.block(ME, OTHER)).resolves.toMatchObject({ alreadyBlocked: false });
  });

  it("unblock idempotent: chưa chặn → không làm gì; đang chặn → xoá + outbox `user.unblocked` + xoá cache + hook", async () => {
    const none = new BlocksService(makeRepo(), makePort(), () => null);
    await expect(none.unblock(ME, OTHER)).resolves.toBeUndefined();
    expect(mockOutboxAdd).not.toHaveBeenCalled();

    const existing: UserBlockEntity = { id: "blk9", blockerId: ME, blockedId: OTHER, createdAt: new Date() };
    const repo = makeRepo({ find: jest.fn().mockResolvedValue(existing) });
    const port = makePort();
    const onUserBlocked = jest.fn().mockResolvedValue(undefined);
    await new BlocksService(repo, port, () => ({ onUserBlocked }) as never).unblock(ME, OTHER);

    expect(mockOutboxAdd.mock.calls[0][1]).toMatchObject({ type: "user.unblocked", dedupeKey: "user.unblocked:blk9" });
    expect(port.invalidate).toHaveBeenCalledWith([ME, OTHER]);
    expect(onUserBlocked).toHaveBeenCalledWith(ME, OTHER);
  });

  it("list: phân trang cursor + meta.allIds đầy đủ, tên người bị chặn, KHÔNG lộ trường nội bộ", async () => {
    const rows: UserBlockEntity[] = [
      { id: "3", blockerId: ME, blockedId: "u3", createdAt: new Date("2026-09-19T03:00:00Z") },
      { id: "2", blockerId: ME, blockedId: "u2", createdAt: new Date("2026-09-19T02:00:00Z") },
      { id: "1", blockerId: ME, blockedId: "u1", createdAt: new Date("2026-09-19T01:00:00Z") },
    ];
    const repo = makeRepo({
      listByBlocker: jest.fn().mockResolvedValue(rows),
      listBlockedIds: jest.fn().mockResolvedValue(["u1", "u2", "u3"]),
      findUsers: jest.fn().mockResolvedValue([
        { id: "u3", name: "Ba", avatarAssetId: "65f0000000000000000000b3" },
        { id: "u2", name: "Hai", avatarAssetId: null },
      ]),
    });
    const service = new BlocksService(repo, makePort(), () => null);

    const res = await service.list(ME, { limit: 2 });

    expect(repo.listByBlocker).toHaveBeenCalledWith({ blockerId: ME, cursor: null, limit: 3 });
    expect(res.data).toEqual([
      // Có ảnh → URL ảnh hiển thị ký sẵn (THUMB) dựng từ `avatarAssetId` nạp cùng `findUsers` (không truy vấn thêm).
      {
        userId: "u3",
        name: "Ba",
        avatarUrl: expect.stringMatching(/\/api\/v1\/assets\/65f0000000000000000000b3\/image\?v=THUMB&e=\d+&s=[0-9a-f]{64}$/),
        blockedAt: rows[0].createdAt,
      },
      { userId: "u2", name: "Hai", avatarUrl: null, blockedAt: rows[1].createdAt },
    ]);
    expect(repo.findUsers).toHaveBeenCalledTimes(1);
    expect(res.meta).toMatchObject({ hasMore: true, limit: 2, allIds: ["u1", "u2", "u3"] });
    expect(res.meta.nextCursor).toEqual(expect.any(String));
  });
});
