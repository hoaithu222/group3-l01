import { LIMITS } from "../../../core/constants/limits";
import { ADMIN, AUTHOR, GUEST, MEMBER, OWNER, PLATFORM_ADMIN, STRANGER, WS, flash, makeHarness, mc, seedSet, type Harness } from "./support/harness";

/** Bộ của AUTHOR có 2 thẻ + 1 câu trắc nghiệm có ảnh lựa chọn, ảnh bìa và âm thanh. */
async function seedRichSet(h: Harness, visibility: "PRIVATE" | "WORKSPACE" | "PUBLIC" = "PUBLIC") {
  const cover = h.readyAsset(AUTHOR);
  const created = await h.setService.create(AUTHOR, {
    title: "Từ vựng",
    tags: ["Anh"],
    visibility,
    workspaceId: visibility === "WORKSPACE" ? WS : undefined,
    confirmPublic: visibility === "PUBLIC" ? true : undefined,
    coverAssetId: cover,
  });
  const optionImg = h.readyAsset(AUTHOR);
  const audio = h.readyAsset(AUTHOR, "AUDIO");
  const saved = await h.bulk.save(AUTHOR, created.id, {
    expectedVersion: created.version,
    upsert: [flash("a", { audioAssetId: audio }), flash("b"), mc("c", { options: [{ text: "A", mediaAssetId: optionImg }, { text: "B" }], correctOptionIndex: 1 })],
    delete: [],
  });
  return { id: created.id, version: saved.version, cover, optionImg, audio, itemIds: saved.idMap.map((m) => m.id) };
}

