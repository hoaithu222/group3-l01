import { makeHarness, ADMIN, MEMBER, OWNER, WS, type Harness } from "./support/harness";

const DAY = 24 * 3600 * 1000;

/** Unit — job purge & thùng rác với ĐỒNG HỒ GIẢ LẬP (`clock.now`): ST-16 ở tầng nghiệp vụ. */
describe("ResourcePurgeService / TrashService (đồng hồ giả lập)", () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  const advance = (days: number) => {
    h.clock.now = new Date(h.clock.now.getTime() + days * DAY);
  };
  const make = async (size: number, u = MEMBER, folderId?: string) => {
    const asset = h.readyAsset(u, { size });
    const dto = await h.resourceService.create(u, WS, { assetId: asset.id, folderId, tags: [] });
    return { id: dto.id, assetId: asset.id };
  };

  it("ST-16: quá 30 ngày → xoá object + Asset DELETED + giảm dung lượng + audit + outbox purged; mục còn hạn giữ nguyên", async () => {
    const old = await make(1000);
    const fresh = await make(2000);
    await h.mutations.remove(MEMBER, old.id);
    advance(20);
    await h.mutations.remove(MEMBER, fresh.id);
    advance(11); // old: 31 ngày, fresh: 11 ngày
    expect(h.storageRepo.used.get(WS)).toBe(3000);

    const report = await h.purge.runSweep();
    expect(report).toEqual({ resourcesPurged: 1, resourcesFailed: 0, foldersPurged: 0, bytesFreed: 1000 });
    expect(h.resources.store.has(old.id)).toBe(false);
    expect(h.resources.store.has(fresh.id)).toBe(true);
    expect(h.assets.deletedKeys).toEqual([`key/${old.assetId}`]);
    expect(h.assets.deletedAssets.has(old.assetId)).toBe(true);
    expect(h.storageRepo.used.get(WS)).toBe(2000);
    expect(h.audit.record).toHaveBeenCalledTimes(1);
    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "resource.purge", actorRole: "system", targetType: "WORKSPACE", workspaceId: WS })
    );
    expect(h.outbox.events.filter((e) => e.type === "resource.purged")).toHaveLength(1);
    // mục quá hạn không khôi phục được; mục còn hạn thì được
    await expect(h.mutations.restore(ADMIN, old.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.mutations.restore(MEMBER, fresh.id)).resolves.toBeDefined();
  });

  it("thời hạn giữ theo cấu hình admin (7–90 ngày): đổi 30 → 60 thì mục 31 ngày chưa bị xoá", async () => {
    const file = await make(500);
    await h.mutations.remove(MEMBER, file.id);
    h.config.retentionDays = 60;
    advance(31);
    expect((await h.purge.runSweep()).resourcesPurged).toBe(0);
    advance(30);
    expect((await h.purge.runSweep()).resourcesPurged).toBe(1);
  });

  it("lỗi storage: giữ nguyên trong thùng rác + không audit/không trừ dung lượng; lượt sau xong (idempotent)", async () => {
    const file = await make(700);
    await h.mutations.remove(MEMBER, file.id);
    advance(31);
    h.assets.failDeleteObjects = true;
    expect(await h.purge.runSweep()).toMatchObject({ resourcesPurged: 0, resourcesFailed: 1 });
    expect(h.resources.store.has(file.id)).toBe(true);
    expect(h.storageRepo.used.get(WS)).toBe(700);
    expect(h.audit.record).not.toHaveBeenCalled();
    h.assets.failDeleteObjects = false;
    expect(await h.purge.runSweep()).toMatchObject({ resourcesPurged: 1 });
    expect(h.storageRepo.used.get(WS)).toBe(0);
    expect(await h.purge.runSweep()).toMatchObject({ resourcesPurged: 0 });
  });

  it("nhiều lô: > 200 tệp quá hạn được xử lý hết trong một lượt (tối đa 10 lô)", async () => {
    h.config.quotaBytes = 10_000_000;
    for (let i = 0; i < 205; i += 1) {
      const dto = await make(1);
      await h.mutations.remove(MEMBER, dto.id);
    }
    advance(31);
    expect(await h.purge.runSweep()).toMatchObject({ resourcesPurged: 205, bytesFreed: 205 });
    expect(h.storageRepo.used.get(WS)).toBe(0);
  });

  it("thư mục quá hạn chỉ bị xoá cứng khi không còn tệp/thư mục con tham chiếu (sâu nhất trước)", async () => {
    const top = await h.folderService.create(MEMBER, WS, { name: "Top" });
    const sub = await h.folderService.create(MEMBER, WS, { name: "Sub", parentId: top.id });
    const file = await make(300, MEMBER, sub.id);
    await h.folderService.remove(ADMIN, top.id, true);
    advance(31);
    const report = await h.purge.runSweep();
    expect(report).toMatchObject({ resourcesPurged: 1, foldersPurged: 2 });
    expect(h.folders.store.size).toBe(0);
    expect(h.resources.store.has(file.id)).toBe(false);
  });

  it("xoá vĩnh viễn ngay (NOW): chỉ OWNER/ADMIN, tệp phải trong thùng rác; audit mode NOW", async () => {
    const file = await make(900);
    await expect(h.trash.purgeNow(OWNER, WS, file.id)).rejects.toMatchObject({ statusCode: 404 }); // chưa xoá
    await h.mutations.remove(MEMBER, file.id);
    await expect(h.trash.purgeNow(MEMBER, WS, file.id)).rejects.toMatchObject({ statusCode: 403 });
    await h.trash.purgeNow(OWNER, WS, file.id);
    expect(h.resources.store.has(file.id)).toBe(false);
    expect(h.storageRepo.used.get(WS)).toBe(0);
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: OWNER.id, metadata: expect.objectContaining({ mode: "NOW" }) }));
  });

  describe("thùng rác", () => {
    it("MEMBER chỉ thấy mục do mình xoá; OWNER/ADMIN thấy tất cả; kèm purgeAt/canRestore/canPurge", async () => {
      const mine = await make(10, MEMBER);
      const theirs = await make(10, ADMIN);
      await h.mutations.remove(MEMBER, mine.id);
      await h.mutations.remove(ADMIN, theirs.id);
      const asMember = await h.trash.list(MEMBER, WS, { limit: 30 });
      expect(asMember.resources.map((r) => r.id)).toEqual([mine.id]);
      expect(asMember.resources[0]).toMatchObject({ canRestore: true, canPurge: false });
      const asOwner = await h.trash.list(OWNER, WS, { limit: 30 });
      expect(asOwner.resources.map((r) => r.id).sort()).toEqual([mine.id, theirs.id].sort());
      expect(asOwner.resources[0]?.canPurge).toBe(true);
      expect(new Date(asOwner.resources[0]?.purgeAt ?? 0).getTime()).toBe((asOwner.resources[0]?.deletedAt as Date).getTime() + 30 * DAY);
    });

    it("mục lồng trong lô xoá thư mục bị ẩn; trang ngắn vẫn tiến lên (không kẹt) và duyệt hết", async () => {
      const top = await h.folderService.create(MEMBER, WS, { name: "Top" });
      for (let i = 0; i < 12; i += 1) await make(1, MEMBER, top.id);
      const solo: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const r = await make(1, MEMBER);
        await h.mutations.remove(MEMBER, r.id);
        solo.push(r.id);
        advance(0.001);
      }
      await h.folderService.remove(ADMIN, top.id, true); // 12 tệp lồng + thư mục Top cùng deletedAt

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 20; page += 1) {
        const res = await h.trash.list(OWNER, WS, { limit: 2, cursor });
        seen.push(...res.resources.map((r) => r.id), ...res.folders.map((f) => f.id));
        cursor = res.meta.nextCursor ?? undefined;
        if (!res.meta.hasMore) break;
      }
      expect(new Set(seen)).toEqual(new Set([...solo, top.id])); // KHÔNG có 12 tệp lồng
      expect(seen).toHaveLength(4);
    });

    it("mục quá thời hạn giữ không còn trong danh sách", async () => {
      const file = await make(5);
      await h.mutations.remove(MEMBER, file.id);
      advance(31);
      expect((await h.trash.list(OWNER, WS, { limit: 30 })).resources).toHaveLength(0);
    });

    it("GUEST/ngoài nhóm 404; storage: MEMBER 403", async () => {
      await expect(h.trash.usage(MEMBER, WS)).rejects.toMatchObject({ statusCode: 403 });
      expect((await h.trash.usage(ADMIN, WS)).quotaBytes).toBe(10_000);
    });
  });
});
