import type { ListResourcesQueryDto } from "../dtos";
import { makeHarness, ADMIN, GUEST, MEMBER, OTHER, OUTSIDER, OWNER, WS, type Harness } from "./support/harness";

/** Unit (repo in-memory, cổng asset giả) — nghiệp vụ tệp: tạo từ asset, danh sách/cache, sửa, xoá/khôi phục, URL. */
describe("ResourceService / ResourceListService / ResourceMutationService", () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  const create = (u = MEMBER, extra: Parameters<Harness["readyAsset"]>[1] = {}, folderId?: string) =>
    h.resourceService.create(u, WS, { assetId: h.readyAsset(u, extra).id, folderId, tags: [] });
  const list = (u = MEMBER, q: Partial<ListResourcesQueryDto> = {}) =>
    h.listService.list(u, WS, { limit: 30, sort: "createdAt", order: "desc", ...q } as ListResourcesQueryDto);

  describe("tạo từ asset", () => {
    it("ghi Resource + AssetLink + outbox + dung lượng + bump cache; trả chỗ đã giữ", async () => {
      const asset = h.readyAsset(MEMBER, { size: 1234 });
      await h.quota.reserve(WS, asset.id, 1234);
      const dto = await h.resourceService.create(MEMBER, WS, { assetId: asset.id, tags: ["ôn thi"], description: "mô tả" });
      expect(dto).toMatchObject({ name: asset.originalName, type: "PDF", size: 1234, canModify: true, tags: ["ôn thi"] });
      expect(dto.uploadedBy).toMatchObject({ id: MEMBER.id, avatarUrl: null });
      expect(h.assets.links.has(asset.id)).toBe(true);
      expect(h.storageRepo.used.get(WS)).toBe(1234);
      expect(h.outbox.events.map((e) => e.type)).toEqual(["resource.created"]);
      expect(await h.cache.version(WS)).toBe("1");
      expect(await h.reservations.reservedBytes(WS)).toBe(0);
    });

    it("người tải lên có ảnh → uploadedBy.avatarUrl là URL ảnh ký sẵn (THUMB) của đúng asset, cả ở danh sách; người không ảnh → null", async () => {
      const avatarAssetId = "65f0000000000000000000ab";
      const signedThumb = new RegExp(`^https?://[^/]+/api/v1/assets/${avatarAssetId}/image\\?v=THUMB&e=\\d+&s=[0-9a-f]{64}$`);
      h.users.users.set(MEMBER.id, { id: MEMBER.id, name: "Người a3", avatarAssetId });
      expect((await create(MEMBER)).uploadedBy.avatarUrl).toMatch(signedThumb);
      await create(OTHER);
      const rows = (await list(MEMBER)).data;
      expect(rows.find((r) => r.uploadedBy.id === MEMBER.id)?.uploadedBy.avatarUrl).toMatch(signedThumb);
      expect(rows.find((r) => r.uploadedBy.id === OTHER.id)?.uploadedBy.avatarUrl).toBeNull();
    });

    it("RSC_003: asset của người khác / chưa READY / khác scope / khác nhóm / không có / đã gắn", async () => {
      const cases: Array<Partial<Parameters<Harness["readyAsset"]>[1]>> = [
        { status: "PROCESSING" },
        { scope: "MESSAGE" },
        { workspaceId: "bbbbbbbbbbbbbbbbbbbbbbbb" },
        { variant: "THUMB" },
      ];
      for (const extra of cases) {
        await expect(create(MEMBER, extra)).rejects.toMatchObject({ statusCode: 400, errorCode: "RSC_003" });
      }
      const foreign = h.readyAsset(OTHER);
      await expect(h.resourceService.create(MEMBER, WS, { assetId: foreign.id, tags: [] })).rejects.toMatchObject({ errorCode: "RSC_003" });
      await expect(h.resourceService.create(MEMBER, WS, { assetId: "dddddddddddddddddddddddd", tags: [] })).rejects.toMatchObject({ errorCode: "RSC_003" });
      const ok = await create();
      const asset = [...h.assets.assets.values()].find((a) => h.assets.links.has(a.id));
      await expect(h.resourceService.create(MEMBER, WS, { assetId: asset?.id ?? "", tags: [] })).rejects.toMatchObject({ errorCode: "RSC_003" });
      expect(ok.id).toBeDefined();
    });

    it("RSC_007 (kiểm CỨNG trong transaction): used + size > quota → 413, không ghi gì", async () => {
      h.config.quotaBytes = 5000;
      h.storageRepo.used.set(WS, 4500);
      await expect(create(MEMBER, { size: 600 })).rejects.toMatchObject({ statusCode: 413, errorCode: "RSC_007" });
      expect(h.resources.store.size).toBe(0);
      expect(h.storageRepo.used.get(WS)).toBe(4500);
      await expect(create(MEMBER, { size: 500 })).resolves.toBeDefined(); // vừa khít hạn mức
    });

    it("thư mục đích không tồn tại/đã xoá → 404; quyền: GUEST/ngoài nhóm 404, ARCHIVED 403", async () => {
      await expect(create(MEMBER, {}, "cccccccccccccccccccccccc")).rejects.toMatchObject({ statusCode: 404 });
      await expect(create(GUEST)).rejects.toMatchObject({ statusCode: 404 });
      await expect(create(OUTSIDER)).rejects.toMatchObject({ statusCode: 404 });
      h.access.archived = true;
      await expect(create()).rejects.toMatchObject({ statusCode: 403 });
    });

    it("tên mặc định = originalName; tên quá 200 ký tự bị cắt nhưng GIỮ đuôi", async () => {
      const long = `${"a".repeat(300)}.pdf`;
      const dto = await create(MEMBER, { originalName: long });
      expect(dto.name).toHaveLength(200);
      expect(dto.name.endsWith(".pdf")).toBe(true);
      expect(dto.extension).toBe("pdf");
    });
  });

  describe("danh sách", () => {
    it("trang đầu được cache; ghi bump phiên bản → trang đầu mới; cursor KHÔNG dùng cache", async () => {
      await create();
      await list();
      expect(h.cache.entries.size).toBe(1);
      const a = await list();
      expect(h.cache.hits).toBe(1);
      expect(a.data).toHaveLength(1);
      await create();
      expect((await list()).data).toHaveLength(2);
      await list(MEMBER, { q: "tai lieu" });
      expect(h.cache.entries.size).toBe(2); // tìm kiếm không cache
    });

    it("cursor: duyệt hết theo tên, không lặp/không sót; hasMore đúng", async () => {
      for (const name of ["d.pdf", "b.pdf", "a.pdf", "c.pdf", "e.pdf"]) await create(MEMBER, { originalName: name });
      const seen: string[] = [];
      let cursor: string | undefined;
      let hasMore = true;
      while (hasMore) {
        const page = await list(MEMBER, { sort: "name", order: "asc", limit: 2, cursor });
        seen.push(...page.data.map((r) => r.name));
        cursor = page.meta.nextCursor ?? undefined;
        hasMore = page.meta.hasMore;
      }
      expect(seen).toEqual(["a.pdf", "b.pdf", "c.pdf", "d.pdf", "e.pdf"]);
    });

    it("tìm không dấu AND theo từ, trải mọi thư mục; lọc type; thư mục không tồn tại → 404", async () => {
      const folder = await h.folderService.create(MEMBER, WS, { name: "HK1" });
      await create(MEMBER, { originalName: "Bài Giảng Xác Suất.pdf" });
      await create(MEMBER, { originalName: "bai tap xac suat.png", mime: "image/png" }, folder.id);
      expect((await list(MEMBER, { q: "BAI xac" })).data).toHaveLength(2);
      expect((await list(MEMBER, { q: "giang suat" })).data).toHaveLength(1);
      expect((await list(MEMBER, { folderId: folder.id, type: "IMAGE" })).data).toHaveLength(1);
      expect((await list(MEMBER, { folderId: folder.id, type: "PDF" })).data).toHaveLength(0);
      await expect(list(MEMBER, { folderId: "cccccccccccccccccccccccc" })).rejects.toMatchObject({ statusCode: 404 });
    });

    it("kết quả TÌM kèm folderPath (tên thư mục từ gốc → thư mục chứa, nối ' / '; gốc kho = ''); liệt kê theo thư mục thì KHÔNG có", async () => {
      const hk1 = await h.folderService.create(MEMBER, WS, { name: "HK1" });
      const tuan3 = await h.folderService.create(MEMBER, WS, { name: "Tuần 3", parentId: hk1.id });
      await create(MEMBER, { originalName: "bai tap goc.pdf" });
      await create(MEMBER, { originalName: "bai tap hk1.pdf" }, hk1.id);
      await create(MEMBER, { originalName: "bai tap sau.pdf" }, tuan3.id);

      const found = await list(MEMBER, { q: "bai tap" });
      const pathOf = (name: string) => found.data.find((r) => r.name === name)?.folderPath;
      expect(pathOf("bai tap goc.pdf")).toBe("");
      expect(pathOf("bai tap hk1.pdf")).toBe("HK1");
      expect(pathOf("bai tap sau.pdf")).toBe("HK1 / Tuần 3");

      const inFolder = await list(MEMBER, { folderId: tuan3.id });
      expect(inFolder.data).toHaveLength(1);
      expect("folderPath" in (inFolder.data[0] ?? {})).toBe(false);
      // Không rò vào cache trang đầu của liệt kê thư mục.
      expect(JSON.stringify([...h.cache.entries.values()])).not.toContain("folderPath");
    });

    it("folderPath: đổi tên/di chuyển thư mục phản ánh ngay ở lần tìm sau; tìm trong thư mục sâu không N+1 (≤ 2 truy vấn thư mục/trang)", async () => {
      const a = await h.folderService.create(MEMBER, WS, { name: "A" });
      const b = await h.folderService.create(MEMBER, WS, { name: "B", parentId: a.id });
      await create(MEMBER, { originalName: "so do.pdf" }, b.id);
      await create(MEMBER, { originalName: "so do 2.pdf" }, b.id);
      await create(MEMBER, { originalName: "so do 3.pdf" }, a.id);

      const spy = jest.spyOn(h.folders, "findByIds");
      const found = await list(MEMBER, { q: "so do" });
      expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
      expect(found.data.map((r) => r.folderPath).sort()).toEqual(["A", "A / B", "A / B"]);

      await h.folderService.update(MEMBER, b.id, { name: "B2", expectedVersion: b.version });
      const renamed = await list(MEMBER, { q: "so do 2" });
      expect(renamed.data[0]?.folderPath).toBe("A / B2");
    });

    it("ảnh có thumbnailUrl ký lúc trả lời (không nằm trong cache); canModify theo người xem", async () => {
      await create(MEMBER, { mime: "image/png", originalName: "a.png" });
      const asMember = (await list(MEMBER)).data[0];
      const asOther = (await list(OTHER)).data[0];
      const asAdmin = (await list(ADMIN)).data[0];
      expect(asMember?.thumbnailUrl).toMatch(/^https:\/\/thumb\.test\//);
      expect([asMember?.canModify, asOther?.canModify, asAdmin?.canModify]).toEqual([true, false, true]);
      const cached = [...h.cache.entries.values()][0];
      expect(JSON.stringify(cached)).not.toContain("thumb.test");
    });

    it("GUEST và người ngoài không liệt kê được (404)", async () => {
      await expect(list(GUEST)).rejects.toMatchObject({ statusCode: 404 });
      await expect(list(OUTSIDER)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("sửa / xoá / khôi phục", () => {
    it("ST-14: MEMBER xoá tệp người khác → 403; OWNER xoá được; vào thùng rác; khôi phục chỉ OWNER/ADMIN/người xoá", async () => {
      const file = await create(OTHER);
      await expect(h.mutations.remove(MEMBER, file.id)).rejects.toMatchObject({ statusCode: 403 });
      await h.mutations.remove(OWNER, file.id);
      expect(h.resources.store.get(file.id)?.deletedAt).not.toBeNull();
      expect(h.storageRepo.used.get(WS)).toBe(1000); // vẫn tính dung lượng
      await expect(h.mutations.restore(MEMBER, file.id)).rejects.toMatchObject({ statusCode: 403 });
      await expect(h.mutations.restore(OTHER, file.id)).rejects.toMatchObject({ statusCode: 403 }); // chủ tệp nhưng không phải người xoá
      await expect(h.mutations.restore(ADMIN, file.id)).resolves.toMatchObject({ id: file.id });
    });

    it("người xoá (MEMBER, tệp của mình) tự khôi phục được; mục quá hạn giữ → 404", async () => {
      const file = await create(MEMBER);
      await h.mutations.remove(MEMBER, file.id);
      await expect(h.mutations.restore(MEMBER, file.id)).resolves.toBeDefined();
      await h.mutations.remove(MEMBER, file.id);
      h.clock.now = new Date(h.clock.now.getTime() + 31 * 24 * 3600 * 1000);
      await expect(h.mutations.restore(MEMBER, file.id)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("khôi phục về gốc khi thư mục cũ đã xoá", async () => {
      const folder = await h.folderService.create(MEMBER, WS, { name: "F" });
      const file = await create(MEMBER, {}, folder.id);
      await h.mutations.remove(MEMBER, file.id);
      await h.folderService.remove(MEMBER, folder.id, false);
      const restored = await h.mutations.restore(MEMBER, file.id);
      expect(restored.folderId).toBeNull();
    });

    it("patch: tính lại type/language khi đổi tên, CAS phiên bản, không sửa tệp đã xoá", async () => {
      const file = await create(MEMBER, { mime: "text/plain", originalName: "x.txt" });
      expect(file.type).toBe("TEXT");
      const renamed = await h.mutations.patch(MEMBER, file.id, { name: "x.ts", expectedVersion: 1 });
      expect(renamed).toMatchObject({ type: "CODE", language: "typescript", version: 2 });
      await expect(h.mutations.patch(MEMBER, file.id, { name: "y.ts", expectedVersion: 1 })).rejects.toMatchObject({
        errorCode: "RES_003",
        details: { currentVersion: 2 },
      });
      await h.mutations.remove(MEMBER, file.id);
      await expect(h.mutations.patch(MEMBER, file.id, { name: "z.ts", expectedVersion: 3 })).rejects.toMatchObject({ statusCode: 404 });
    });

    it("id không tồn tại/đã xoá → PERM_404 trung tính", async () => {
      await expect(h.mutations.remove(MEMBER, "cccccccccccccccccccccccc")).rejects.toMatchObject({ errorCode: "PERM_404" });
      await expect(h.resourceService.get(MEMBER, "cccccccccccccccccccccccc")).rejects.toMatchObject({ errorCode: "PERM_404" });
    });
  });

  describe("chi tiết & URL", () => {
    it("get trả myPermissions theo vai; GUEST/ngoài 404", async () => {
      const file = await create(MEMBER);
      const asMember = await h.resourceService.get(MEMBER, file.id);
      expect(asMember.myPermissions).toEqual(["workspace.folder.manage", "workspace.resource.read", "workspace.resource.upload"]);
      expect((await h.resourceService.get(ADMIN, file.id)).myPermissions).toContain("workspace.resource.delete");
      await expect(h.resourceService.get(GUEST, file.id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(h.resourceService.get(OUTSIDER, file.id)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("url: original/download; preview chỉ khi NATIVE, Office → RSC_005 (convertible); tệp đã xoá → 404", async () => {
      const pdf = await create(MEMBER);
      const docx = await create(MEMBER, {
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        originalName: "de.docx",
      });
      expect(await h.resourceService.url(MEMBER, pdf.id, { variant: "download" })).toMatchObject({ disposition: "attachment", mime: "application/pdf" });
      expect(await h.resourceService.url(MEMBER, pdf.id, { variant: "preview" })).toMatchObject({ disposition: "inline" });
      expect(await h.resourceService.url(MEMBER, docx.id, { variant: "original" })).toMatchObject({ disposition: "inline" });
      await expect(h.resourceService.url(MEMBER, docx.id, { variant: "preview" })).rejects.toMatchObject({
        statusCode: 409,
        errorCode: "RSC_005",
        details: { convertible: true },
      });
      await h.mutations.remove(MEMBER, pdf.id);
      await expect(h.resourceService.url(MEMBER, pdf.id, { variant: "original" })).rejects.toMatchObject({ statusCode: 404 });
      await expect(h.resourceService.url(GUEST, docx.id, { variant: "original" })).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
