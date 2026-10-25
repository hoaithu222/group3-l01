import { LIMITS } from "../../../core/constants/limits";
import type { ListSetsQueryDto } from "../dtos";
import { ADMIN, AUTHOR, MEMBER, OWNER, PLATFORM_ADMIN, STRANGER, WS, WS2, flash, makeHarness, mc, seedSet, type Harness } from "./support/harness";

const listQuery = (over: Partial<ListSetsQueryDto> = {}): ListSetsQueryDto => ({ scope: "mine", limit: 30, ...over });

describe("study-set.service — tạo / xem / sửa / xoá", () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  describe("tạo bộ", () => {
    it("PRIVATE mặc định: chuẩn hoá tiêu đề/thẻ, version 1, myPermissions do server tính", async () => {
      const dto = await h.setService.create(AUTHOR, { title: "Từ Vựng Tiếng Anh", tags: ["Tiếng Anh", "tiếng anh", "IELTS"], visibility: "PRIVATE" });
      expect(dto).toMatchObject({ visibility: "PRIVATE", status: "ACTIVE", version: 1, itemCount: 0, tags: ["tieng anh", "ielts"], workspaceId: null });
      expect((await h.sets.findById(dto.id))!.normalizedTitle).toBe("tu vung tieng anh");
      expect(dto.myPermissions).toEqual({ edit: true, delete: true, duplicate: true, report: false, hide: false, unhide: false });
      expect(dto.owner).toEqual({ id: AUTHOR.id, name: "Người a1" });
    });

    it("WORKSPACE thiếu nhóm → STUDY_003; người không phải thành viên → 404; hợp lệ → gắn workspaceId", async () => {
      await expect(h.setService.create(AUTHOR, { title: "x", tags: [], visibility: "WORKSPACE" })).rejects.toMatchObject({ errorCode: "STUDY_003", statusCode: 400 });
      await expect(h.setService.create(STRANGER, { title: "x", tags: [], visibility: "WORKSPACE", workspaceId: WS })).rejects.toMatchObject({ statusCode: 404 });
      expect(await h.setService.create(AUTHOR, { title: "x", tags: [], visibility: "WORKSPACE", workspaceId: WS })).toMatchObject({ visibility: "WORKSPACE", workspaceId: WS });
    });

    it("PUBLIC thiếu xác nhận → STUDY_008; có confirmPublic → tạo được", async () => {
      await expect(h.setService.create(AUTHOR, { title: "x", tags: [], visibility: "PUBLIC" })).rejects.toMatchObject({ errorCode: "STUDY_008" });
      expect(await h.setService.create(AUTHOR, { title: "x", tags: [], visibility: "PUBLIC", confirmPublic: true })).toMatchObject({ visibility: "PUBLIC" });
    });

    it("quá số bộ tối đa mỗi người → 409 STUDY_007 (bộ đã xoá không tính)", async () => {
      for (let i = 0; i < LIMITS.study.setsPerUserMax; i += 1) {
        await h.sets.create({ id: `${i}`.padStart(24, "0"), ownerId: AUTHOR.id, workspaceId: null, title: `t${i}`, normalizedTitle: `t${i}`, description: null, tags: [], coverAssetId: null, language: null, visibility: "PRIVATE", itemCount: 0, itemTypesMask: 0, copiedFromId: null });
      }
      await expect(h.setService.create(AUTHOR, { title: "thừa", tags: [], visibility: "PRIVATE" })).rejects.toMatchObject({ errorCode: "STUDY_007", statusCode: 409 });
      await h.sets.updateIf("0".padStart(24, "0"), {}, { status: "DELETED", deletedAt: new Date() });
      expect((await h.setService.create(AUTHOR, { title: "vừa đủ", tags: [], visibility: "PRIVATE" })).id).toBeDefined();
    });

    it("ảnh bìa: phải là ảnh READY/STUDY của mình, chưa gắn → gắn STUDY_SET_COVER; sai → STUDY_006", async () => {
      const cover = h.readyAsset(AUTHOR);
      const dto = await h.setService.create(AUTHOR, { title: "x", tags: [], visibility: "PRIVATE", coverAssetId: cover });
      expect(dto.coverAssetId).toBe(cover);
      expect(h.assets.linksOf("STUDY_SET_COVER", dto.id)).toEqual([cover]);
      await expect(h.setService.create(AUTHOR, { title: "y", tags: [], visibility: "PRIVATE", coverAssetId: h.readyAsset(MEMBER) })).rejects.toMatchObject({ errorCode: "STUDY_006" });
      await expect(h.setService.create(AUTHOR, { title: "z", tags: [], visibility: "PRIVATE", coverAssetId: h.readyAsset(AUTHOR, "AUDIO") })).rejects.toMatchObject({ errorCode: "STUDY_006" });
    });
  });

  describe("xem chi tiết — ST-04 (phần service)", () => {
    it("bộ PRIVATE: người khác 404 (kể cả OWNER nhóm); bộ không tồn tại cũng 404 — không phân biệt", async () => {
      const { id } = await seedSet(h);
      for (const u of [STRANGER, OWNER]) await expect(h.setService.get(u, id)).rejects.toMatchObject({ statusCode: 404, errorCode: "PERM_404" });
      await expect(h.setService.get(AUTHOR, "0000000000000000000000ff")).rejects.toMatchObject({ statusCode: 404, errorCode: "PERM_404" });
      expect((await h.setService.get(AUTHOR, id)).id).toBe(id);
    });

    it("bộ WORKSPACE: thành viên xem với quyền nhân bản/báo cáo; OWNER thêm quyền ẩn", async () => {
      const { id } = await seedSet(h, { visibility: "WORKSPACE" });
      expect((await h.setService.get(MEMBER, id)).myPermissions).toEqual({ edit: false, delete: false, duplicate: true, report: true, hide: false, unhide: false });
      expect((await h.setService.get(OWNER, id)).myPermissions.hide).toBe(true);
    });
  });

  describe("sửa thông tin — patch", () => {
    it("đổi tiêu đề/mô tả/thẻ; version+1; expectedVersion lệch → 409 RES_003 kèm currentVersion", async () => {
      const { id, version } = await seedSet(h);
      const dto = await h.setService.patch(AUTHOR, id, { expectedVersion: version, title: "Tên mới", description: "Mô tả", tags: ["Toán"] });
      expect(dto).toMatchObject({ title: "Tên mới", description: "Mô tả", tags: ["toan"], version: version + 1 });
      expect((await h.sets.findById(id))!.normalizedTitle).toBe("ten moi");
      await expect(h.setService.patch(AUTHOR, id, { expectedVersion: version, title: "Lệch" })).rejects.toMatchObject({ statusCode: 409, errorCode: "RES_003", details: { currentVersion: version + 1 } });
    });

    it("chỉ tác giả: người xem được nhưng không phải tác giả → 403; người không thấy → 404", async () => {
      const { id, version } = await seedSet(h, { visibility: "WORKSPACE" });
      await expect(h.setService.patch(MEMBER, id, { expectedVersion: version, title: "x" })).rejects.toMatchObject({ statusCode: 403 });
      await expect(h.setService.patch(STRANGER, id, { expectedVersion: version, title: "x" })).rejects.toMatchObject({ statusCode: 404 });
    });

    it("→ PUBLIC cần confirmPublic (STUDY_008); PUBLIC → PRIVATE không cần xác nhận", async () => {
      const { id, version } = await seedSet(h);
      await expect(h.setService.patch(AUTHOR, id, { expectedVersion: version, visibility: "PUBLIC" })).rejects.toMatchObject({ errorCode: "STUDY_008" });
      const pub = await h.setService.patch(AUTHOR, id, { expectedVersion: version, visibility: "PUBLIC", confirmPublic: true });
      expect(pub.visibility).toBe("PUBLIC");
      expect((await h.setService.patch(AUTHOR, id, { expectedVersion: pub.version, visibility: "PRIVATE" })).visibility).toBe("PRIVATE");
    });

    it("→ WORKSPACE cần nhóm (STUDY_003) + là thành viên; đã gắn nhóm thì KHÔNG đổi sang nhóm khác (STUDY_003)", async () => {
      const { id, version } = await seedSet(h);
      await expect(h.setService.patch(AUTHOR, id, { expectedVersion: version, visibility: "WORKSPACE" })).rejects.toMatchObject({ errorCode: "STUDY_003" });
      await expect(h.setService.patch(AUTHOR, id, { expectedVersion: version, visibility: "WORKSPACE", workspaceId: WS2 })).rejects.toMatchObject({ statusCode: 404 });
      const ws = await h.setService.patch(AUTHOR, id, { expectedVersion: version, visibility: "WORKSPACE", workspaceId: WS });
      expect(ws).toMatchObject({ visibility: "WORKSPACE", workspaceId: WS });
      await expect(h.setService.patch(AUTHOR, id, { expectedVersion: ws.version, workspaceId: WS2 })).rejects.toMatchObject({ errorCode: "STUDY_003", details: { reason: "IMMUTABLE" } });
      // WORKSPACE → PRIVATE giữ workspaceId; quay lại WORKSPACE không cần gửi lại nhóm
      const back = await h.setService.patch(AUTHOR, id, { expectedVersion: ws.version, visibility: "PRIVATE" });
      const again = await h.setService.patch(AUTHOR, id, { expectedVersion: back.version, visibility: "WORKSPACE" });
      expect(again.workspaceId).toBe(WS);
    });

    it("đổi ảnh bìa: gỡ link cũ, gắn link mới; null = bỏ ảnh bìa", async () => {
      const c1 = h.readyAsset(AUTHOR);
      const c2 = h.readyAsset(AUTHOR);
      const created = await h.setService.create(AUTHOR, { title: "x", tags: [], visibility: "PRIVATE", coverAssetId: c1 });
      const swapped = await h.setService.patch(AUTHOR, created.id, { expectedVersion: created.version, coverAssetId: c2 });
      expect(swapped.coverAssetId).toBe(c2);
      expect(h.assets.linksOf("STUDY_SET_COVER", created.id)).toEqual([c2]);
      const cleared = await h.setService.patch(AUTHOR, created.id, { expectedVersion: swapped.version, coverAssetId: null });
      expect(cleared.coverAssetId).toBeNull();
      expect(h.assets.linksOf("STUDY_SET_COVER", created.id)).toEqual([]);
    });
  });

  describe("xoá mềm", () => {
    it("tác giả xoá → 404 với mọi người sau đó; không xoá được lần hai; người khác không xoá được", async () => {
      const { id } = await seedSet(h, { visibility: "WORKSPACE" });
      await expect(h.setService.remove(MEMBER, id)).rejects.toMatchObject({ statusCode: 403 });
      await h.setService.remove(AUTHOR, id);
      expect((await h.sets.findById(id))!.status).toBe("DELETED");
      await expect(h.setService.get(AUTHOR, id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(h.setService.remove(AUTHOR, id)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("tác giả xoá được cả bộ đã bị ẩn", async () => {
      const { id } = await seedSet(h);
      await h.sets.updateIf(id, {}, { status: "HIDDEN" });
      await h.setService.remove(AUTHOR, id);
      expect((await h.sets.findById(id))!.status).toBe("DELETED");
    });
  });
});

describe("study-set-list.service — danh sách theo phạm vi, tìm kiếm, thẻ", () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  const titles = (page: { data: Array<{ title: string }> }) => page.data.map((s) => s.title);

  it("mine: chỉ bộ của mình (kể cả bộ đã ẩn), không có bộ đã xoá; mới cập nhật lên đầu", async () => {
    await seedSet(h, { title: "Một" });
    const two = await seedSet(h, { title: "Hai" });
    const three = await seedSet(h, { title: "Ba" });
    await h.setService.remove(AUTHOR, three.id);
    await h.sets.updateIf(two.id, {}, { status: "HIDDEN" });
    await h.setService.create(MEMBER, { title: "Của người khác", tags: [], visibility: "PRIVATE" });
    const page = await h.listService.list(AUTHOR, listQuery());
    expect(titles(page)).toEqual(["Hai", "Một"]);
    expect(page.data.find((s) => s.title === "Hai")).toMatchObject({ status: "HIDDEN" });
  });

  it("public: chỉ PUBLIC ACTIVE — bộ bị ẩn không xuất hiện ở khám phá (ST-19); tìm không dấu AND từng từ; lọc thẻ", async () => {
    const a = await h.setService.create(AUTHOR, { title: "Hà Nội và Thăng Long", tags: ["Lịch sử"], visibility: "PUBLIC", confirmPublic: true });
    await h.setService.create(MEMBER, { title: "Toán cao cấp", tags: ["Toán"], visibility: "PUBLIC", confirmPublic: true });
    await h.setService.create(MEMBER, { title: "Hà Nội riêng tư", tags: [], visibility: "PRIVATE" });
    expect(titles(await h.listService.list(STRANGER, listQuery({ scope: "public" })))).toEqual(["Toán cao cấp", "Hà Nội và Thăng Long"]);
    expect(titles(await h.listService.list(STRANGER, listQuery({ scope: "public", q: "ha noi" })))).toEqual(["Hà Nội và Thăng Long"]);
    expect(titles(await h.listService.list(STRANGER, listQuery({ scope: "public", q: "thang ha" })))).toEqual(["Hà Nội và Thăng Long"]);
    expect(titles(await h.listService.list(STRANGER, listQuery({ scope: "public", tag: "Toán" })))).toEqual(["Toán cao cấp"]);
    await h.moderation.adminHide(PLATFORM_ADMIN, a.id, "Vi phạm bản quyền giáo trình");
    expect(titles(await h.listService.list(STRANGER, listQuery({ scope: "public" })))).toEqual(["Toán cao cấp"]);
  });

  it("q chứa ký tự regex chỉ khớp LITERAL (không làm hỏng truy vấn)", async () => {
    await h.setService.create(AUTHOR, { title: "a.b", tags: [], visibility: "PUBLIC", confirmPublic: true });
    await h.setService.create(AUTHOR, { title: "aXb", tags: [], visibility: "PUBLIC", confirmPublic: true });
    // in-memory dùng includes (literal) — kiểm chứng `escapeRegex` thật ở test tích hợp Mongo
    expect(titles(await h.listService.list(STRANGER, listQuery({ scope: "public", q: "a.b" })))).toEqual(["a.b"]);
  });

  it("hasQuiz=true: chỉ bộ có câu chấm điểm được", async () => {
    const quiz = await h.setService.create(AUTHOR, { title: "Có trắc nghiệm", tags: [], visibility: "PUBLIC", confirmPublic: true });
    const cards = await h.setService.create(AUTHOR, { title: "Chỉ thẻ", tags: [], visibility: "PUBLIC", confirmPublic: true });
    await h.bulk.save(AUTHOR, quiz.id, { expectedVersion: 1, upsert: [flash("a"), mc("b")], delete: [] });
    await h.bulk.save(AUTHOR, cards.id, { expectedVersion: 1, upsert: [flash("a")], delete: [] });
    const page = await h.listService.list(STRANGER, listQuery({ scope: "public", hasQuiz: true }));
    expect(titles(page)).toEqual(["Có trắc nghiệm"]);
    expect(page.data[0]!.hasQuiz).toBe(true);
  });

  it("workspace: phải là thành viên (GUEST/người ngoài → 404); thiếu workspaceId → STUDY_003; MEMBER không thấy bộ ẩn của người khác, OWNER/ADMIN thấy", async () => {
    const own = await seedSet(h, { visibility: "WORKSPACE", title: "Bộ nhóm" });
    const hiddenSet = await h.setService.create(MEMBER, { title: "Bộ bị ẩn", tags: [], visibility: "WORKSPACE", workspaceId: WS });
    await h.moderation.hide(OWNER, hiddenSet.id, "Nội dung không phù hợp với nhóm");
    expect(own.id).toBeDefined();
    await expect(h.listService.list(STRANGER, listQuery({ scope: "workspace", workspaceId: WS }))).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.listService.list(AUTHOR, listQuery({ scope: "workspace" }))).rejects.toMatchObject({ errorCode: "STUDY_003" });
    expect(titles(await h.listService.list(AUTHOR, listQuery({ scope: "workspace", workspaceId: WS })))).toEqual(["Bộ nhóm"]);
    expect(titles(await h.listService.list(ADMIN, listQuery({ scope: "workspace", workspaceId: WS })))).toEqual(["Bộ bị ẩn", "Bộ nhóm"]);
    expect(titles(await h.listService.list(MEMBER, listQuery({ scope: "workspace", workspaceId: WS })))).toEqual(["Bộ bị ẩn", "Bộ nhóm"]); // của chính mình
  });

  it("cursor: trang 2 nối tiếp, không trùng, hasMore đúng; cursor sai → 400", async () => {
    for (const t of ["A1", "A2", "A3", "A4", "A5"]) await seedSet(h, { title: t });
    const p1 = await h.listService.list(AUTHOR, listQuery({ limit: 2 }));
    expect(titles(p1)).toEqual(["A5", "A4"]);
    expect(p1.meta.hasMore).toBe(true);
    const p2 = await h.listService.list(AUTHOR, listQuery({ limit: 2, cursor: p1.meta.nextCursor ?? undefined }));
    expect(titles(p2)).toEqual(["A3", "A2"]);
    const p3 = await h.listService.list(AUTHOR, listQuery({ limit: 2, cursor: p2.meta.nextCursor ?? undefined }));
    expect(titles(p3)).toEqual(["A1"]);
    expect(p3.meta).toMatchObject({ hasMore: false, nextCursor: null });
    await expect(h.listService.list(AUTHOR, listQuery({ cursor: "###" }))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("thumbnail ảnh bìa được ký hàng loạt cho cả trang", async () => {
    const cover = h.readyAsset(AUTHOR);
    await h.setService.create(AUTHOR, { title: "Có bìa", tags: [], visibility: "PRIVATE", coverAssetId: cover });
    await seedSet(h, { title: "Không bìa" });
    const page = await h.listService.list(AUTHOR, listQuery());
    expect(page.data.find((s) => s.title === "Có bìa")!.coverThumbUrl).toBe(`https://thumb.test/${cover}`);
    expect(page.data.find((s) => s.title === "Không bìa")!.coverThumbUrl).toBeNull();
  });

  it("thẻ phổ biến: đếm theo bộ PUBLIC, cache lại; xem thẻ của nhóm cần là thành viên", async () => {
    await h.setService.create(AUTHOR, { title: "1", tags: ["toan", "ly"], visibility: "PUBLIC", confirmPublic: true });
    await h.setService.create(AUTHOR, { title: "2", tags: ["toan"], visibility: "PUBLIC", confirmPublic: true });
    await h.setService.create(AUTHOR, { title: "3", tags: ["rieng"], visibility: "PRIVATE" });
    expect(await h.listService.popularTags(STRANGER, {})).toEqual([{ tag: "toan", count: 2 }, { tag: "ly", count: 1 }]);
    await h.setService.create(AUTHOR, { title: "4", tags: ["toan"], visibility: "PUBLIC", confirmPublic: true });
    expect((await h.listService.popularTags(STRANGER, {}))[0]).toEqual({ tag: "toan", count: 2 }); // còn trong cache 10 phút
    await expect(h.listService.popularTags(STRANGER, { workspaceId: WS })).rejects.toMatchObject({ statusCode: 404 });
    await h.setService.create(AUTHOR, { title: "5", tags: ["nhom"], visibility: "WORKSPACE", workspaceId: WS });
    expect(await h.listService.popularTags(MEMBER, { workspaceId: WS })).toEqual([{ tag: "nhom", count: 1 }]);
  });
});

describe("study-item-query.service — mục kèm đáp án cho chế độ học", () => {
  it("ST-04 (service): người không đọc được bộ PRIVATE → 404; tác giả nhận đủ mục theo thứ tự + setVersion", async () => {
    const h = makeHarness();
    const { id, version } = await seedSet(h);
    await h.bulk.save(AUTHOR, id, { expectedVersion: version, upsert: [flash("a"), mc("b")], delete: [] });
    await expect(h.itemQuery.list(STRANGER, id, { limit: 500 })).rejects.toMatchObject({ statusCode: 404 });
    const page = await h.itemQuery.list(AUTHOR, id, { limit: 500 });
    expect(page.data.map((i) => i.prompt)).toEqual(["Mặt trước a", "Câu hỏi b"]);
    expect(page.data[1]!.correctOptionIds).toHaveLength(1); // chế độ học CÓ đáp án
    expect(page.data[0]).not.toHaveProperty("ownerId");
    expect(page.meta).toMatchObject({ hasMore: false, setVersion: version + 1 });
  });

  it("phân trang theo cursor; cursor sai → 400", async () => {
    const h = makeHarness();
    const { id, version } = await seedSet(h);
    await h.bulk.save(AUTHOR, id, { expectedVersion: version, upsert: [flash("a"), flash("b"), flash("c")], delete: [] });
    const p1 = await h.itemQuery.list(AUTHOR, id, { limit: 2 });
    expect(p1.data.map((i) => i.prompt)).toEqual(["Mặt trước a", "Mặt trước b"]);
    const p2 = await h.itemQuery.list(AUTHOR, id, { limit: 2, cursor: p1.meta.nextCursor as string });
    expect(p2.data.map((i) => i.prompt)).toEqual(["Mặt trước c"]);
    await expect(h.itemQuery.list(AUTHOR, id, { limit: 2, cursor: "###" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("thành viên nhóm đọc được mục của bộ WORKSPACE; bộ đã ẩn: người khác 404, tác giả vẫn đọc", async () => {
    const h = makeHarness();
    const { id, version } = await seedSet(h, { visibility: "WORKSPACE" });
    await h.bulk.save(AUTHOR, id, { expectedVersion: version, upsert: [flash("a")], delete: [] });
    expect((await h.itemQuery.list(MEMBER, id, { limit: 500 })).data).toHaveLength(1);
    await h.moderation.hide(OWNER, id, "Vi phạm quy định của nhóm");
    await expect(h.itemQuery.list(MEMBER, id, { limit: 500 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.itemQuery.list(OWNER, id, { limit: 500 })).rejects.toMatchObject({ statusCode: 404 }); // moderator chỉ thấy metadata
    expect((await h.itemQuery.list(AUTHOR, id, { limit: 500 })).data).toHaveLength(1);
  });
});
