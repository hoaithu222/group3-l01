import { LIMITS } from "../../../core/constants/limits";
import { AUTHOR, MEMBER, STRANGER, flash, makeHarness, mc, seedSet, type Harness } from "./support/harness";

async function save(h: Harness, setId: string, version: number, upsert: unknown[], del: string[] = []) {
  return h.bulk.save(AUTHOR, setId, { expectedVersion: version, upsert, delete: del });
}

const itemsOf = async (h: Harness, setId: string) => h.items.listBySet(setId);

describe("study-item-bulk.service — PUT items (in-memory)", () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it("tạo mục mới: trả version+1, itemCount, idMap khớp clientItemKey; bộ cập nhật itemCount/mask", async () => {
    const { id, version } = await seedSet(h);
    const r = await save(h, id, version, [flash("k1"), mc("k2"), { type: "TRUE_FALSE", clientItemKey: "k3", prompt: "p", correct: true }]);
    expect(r.version).toBe(version + 1);
    expect(r.itemCount).toBe(3);
    expect(r.idMap.map((m) => m.clientItemKey)).toEqual(["k1", "k2", "k3"]);
    const stored = await itemsOf(h, id);
    expect(stored.map((i) => i.id)).toEqual(r.idMap.map((m) => m.id)); // thứ tự = thứ tự gửi
    const set = await h.sets.findById(id);
    expect(set).toMatchObject({ itemCount: 3, version: version + 1 });
    expect(set!.itemTypesMask).toBe(1 | 2 | 8);
  });

  it("ST-03: 100 mục, mục thứ 99 (index 98) có đáp án ngoài lựa chọn → 400 STUDY_001 details[0].index=98, KHÔNG ghi gì", async () => {
    const { id, version } = await seedSet(h);
    const rows: unknown[] = Array.from({ length: 100 }, (_, i) => flash(`k${i}`));
    rows[98] = mc("k98", { correctOptionIndex: 7 });
    const writesBefore = h.items.writes;
    await expect(save(h, id, version, rows)).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "STUDY_001",
      details: [{ index: 98, clientItemKey: "k98", field: "correctOptionIndex", code: "STUDY_005" }],
    });
    expect(h.items.writes).toBe(writesBefore);
    expect(await itemsOf(h, id)).toHaveLength(0);
    expect((await h.sets.findById(id))!.version).toBe(version); // phiên bản KHÔNG tăng
  });

  it("ST-25: hai phiên soạn lưu với cùng expectedVersion → một thành công, một 409 RES_003 (details.currentVersion)", async () => {
    const { id, version } = await seedSet(h);
    await save(h, id, version, [flash("a")]);
    await expect(save(h, id, version, [flash("b")])).rejects.toMatchObject({ statusCode: 409, errorCode: "RES_003", details: { currentVersion: version + 1 } });
    expect(await itemsOf(h, id)).toHaveLength(1); // thay đổi của phiên thua KHÔNG được ghi
  });

  it("lưu rỗng (không upsert/delete) là no-op: không tăng phiên bản", async () => {
    const { id, version } = await seedSet(h);
    expect(await save(h, id, version, [])).toEqual({ version, itemCount: 0, idMap: [] });
    expect((await h.sets.findById(id))!.version).toBe(version);
  });

  describe("sửa và xoá", () => {
    it("sửa mục cũ theo id: ghi ĐÈ nội dung, giữ id + order; version mục +1", async () => {
      const { id, version } = await seedSet(h);
      const first = await save(h, id, version, [flash("a"), flash("b")]);
      const [a, b] = first.idMap;
      const before = await h.items.findById(a!.id);
      await save(h, id, first.version, [mc("a", { id: a!.id, prompt: "Đã đổi" })]);
      const after = await h.items.findById(a!.id);
      expect(after).toMatchObject({ type: "MULTIPLE_CHOICE", prompt: "Đã đổi", answerText: null, order: before!.order, version: before!.version + 1 });
      expect(after!.correctOptionIds).toHaveLength(1);
      expect((await itemsOf(h, id)).map((i) => i.id)).toEqual([a!.id, b!.id]);
    });

    it("xoá + sửa + thêm trong CÙNG một lượt; mục bị xoá biến mất, itemCount/mask tính lại", async () => {
      const { id, version } = await seedSet(h);
      const first = await save(h, id, version, [mc("a"), flash("b"), flash("c")]);
      const [a, b, c] = first.idMap;
      const r = await save(h, id, first.version, [flash("b", { id: b!.id, prompt: "b2" }), flash("d")], [a!.id, c!.id]);
      expect(r.itemCount).toBe(2);
      const stored = await itemsOf(h, id);
      expect(stored.map((i) => i.prompt)).toEqual(["b2", "Mặt trước d"]);
      expect((await h.sets.findById(id))!.itemTypesMask).toBe(1); // không còn câu trắc nghiệm
    });

    it("xoá id không thuộc bộ bị bỏ qua êm; không xoá được mục của bộ khác", async () => {
      const one = await seedSet(h);
      const two = await seedSet(h, { title: "Bộ khác" });
      const other = await save(h, two.id, two.version, [flash("x")]);
      const r = await save(h, one.id, one.version, [flash("a")], [other.idMap[0]!.id]);
      expect(r.itemCount).toBe(1);
      expect(await itemsOf(h, two.id)).toHaveLength(1);
    });
  });

  describe("thứ tự tương đối", () => {
    it("afterClientItemKey: chèn giữa, lên đầu, sau mục cũ theo id; mục không nêu vị trí xuống cuối", async () => {
      const { id, version } = await seedSet(h);
      const first = await save(h, id, version, [flash("a"), flash("b")]);
      const [a, b] = first.idMap;
      await save(h, id, first.version, [
        flash("mid", { afterClientItemKey: a!.id }),
        flash("top", { afterClientItemKey: null }),
        flash("end"),
        flash("after-mid", { afterClientItemKey: "mid" }),
      ]);
      const prompts = (await itemsOf(h, id)).map((i) => i.prompt);
      expect(prompts).toEqual(["Mặt trước top", "Mặt trước a", "Mặt trước mid", "Mặt trước after-mid", "Mặt trước b", "Mặt trước end"]);
      expect((await itemsOf(h, id)).map((i) => i.id)).toContain(b!.id);
    });

    it("dời mục cũ bằng afterClientItemKey", async () => {
      const { id, version } = await seedSet(h);
      const first = await save(h, id, version, [flash("a"), flash("b"), flash("c")]);
      const [a, , c] = first.idMap;
      await save(h, id, first.version, [flash("a", { id: a!.id, afterClientItemKey: c!.id })]);
      expect((await itemsOf(h, id)).map((i) => i.prompt)).toEqual(["Mặt trước b", "Mặt trước c", "Mặt trước a"]);
    });
  });

  describe("giới hạn số mục — STUDY_002", () => {
    it(`đủ ${LIMITS.study.itemsPerSetMax} mục là được; thêm mục thứ ${LIMITS.study.itemsPerSetMax + 1} → 409 STUDY_002`, async () => {
      const { id, version } = await seedSet(h);
      const max = LIMITS.study.itemsPerSetMax;
      const first = await save(h, id, version, Array.from({ length: max }, (_, i) => flash(`k${i}`)));
      expect(first.itemCount).toBe(max);
      await expect(save(h, id, first.version, [flash("extra")])).rejects.toMatchObject({ statusCode: 409, errorCode: "STUDY_002" });
      // xoá 1 và thêm 1 trong cùng lượt → vẫn đúng 500, được phép
      const r = await save(h, id, first.version, [flash("swap")], [first.idMap[0]!.id]);
      expect(r.itemCount).toBe(max);
    });

    it("quá bulkOpsMax phần tử do middleware Zod chặn ở tầng DTO (VAL_001), không phải service", async () => {
      const { putItemsSchema } = await import("../dtos");
      expect(putItemsSchema.safeParse({ expectedVersion: 1, upsert: new Array(LIMITS.study.bulkOpsMax + 1).fill({}) }).success).toBe(false);
    });
  });

  describe("asset — gắn/gỡ AssetLink theo mục", () => {
    it("mục mới có ảnh/âm thanh: gắn STUDY_ITEM; sửa bỏ ảnh → gỡ; xoá mục → gỡ hết", async () => {
      const { id, version } = await seedSet(h);
      const img = h.readyAsset(AUTHOR, "IMAGE");
      const aud = h.readyAsset(AUTHOR, "AUDIO");
      const first = await save(h, id, version, [flash("a", { frontMediaAssetId: img, audioAssetId: aud })]);
      const itemId = first.idMap[0]!.id;
      expect(h.assets.linksOf("STUDY_ITEM", itemId).sort()).toEqual([img, aud].sort());

      const second = await save(h, id, first.version, [flash("a", { id: itemId, audioAssetId: aud })]);
      expect(h.assets.linksOf("STUDY_ITEM", itemId)).toEqual([aud]);

      await save(h, id, second.version, [], [itemId]);
      expect(h.assets.linksOf("STUDY_ITEM", itemId)).toEqual([]);
    });

    it("ảnh của lựa chọn được gắn; STUDY_006 khi ảnh của người khác hoặc chưa READY — và KHÔNG ghi gì", async () => {
      const { id, version } = await seedSet(h);
      const mine = h.readyAsset(AUTHOR);
      const foreign = h.readyAsset(MEMBER);
      const ok = await save(h, id, version, [mc("a", { options: [{ text: "A", mediaAssetId: mine }, { text: "B" }] })]);
      expect(h.assets.linksOf("STUDY_ITEM", ok.idMap[0]!.id)).toEqual([mine]);

      const writes = h.items.writes;
      await expect(save(h, id, ok.version, [flash("b", { frontMediaAssetId: foreign })])).rejects.toMatchObject({
        errorCode: "STUDY_001",
        details: [{ index: 0, field: "frontMediaAssetId", code: "STUDY_006" }],
      });
      expect(h.items.writes).toBe(writes);
    });

    it("không đánh cắp asset đang gắn ở mục khác của cùng bộ", async () => {
      const { id, version } = await seedSet(h);
      const img = h.readyAsset(AUTHOR);
      const first = await save(h, id, version, [flash("a", { frontMediaAssetId: img })]);
      await expect(save(h, id, first.version, [flash("b", { frontMediaAssetId: img })])).rejects.toMatchObject({
        errorCode: "STUDY_001",
        details: [{ index: 0, field: "frontMediaAssetId", code: "STUDY_006" }],
      });
    });
  });

  describe("quyền", () => {
    it("người không thấy bộ → 404; thành viên nhóm thấy bộ WORKSPACE nhưng không sửa → 403; bộ đã ẩn → STUDY_004", async () => {
      const priv = await seedSet(h);
      await expect(h.bulk.save(STRANGER, priv.id, { expectedVersion: 1, upsert: [flash("a")], delete: [] })).rejects.toMatchObject({ statusCode: 404 });

      const ws = await seedSet(h, { visibility: "WORKSPACE" });
      await expect(h.bulk.save(MEMBER, ws.id, { expectedVersion: 1, upsert: [flash("a")], delete: [] })).rejects.toMatchObject({ statusCode: 403 });

      await h.sets.updateIf(priv.id, {}, { status: "HIDDEN" });
      await expect(h.bulk.save(AUTHOR, priv.id, { expectedVersion: 2, upsert: [flash("a")], delete: [] })).rejects.toMatchObject({ errorCode: "STUDY_004" });
    });

    it("bộ không tồn tại → 404 trung tính", async () => {
      await expect(h.bulk.save(AUTHOR, "0000000000000000000000ff", { expectedVersion: 1, upsert: [flash("a")], delete: [] })).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
