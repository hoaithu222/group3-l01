/**
 * Unit — `BlockPortImpl` (be.md p1-08 §5.7): cache `block:{id}`/`blockedBy:{id}`, chặn hai chiều cho nhắn/presence,
 * lọc người nhận thông báo MỘT hướng (chỉ người ĐÃ CHẶN người gửi bị loại), fail-open khi cache lỗi.
 * Cache/repo dùng bản in-memory — không cần Redis/Mongo (Redis được mock toàn cục ở `src/tests/setup.ts`).
 */
import { BlockPortImpl, type BlockCache } from "../block-port.impl";

/** blocks: [blockerId, blockedId]. */
function makeRepo(blocks: Array<[string, string]>) {
  return {
    listBlockedIds: jest.fn((blockerId: string) => Promise.resolve(blocks.filter(([a]) => a === blockerId).map(([, b]) => b))),
    listBlockerIds: jest.fn((blockedId: string) => Promise.resolve(blocks.filter(([, b]) => b === blockedId).map(([a]) => a))),
  };
}

class MemoryCache implements BlockCache {
  readonly store = new Map<string, string[]>();
  get(key: string): Promise<string[] | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }
  set(key: string, ids: string[]): Promise<void> {
    this.store.set(key, ids);
    return Promise.resolve();
  }
  del(keys: string[]): Promise<void> {
    keys.forEach((k) => this.store.delete(k));
    return Promise.resolve();
  }
}

describe("BlockPortImpl", () => {
  it("BLOCK-01: isBlockedEitherWay đúng CẢ HAI hướng (A chặn B → cả A→B lẫn B→A đều 'bị chặn')", async () => {
    const port = new BlockPortImpl(makeRepo([["A", "B"]]), new MemoryCache());
    expect(await port.isBlockedEitherWay("A", "B")).toBe(true);
    expect(await port.isBlockedEitherWay("B", "A")).toBe(true);
    expect(await port.isBlockedEitherWay("A", "C")).toBe(false);
    expect(await port.isBlockedEitherWay("A", "A")).toBe(false);
  });

  it("hasBlocked là MỘT chiều: A chặn B không có nghĩa B chặn A", async () => {
    const port = new BlockPortImpl(makeRepo([["A", "B"]]), new MemoryCache());
    expect(await port.hasBlocked("A", "B")).toBe(true);
    expect(await port.hasBlocked("B", "A")).toBe(false);
  });

  it("BLOCK-06: hiddenBetween = hợp hai hướng (người mình chặn + người chặn mình)", async () => {
    const port = new BlockPortImpl(makeRepo([["A", "B"], ["C", "A"], ["D", "E"]]), new MemoryCache());
    expect([...(await port.hiddenBetween("A"))].sort()).toEqual(["B", "C"]);
    expect([...(await port.hiddenBetween("B"))]).toEqual(["A"]);
    expect((await port.hiddenBetween("Z")).size).toBe(0);
  });

  it("BLOCK-03: filterNotificationRecipients chỉ bỏ người ĐÃ CHẶN người gửi (một hướng), giữ thứ tự, bỏ trùng", async () => {
    // A chặn B: B mention A → A bị lọc. B chặn nobody. C không chặn ai → vẫn nhận.
    const port = new BlockPortImpl(makeRepo([["A", "B"]]), new MemoryCache());
    expect(await port.filterNotificationRecipients("B", ["A", "C", "C", "D"])).toEqual(["C", "D"]);
    // Chiều ngược: A mention B (B không chặn A) → B vẫn nhận, dù A đã chặn B.
    expect(await port.filterNotificationRecipients("A", ["B", "C"])).toEqual(["B", "C"]);
    expect(await port.filterNotificationRecipients("A", [])).toEqual([]);
  });

  it("cache: lần 2 đọc từ cache (repo chỉ gọi 1 lần); invalidate xoá cả 2 khoá của cả 2 user", async () => {
    const repo = makeRepo([["A", "B"]]);
    const cache = new MemoryCache();
    const port = new BlockPortImpl(repo, cache);

    await port.blockedIdsOf("A");
    await port.blockedIdsOf("A");
    expect(repo.listBlockedIds).toHaveBeenCalledTimes(1);

    await port.blockerIdsOf("B");
    expect([...cache.store.keys()].sort()).toEqual(["block:A", "blockedBy:B"]);

    await port.invalidate(["A", "B", "A"]);
    expect(cache.store.size).toBe(0);
    await port.blockedIdsOf("A");
    expect(repo.listBlockedIds).toHaveBeenCalledTimes(2);
  });

  it("cache trống rỗng ([]) vẫn là cache hit hợp lệ (không đọc DB lại)", async () => {
    const repo = makeRepo([]);
    const port = new BlockPortImpl(repo, new MemoryCache());
    expect(await port.blockedIdsOf("A")).toEqual([]);
    expect(await port.blockedIdsOf("A")).toEqual([]);
    expect(repo.listBlockedIds).toHaveBeenCalledTimes(1);
  });

  it("fail-open: cache luôn miss/lỗi → vẫn trả đúng từ DB, không ném lỗi", async () => {
    const brokenCache: BlockCache = {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
      del: () => Promise.resolve(),
    };
    const port = new BlockPortImpl(makeRepo([["A", "B"]]), brokenCache);
    expect(await port.isBlockedEitherWay("B", "A")).toBe(true);
  });
});
