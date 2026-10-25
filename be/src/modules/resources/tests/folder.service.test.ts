import { makeHarness, ADMIN, GUEST, MEMBER, OTHER, OUTSIDER, OWNER, WS, type Harness } from "./support/harness";

/** Unit (repo in-memory) — logic cây thư mục: độ sâu, vòng, di chuyển cây, xoá/khôi phục theo lô, quyền. */
describe("FolderService", () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  const create = (name: string, parentId?: string, u = MEMBER) => h.folderService.create(u, WS, { name, parentId });

  async function chain(depth: number) {
    let parent: string | undefined;
    const ids: string[] = [];
    for (let i = 1; i <= depth; i += 1) {
      const f = await create(`c${i}`, parent);
      parent = f.id;
      ids.push(f.id);
    }
    return ids;
  }

  describe("tạo", () => {
    it("cấp 8 được, cấp 9 → RSC_001", async () => {
      const ids = await chain(8);
      await expect(create("c9", ids[7])).rejects.toMatchObject({ statusCode: 400, errorCode: "RSC_001" });
    });

    it("trùng tên cùng cấp (khác hoa/dấu/khoảng trắng) → RSC_002; cấp khác được", async () => {
      const a = await create("Tài  Liệu");
      await expect(create("tai lieu")).rejects.toMatchObject({ statusCode: 409, errorCode: "RSC_002" });
      await expect(create("TÀI LIỆU")).rejects.toMatchObject({ errorCode: "RSC_002" });
      await expect(create("tai lieu", a.id)).resolves.toMatchObject({ name: "tai lieu", depth: 2 });
    });

    it("cha không tồn tại / đã xoá → 404; tên chỉ toàn khoảng trắng bị dtos chặn, tên rỗng sau chuẩn hoá → 400", async () => {
      await expect(create("x", "cccccccccccccccccccccccc")).rejects.toMatchObject({ statusCode: 404 });
      const p = await create("P");
      await h.folderService.remove(MEMBER, p.id, false);
      await expect(create("x", p.id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(create("́")).rejects.toMatchObject({ statusCode: 400 }); // chỉ còn dấu kết hợp → rỗng
    });

    it("quyền: GUEST và người ngoài → 404; ghi outbox folder.created", async () => {
      await expect(create("x", undefined, GUEST)).rejects.toMatchObject({ statusCode: 404 });
      await expect(create("x", undefined, OUTSIDER)).rejects.toMatchObject({ statusCode: 404 });
      await create("ok");
      expect(h.outbox.events.map((e) => e.type)).toEqual(["folder.created"]);
    });

    it("workspace ARCHIVED → 403", async () => {
      h.access.archived = true;
      await expect(create("x")).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("di chuyển / đổi tên", () => {
    it("ST-12: vào chính nó / con / cháu → RSC_006", async () => {
      const [a, b, c] = await chain(3);
      for (const target of [a, b, c]) {
        await expect(
          h.folderService.update(MEMBER, a as string, { parentId: target, expectedVersion: 1 })
        ).rejects.toMatchObject({ statusCode: 400, errorCode: "RSC_006" });
      }
    });

    it("di chuyển cây 3 cấp cập nhật path/depth của mọi hậu duệ; về gốc co lại", async () => {
      const [a, b, c] = await chain(3);
      const d = await create("D");
      const e = await create("E", d.id);
      const moved = await h.folderService.update(MEMBER, a as string, { parentId: e.id, expectedVersion: 1 });
      expect(moved.depth).toBe(3);
      expect(h.folders.store.get(b as string)).toMatchObject({ depth: 4, path: [d.id, e.id, a] });
      expect(h.folders.store.get(c as string)).toMatchObject({ depth: 5, path: [d.id, e.id, a, b] });
      await h.folderService.update(MEMBER, a as string, { parentId: null, expectedVersion: moved.version });
      expect(h.folders.store.get(c as string)).toMatchObject({ depth: 3, path: [a, b] });
    });

    it("cây con sâu nhất vượt 8 sau khi chuyển → RSC_001", async () => {
      const deep = await chain(6);
      const x = await create("X");
      const y = await create("Y", x.id);
      await create("Z", y.id);
      await expect(
        h.folderService.update(MEMBER, x.id, { parentId: deep[5], expectedVersion: 1 })
      ).rejects.toMatchObject({ errorCode: "RSC_001" });
      // vừa đủ 8: chuyển vào cấp 5 → X=6, Y=7, Z=8
      await expect(h.folderService.update(MEMBER, x.id, { parentId: deep[4], expectedVersion: 1 })).resolves.toMatchObject({ depth: 6 });
    });

    it("đổi tên trùng → RSC_002; lệch phiên bản → RES_003 (currentVersion); thư mục của người khác chỉ ADMIN sửa", async () => {
      const a = await create("A");
      await create("B");
      await expect(h.folderService.update(MEMBER, a.id, { name: "b", expectedVersion: 1 })).rejects.toMatchObject({ errorCode: "RSC_002" });
      await expect(h.folderService.update(MEMBER, a.id, { name: "A2", expectedVersion: 7 })).rejects.toMatchObject({
        statusCode: 409,
        errorCode: "RES_003",
        details: { currentVersion: 1 },
      });
      await expect(h.folderService.update(OTHER, a.id, { name: "A2", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 403 });
      await expect(h.folderService.update(ADMIN, a.id, { name: "A2", expectedVersion: 1 })).resolves.toMatchObject({ name: "A2", version: 2 });
    });

    it("id không tồn tại → 404 trung tính (PERM_404) — không phân biệt với 'không được thấy'", async () => {
      await expect(h.folderService.update(MEMBER, "cccccccccccccccccccccccc", { name: "x", expectedVersion: 1 })).rejects.toMatchObject({
        statusCode: 404,
        errorCode: "PERM_404",
      });
    });
  });

  describe("xoá / khôi phục", () => {
    async function tree() {
      const top = await create("Top");
      const sub = await create("Sub", top.id);
      const file = await h.resourceService.create(MEMBER, WS, { assetId: h.readyAsset(MEMBER).id, folderId: sub.id, tags: [] });
      return { top, sub, file };
    }

    it("không rỗng → RSC_004 (kể cả MEMBER + recursive); rỗng → MEMBER xoá được; tên được nhường", async () => {
      const { top } = await tree();
      await expect(h.folderService.remove(ADMIN, top.id, false)).rejects.toMatchObject({ errorCode: "RSC_004" });
      await expect(h.folderService.remove(MEMBER, top.id, true)).rejects.toMatchObject({ errorCode: "RSC_004" });
      const empty = await create("Rong");
      await h.folderService.remove(MEMBER, empty.id, false);
      expect(h.folders.store.get(empty.id)?.nameKey).toBe(`rong#${empty.id}`);
      await expect(create("rong")).resolves.toMatchObject({ name: "rong" });
    });

    it("ADMIN recursive xoá cả lô cùng deletedAt (thư mục + tệp), phát 1 sự kiện thư mục + sự kiện tệp gắn via=FOLDER", async () => {
      const { top, sub, file } = await tree();
      h.outbox.events.length = 0;
      const versionBefore = Number(await h.cache.version(WS));
      await h.folderService.remove(ADMIN, top.id, true);
      const at = h.folders.store.get(top.id)?.deletedAt?.getTime();
      expect(h.folders.store.get(sub.id)?.deletedAt?.getTime()).toBe(at);
      expect(h.resources.store.get(file.id)?.deletedAt?.getTime()).toBe(at);
      expect(h.outbox.events.map((e) => e.type).sort()).toEqual(["folder.deleted", "resource.deleted"]);
      expect(h.outbox.events.find((e) => e.type === "resource.deleted")?.payload).toMatchObject({ via: "FOLDER" });
      expect(Number(await h.cache.version(WS))).toBeGreaterThan(versionBefore); // cache danh sách bị vô hiệu
    });

    it("khôi phục thư mục khôi phục CẢ lô nhưng KHÔNG đụng tệp đã xoá lẻ trước đó", async () => {
      const { top, sub, file } = await tree();
      const early = await h.resourceService.create(MEMBER, WS, { assetId: h.readyAsset(MEMBER).id, folderId: sub.id, tags: [] });
      await h.mutations.remove(MEMBER, early.id); // xoá lẻ TRƯỚC khi xoá thư mục
      h.clock.now = new Date(h.clock.now.getTime() + 1000);
      await h.folderService.remove(ADMIN, top.id, true);
      await h.folderService.restore(ADMIN, top.id);
      expect(h.resources.store.get(file.id)?.deletedAt).toBeNull();
      expect(h.resources.store.get(early.id)?.deletedAt).not.toBeNull();
      expect(h.folders.store.get(sub.id)?.nameKey).toBe("sub");
    });

    it("khôi phục: RSC_002 khi tên bị chiếm; RSC_008 khi cha còn xoá; MEMBER khác 403; quá hạn 404", async () => {
      const a = await create("A");
      await h.folderService.remove(MEMBER, a.id, false);
      await create("A");
      await expect(h.folderService.restore(MEMBER, a.id)).rejects.toMatchObject({ errorCode: "RSC_002" });

      const p = await create("P");
      const c = await create("C", p.id);
      await h.folderService.remove(MEMBER, c.id, false);
      await h.folderService.remove(MEMBER, p.id, false);
      await expect(h.folderService.restore(MEMBER, c.id)).rejects.toMatchObject({ statusCode: 409, errorCode: "RSC_008" });
      await expect(h.folderService.restore(OTHER, p.id)).rejects.toMatchObject({ statusCode: 403 });

      h.clock.now = new Date(h.clock.now.getTime() + 31 * 24 * 3600 * 1000);
      await expect(h.folderService.restore(ADMIN, p.id)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("liệt kê", () => {
    it("root không có `folder`; breadcrumb = tổ tiên (không gồm chính nó); thư mục đã xoá không hiện", async () => {
      const [a, b] = await chain(2);
      const gone = await create("Gone", b);
      await h.folderService.remove(MEMBER, gone.id, false);
      const listing = await h.folderService.list(OWNER, WS, b);
      expect(listing.folder?.id).toBe(b);
      expect(listing.breadcrumb.map((f) => f.id)).toEqual([a]);
      expect(listing.children).toHaveLength(0);
      const root = await h.folderService.list(OWNER, WS);
      expect(root.folder).toBeUndefined();
      await expect(h.folderService.list(OWNER, WS, gone.id)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("canModify do server tính: chủ thư mục và ADMIN được, MEMBER khác không", async () => {
      const a = await create("A");
      const asMember = (await h.folderService.list(MEMBER, WS)).children[0];
      const asOther = (await h.folderService.list(OTHER, WS)).children[0];
      const asAdmin = (await h.folderService.list(ADMIN, WS)).children[0];
      expect([asMember?.canModify, asOther?.canModify, asAdmin?.canModify]).toEqual([true, false, true]);
      expect(asMember?.id).toBe(a.id);
    });
  });
});