describe("study-set-duplicate.service — nhân bản", () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it("bản sao là bộ MỚI của người gọi: id/mục mới, giữ id lựa chọn + thứ tự, copiedFromId, tiêu đề '(bản sao)'; bản gốc copyCount+1", async () => {
    const src = await seedRichSet(h);
    const dup = await h.duplicateService.duplicate(STRANGER, src.id, { targetVisibility: "PRIVATE" });
    expect(dup).toMatchObject({ ownerId: STRANGER.id, title: "Từ vựng (bản sao)", visibility: "PRIVATE", copiedFromId: src.id, itemCount: 3, version: 1, status: "ACTIVE" });
    expect(dup.id).not.toBe(src.id);

    const [a, b] = await Promise.all([h.items.listBySet(src.id), h.items.listBySet(dup.id)]);
    expect(b.map((i) => i.id)).not.toEqual(expect.arrayContaining(a.map((i) => i.id)));
    expect(b.map((i) => [i.prompt, i.order])).toEqual(a.map((i) => [i.prompt, i.order]));
    expect(b[2]!.options.map((o) => o.id)).toEqual(a[2]!.options.map((o) => o.id));
    expect(b[2]!.correctOptionIds).toEqual(a[2]!.correctOptionIds);
    expect(b.every((i) => i.ownerId === STRANGER.id && i.setId === dup.id)).toBe(true);
    expect((await h.sets.findById(src.id))!.copyCount).toBe(1);
  });

  it("ST-18 (phần service): AssetLink MỚI trỏ CÙNG asset (không copy tệp) cho ảnh bìa, ảnh lựa chọn, âm thanh; link của bản gốc còn nguyên", async () => {
    const src = await seedRichSet(h);
    const dup = await h.duplicateService.duplicate(STRANGER, src.id, { targetVisibility: "PRIVATE" });
    const copyItems = await h.items.listBySet(dup.id);
    expect(h.assets.linksOf("STUDY_SET_COVER", dup.id)).toEqual([src.cover]);
    expect(h.assets.linksOf("STUDY_ITEM", copyItems[0]!.id)).toEqual([src.audio]);
    expect(h.assets.linksOf("STUDY_ITEM", copyItems[2]!.id)).toEqual([src.optionImg]);
    expect(h.assets.linksOf("STUDY_ITEM", src.itemIds[0]!)).toEqual([src.audio]); // gốc không đổi
    expect(h.assets.assets.size).toBe(3); // không sinh asset mới
  });

  it("ai nhân bản được: PUBLIC mọi người; WORKSPACE thành viên (GUEST/người ngoài 404); PRIVATE của người khác 404; tác giả nhân bản bộ của mình", async () => {
    const pub = await seedRichSet(h, "PUBLIC");
    await expect(h.duplicateService.duplicate(GUEST, pub.id, { targetVisibility: "PRIVATE" })).resolves.toBeDefined(); // GUEST nhóm vẫn nhân bản được bộ PUBLIC
    const ws = await seedRichSet(h, "WORKSPACE");
    await expect(h.duplicateService.duplicate(MEMBER, ws.id, { targetVisibility: "PRIVATE" })).resolves.toBeDefined();
    await expect(h.duplicateService.duplicate(GUEST, ws.id, { targetVisibility: "PRIVATE" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.duplicateService.duplicate(STRANGER, ws.id, { targetVisibility: "PRIVATE" })).rejects.toMatchObject({ statusCode: 404 });
    const priv = await seedRichSet(h, "PRIVATE");
    await expect(h.duplicateService.duplicate(STRANGER, priv.id, { targetVisibility: "PRIVATE" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.duplicateService.duplicate(AUTHOR, priv.id, { targetVisibility: "PRIVATE" })).resolves.toBeDefined();
  });

  it("bộ đã ẩn: tác giả nhân bản → 409 STUDY_004; người khác 404", async () => {
    const src = await seedRichSet(h, "PUBLIC");
    await h.moderation.adminHide(PLATFORM_ADMIN, src.id, "Nội dung vi phạm bản quyền");
    await expect(h.duplicateService.duplicate(AUTHOR, src.id, { targetVisibility: "PRIVATE" })).rejects.toMatchObject({ errorCode: "STUDY_004", statusCode: 409 });
    await expect(h.duplicateService.duplicate(STRANGER, src.id, { targetVisibility: "PRIVATE" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("nhân bản về nhóm: cần workspaceId (STUDY_003) và là thành viên nhóm đích; quá số bộ → STUDY_007", async () => {
    const src = await seedRichSet(h, "PUBLIC");
    await expect(h.duplicateService.duplicate(MEMBER, src.id, { targetVisibility: "WORKSPACE" })).rejects.toMatchObject({ errorCode: "STUDY_003" });
    await expect(h.duplicateService.duplicate(STRANGER, src.id, { targetVisibility: "WORKSPACE", workspaceId: WS })).rejects.toMatchObject({ statusCode: 404 });
    expect(await h.duplicateService.duplicate(MEMBER, src.id, { targetVisibility: "WORKSPACE", workspaceId: WS })).toMatchObject({ visibility: "WORKSPACE", workspaceId: WS });

    for (let i = 0; i < LIMITS.study.setsPerUserMax; i += 1) {
      await h.sets.create({ id: `${i + 1}`.padStart(24, "0"), ownerId: STRANGER.id, workspaceId: null, title: `t${i}`, normalizedTitle: `t${i}`, description: null, tags: [], coverAssetId: null, language: null, visibility: "PRIVATE", itemCount: 0, itemTypesMask: 0, copiedFromId: null });
    }
    await expect(h.duplicateService.duplicate(STRANGER, src.id, { targetVisibility: "PRIVATE" })).rejects.toMatchObject({ errorCode: "STUDY_007" });
  });

  it("tiêu đề rất dài được cắt để '(bản sao)' vẫn vừa giới hạn", async () => {
    const long = "Đ".repeat(LIMITS.study.setTitleMax);
    const src = await h.setService.create(AUTHOR, { title: long, tags: [], visibility: "PUBLIC", confirmPublic: true });
    const dup = await h.duplicateService.duplicate(STRANGER, src.id, { targetVisibility: "PRIVATE" });
    expect(Array.from(dup.title).length).toBeLessThanOrEqual(LIMITS.study.setTitleMax);
    expect(dup.title.endsWith(" (bản sao)")).toBe(true);
  });

  it("bản sao độc lập: sửa/xoá bản gốc không ảnh hưởng bản sao (và ngược lại)", async () => {
    const src = await seedRichSet(h);
    const dup = await h.duplicateService.duplicate(STRANGER, src.id, { targetVisibility: "PRIVATE" });
    await h.bulk.save(AUTHOR, src.id, { expectedVersion: src.version, upsert: [], delete: src.itemIds });
    expect(await h.items.listBySet(dup.id)).toHaveLength(3);
    expect(h.assets.linksOf("STUDY_SET_COVER", dup.id)).toEqual([src.cover]);
  });
});

describe("study-set-moderation.service — ẩn/khôi phục, báo cáo", () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it("ST-19 (service): admin ẩn bộ PUBLIC → người khác 404, tác giả vẫn thấy (status HIDDEN + lý do), không còn ở khám phá; có audit + đóng báo cáo", async () => {
    const { id } = await seedSet(h, { visibility: "PUBLIC" });
    const hidden = await h.moderation.adminHide(PLATFORM_ADMIN, id, "Vi phạm bản quyền giáo trình");
    expect(hidden).toMatchObject({ status: "HIDDEN", hiddenReason: "Vi phạm bản quyền giáo trình", canViewContent: true });
    await expect(h.setService.get(STRANGER, id)).rejects.toMatchObject({ statusCode: 404 });
    const mine = await h.setService.get(AUTHOR, id);
    expect(mine).toMatchObject({ status: "HIDDEN", hiddenReason: "Vi phạm bản quyền giáo trình" });
    expect(mine.myPermissions).toMatchObject({ edit: false, delete: true });
    expect((await h.listService.list(STRANGER, { scope: "public", limit: 30 })).data).toHaveLength(0);
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "study-set.hide", actorId: PLATFORM_ADMIN.id, targetType: "StudySet", targetId: id, reason: "Vi phạm bản quyền giáo trình" }));
    expect(h.reports.closed).toEqual([{ targetId: id, resolution: "CONTENT_REMOVED", level: "PLATFORM" }]);
  });

  it("khôi phục: quay lại ACTIVE, xoá lý do/người ẩn; có audit; hiện lại ở khám phá", async () => {
    const { id } = await seedSet(h, { visibility: "PUBLIC" });
    await h.moderation.adminHide(PLATFORM_ADMIN, id, "Vi phạm bản quyền giáo trình");
    const restored = await h.moderation.adminRestore(PLATFORM_ADMIN, id, "Đã xác minh tác giả có bản quyền");
    expect(restored).toMatchObject({ status: "ACTIVE", hiddenReason: null, hiddenBy: null, hiddenAt: null });
    expect((await h.listService.list(STRANGER, { scope: "public", limit: 30 })).data).toHaveLength(1);
    expect(h.audit.record).toHaveBeenLastCalledWith(expect.objectContaining({ action: "study-set.restore" }));
    await expect(h.moderation.adminRestore(PLATFORM_ADMIN, id, "Khôi phục lần hai")).rejects.toMatchObject({ statusCode: 404 }); // không còn HIDDEN
  });

  it("admin nền tảng chỉ ẩn/khôi phục bộ PUBLIC (WORKSPACE → 403); PRIVATE và đã xoá → 404; ẩn hai lần → 409 STUDY_004", async () => {
    const ws = await seedSet(h, { visibility: "WORKSPACE" });
    await expect(h.moderation.adminHide(PLATFORM_ADMIN, ws.id, "Vi phạm quy định nhóm")).rejects.toMatchObject({ statusCode: 403 });
    const priv = await seedSet(h);
    await expect(h.moderation.adminGet(priv.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.moderation.adminHide(PLATFORM_ADMIN, priv.id, "Vi phạm quy định nền tảng")).rejects.toMatchObject({ statusCode: 404 });
    const pub = await seedSet(h, { visibility: "PUBLIC" });
    await h.moderation.adminHide(PLATFORM_ADMIN, pub.id, "Vi phạm bản quyền giáo trình");
    await expect(h.moderation.adminHide(PLATFORM_ADMIN, pub.id, "Ẩn lại lần hai lần hai")).rejects.toMatchObject({ errorCode: "STUDY_004" });
    await h.setService.remove(AUTHOR, pub.id);
    await expect(h.moderation.adminGet(pub.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("adminGet: metadata + reportedCount + canViewContent (chỉ PUBLIC); WORKSPACE chỉ thông tin chung; adminItems chỉ PUBLIC, có phân trang", async () => {
    const pub = await seedSet(h, { visibility: "PUBLIC" });
    await h.bulk.save(AUTHOR, pub.id, { expectedVersion: pub.version, upsert: [flash("a"), flash("b"), flash("c")], delete: [] });
    await h.sets.setReportedCount(pub.id, 3);
    expect(await h.moderation.adminGet(pub.id)).toMatchObject({ visibility: "PUBLIC", reportedCount: 3, canViewContent: true, itemCount: 3 });
    const page = await h.moderation.adminItems(pub.id, { page: 1, limit: 2 });
    expect(page.data).toHaveLength(2);
    expect(page.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2, hasNext: true, hasPrev: false });
    expect((await h.moderation.adminItems(pub.id, { page: 2, limit: 2 })).data).toHaveLength(1);

    const ws = await seedSet(h, { visibility: "WORKSPACE" });
    expect(await h.moderation.adminGet(ws.id)).toMatchObject({ visibility: "WORKSPACE", canViewContent: false });
    await expect(h.moderation.adminItems(ws.id, { page: 1, limit: 50 })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("adminItems: kèm thumbnail ký của ảnh mặt trước/sau + ảnh lựa chọn (null khi không có ảnh); một lượt ký cho cả trang; chỉ bộ PUBLIC", async () => {
    const pub = await seedSet(h, { visibility: "PUBLIC" });
    const [front, back, optionImg] = [h.readyAsset(AUTHOR), h.readyAsset(AUTHOR), h.readyAsset(AUTHOR)];
    await h.bulk.save(AUTHOR, pub.id, {
      expectedVersion: pub.version,
      upsert: [flash("a", { frontMediaAssetId: front, backMediaAssetId: back }), flash("b"), mc("c", { options: [{ text: "A", mediaAssetId: optionImg }, { text: "B" }, { text: "C" }] })],
      delete: [],
    } as never);
    const sign = jest.spyOn(h.assets, "signThumbnails");

    const { data } = await h.moderation.adminItems(pub.id, { page: 1, limit: 50 });
    const byPrompt = (key: string) => data.find((i) => i.prompt.endsWith(` ${key}`))!;
    expect(sign).toHaveBeenCalledTimes(1);
    expect(byPrompt("a")).toMatchObject({ frontMediaThumbUrl: `https://thumb.test/${front}`, backMediaThumbUrl: `https://thumb.test/${back}` });
    expect(byPrompt("b")).toMatchObject({ frontMediaThumbUrl: null, backMediaThumbUrl: null });
    expect(byPrompt("c").options.map((o) => o.mediaThumbUrl)).toEqual([`https://thumb.test/${optionImg}`, null, null]);
  });

  it("OWNER/ADMIN nhóm ẩn bộ WORKSPACE (audit + đóng báo cáo mức SCOPE) rồi khôi phục; MEMBER/tác giả không ẩn được", async () => {
    const { id } = await seedSet(h, { visibility: "WORKSPACE" });
    await expect(h.moderation.hide(MEMBER, id, "Nội dung vi phạm quy định nhóm")).rejects.toMatchObject({ statusCode: 403 });
    await expect(h.moderation.hide(AUTHOR, id, "Nội dung vi phạm quy định nhóm")).rejects.toMatchObject({ statusCode: 403 });
    await expect(h.moderation.hide(STRANGER, id, "Nội dung vi phạm quy định nhóm")).rejects.toMatchObject({ statusCode: 404 });

    const hidden = await h.moderation.hide(ADMIN, id, "Nội dung vi phạm quy định nhóm");
    expect(hidden).toMatchObject({ status: "HIDDEN", hiddenReason: "Nội dung vi phạm quy định nhóm" });
    expect(hidden.myPermissions).toMatchObject({ unhide: true, hide: false });
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "study-set.hide", workspaceId: WS, metadata: expect.objectContaining({ level: "SCOPE" }) }));
    expect(h.reports.closed).toEqual([{ targetId: id, resolution: "CONTENT_REMOVED", level: "SCOPE" }]);

    await expect(h.moderation.unhide(MEMBER, id, "Khôi phục theo yêu cầu")).rejects.toMatchObject({ statusCode: 404 }); // MEMBER không thấy bộ ẩn
    const restored = await h.moderation.unhide(OWNER, id, "Đã sửa nội dung, cho phép lại");
    expect(restored.status).toBe("ACTIVE");
    expect(h.audit.record).toHaveBeenLastCalledWith(expect.objectContaining({ action: "study-set.unhide" }));
  });

  describe("báo cáo", () => {
    it("người xem được (không phải tác giả) báo cáo qua p1-08; báo cáo lặp → alreadyReported (1 báo cáo/người/bộ)", async () => {
      const { id } = await seedSet(h, { visibility: "PUBLIC" });
      const first = await h.reportService.report(STRANGER, id, { reason: "COPYRIGHT", description: "Sao chép giáo trình" });
      expect(first.alreadyReported).toBe(false);
      const again = await h.reportService.report(STRANGER, id, { reason: "SPAM" });
      expect(again.alreadyReported).toBe(true);
      expect(h.reports.submitted).toEqual([{ targetType: "STUDY_SET", targetId: id, reason: "COPYRIGHT", description: "Sao chép giáo trình", reporterId: STRANGER.id }]);
    });

    it("tác giả tự báo cáo → 403; PRIVATE/đã ẩn/GUEST của WORKSPACE → 404 (không lộ sự tồn tại)", async () => {
      const pub = await seedSet(h, { visibility: "PUBLIC" });
      await expect(h.reportService.report(AUTHOR, pub.id, { reason: "SPAM" })).rejects.toMatchObject({ statusCode: 403 });
      const priv = await seedSet(h);
      await expect(h.reportService.report(STRANGER, priv.id, { reason: "SPAM" })).rejects.toMatchObject({ statusCode: 404 });
      const ws = await seedSet(h, { visibility: "WORKSPACE" });
      await expect(h.reportService.report(GUEST, ws.id, { reason: "SPAM" })).rejects.toMatchObject({ statusCode: 404 });
      expect((await h.reportService.report(MEMBER, ws.id, { reason: "WRONG_CONTENT" })).alreadyReported).toBe(false); // MEMBER/OWNER/ADMIN nhóm được báo cáo
      await h.moderation.adminHide(PLATFORM_ADMIN, pub.id, "Vi phạm bản quyền giáo trình");
      await expect(h.reportService.report(STRANGER, pub.id, { reason: "SPAM" })).rejects.toMatchObject({ statusCode: 404 });
    });

    it("đích báo cáo (điểm cắm của moderation): PUBLIC → PLATFORM_ONLY; WORKSPACE → SCOPE kèm workspaceId; tự báo cáo → SELF; không thấy → NOT_FOUND", async () => {
      const pub = await seedSet(h, { visibility: "PUBLIC" });
      const ws = await seedSet(h, { visibility: "WORKSPACE" });
      expect(await h.reportTarget.resolve(STRANGER, pub.id)).toMatchObject({ targetType: "STUDY_SET", groupKey: `STUDY_SET:${pub.id}`, handlerLevel: "PLATFORM_ONLY", workspaceId: null, targetAuthorId: AUTHOR.id, scopeType: null });
      expect(await h.reportTarget.resolve(MEMBER, ws.id)).toMatchObject({ handlerLevel: "SCOPE", workspaceId: WS });
      expect(await h.reportTarget.resolve(AUTHOR, pub.id)).toBe("SELF");
      expect(await h.reportTarget.resolve(STRANGER, ws.id)).toBe("NOT_FOUND");
      expect(await h.reportTarget.resolve(STRANGER, "0000000000000000000000ff")).toBe("NOT_FOUND");
    });

    it("onReportCreated đặt reportedCount TUYỆT ĐỐI (job retry không cộng dồn)", async () => {
      const { id } = await seedSet(h, { visibility: "PUBLIC" });
      await h.reportTarget.onReportCreated({ targetId: id, openCount: 2 });
      await h.reportTarget.onReportCreated({ targetId: id, openCount: 2 });
      expect((await h.sets.findById(id))!.reportedCount).toBe(2);
    });
  });

  describe("StudyContentReader — cổng đọc cho p5-01", () => {
    it("chỉ trả bộ/mục khi canView; liệt kê mục chấm được theo thứ tự", async () => {
      const src = await seedRichSet(h, "WORKSPACE");
      expect((await h.content.getViewableSet(MEMBER, src.id)).id).toBe(src.id);
      await expect(h.content.getViewableSet(STRANGER, src.id)).rejects.toMatchObject({ statusCode: 404 });
      const gradable = await h.content.listGradableItems(MEMBER, src.id);
      expect(gradable.map((i) => i.type)).toEqual(["MULTIPLE_CHOICE"]);
      await h.moderation.hide(OWNER, src.id, "Vi phạm quy định của nhóm");
      await expect(h.content.listGradableItems(MEMBER, src.id)).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
