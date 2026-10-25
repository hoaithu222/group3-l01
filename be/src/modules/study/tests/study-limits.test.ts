/**
 * `limits.study` (p4-01 admin.md §2.2) — service `study` đọc TRẦN HIỆU LỰC (`LIMITS.study` ⊕ override `SystemConfig`) qua `runtimeConfig` thay vì hằng cứng:
 * số mục/bộ (`STUDY_002`), số bộ/người (`STUDY_007`, cả tạo lẫn nhân bản), số lựa chọn/câu (`STUDY_001` `details[].code = TOO_MANY`).
 */
import { runtimeConfig } from "../../../core/config/runtime-config";
import { LIMITS } from "../../../core/constants/limits";
import { InMemoryTxRunner } from "../repositories/tx";
import { readStudyLimits, type StudyLimitsReader } from "../services/study-limits";
import { StudyItemBulkService } from "../services/study-item-bulk.service";
import { StudySetDuplicateService } from "../services/study-set-duplicate.service";
import { StudySetService } from "../services/study-set.service";
import { AUTHOR, flash, makeHarness, mc, STRANGER, type Harness } from "./support/harness";

const HARD = { itemsPerSetMax: LIMITS.study.itemsPerSetMax, setsPerUserMax: LIMITS.study.setsPerUserMax, optionsMax: LIMITS.study.optionsMax };

function services(h: Harness, limits: StudyLimitsReader) {
  const deps = { sets: h.sets, items: h.items, tx: new InMemoryTxRunner(), assets: h.assets, access: h.access, roles: h.roles, users: h.users, outbox: h.outbox, limits };
  return { sets: new StudySetService(deps), bulk: new StudyItemBulkService(deps), duplicates: new StudySetDuplicateService(deps) };
}

describe("readStudyLimits — đọc qua runtimeConfig", () => {
  it("không override → trần cứng của LIMITS.study", async () => {
    jest.spyOn(runtimeConfig, "getEffective").mockResolvedValue({ ...HARD });
    await expect(readStudyLimits()).resolves.toEqual(HARD);
  });

  it("override của admin (thấp hơn trần cứng) được dùng; giá trị không phải số bị bỏ qua (dùng trần cứng)", async () => {
    jest.spyOn(runtimeConfig, "getEffective").mockResolvedValue({ itemsPerSetMax: 40, setsPerUserMax: "x", optionsMax: 4 });
    await expect(readStudyLimits()).resolves.toEqual({ itemsPerSetMax: 40, setsPerUserMax: HARD.setsPerUserMax, optionsMax: 4 });
  });

  it("đọc cấu hình lỗi → trần cứng (không làm hỏng nghiệp vụ)", async () => {
    jest.spyOn(runtimeConfig, "getEffective").mockRejectedValue(new Error("redis down"));
    await expect(readStudyLimits()).resolves.toEqual(HARD);
  });

  it("hỏi đúng khoá limits.study", async () => {
    const spy = jest.spyOn(runtimeConfig, "getEffective").mockResolvedValue({});
    await readStudyLimits();
    expect(spy).toHaveBeenCalledWith("limits.study");
  });
});

describe("service study áp trần runtime (thấp hơn trần cứng)", () => {
  it("itemsPerSetMax = 3: đủ 3 mục được, mục thứ 4 → 409 STUDY_002 với max = 3; xoá 1 thêm 1 vẫn được", async () => {
    const h = makeHarness();
    const s = services(h, () => Promise.resolve({ ...HARD, itemsPerSetMax: 3 }));
    const set = await s.sets.create(AUTHOR, { title: "Bộ nhỏ", tags: [], visibility: "PRIVATE" });
    const first = await s.bulk.save(AUTHOR, set.id, { expectedVersion: set.version, upsert: [flash("a"), flash("b"), flash("c")], delete: [] });
    expect(first.itemCount).toBe(3);
    await expect(s.bulk.save(AUTHOR, set.id, { expectedVersion: first.version, upsert: [flash("d")], delete: [] })).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "STUDY_002",
      details: { max: 3 },
    });
    const swapped = await s.bulk.save(AUTHOR, set.id, { expectedVersion: first.version, upsert: [flash("d")], delete: [first.idMap[0]!.id] });
    expect(swapped.itemCount).toBe(3);
  });

  it("optionsMax = 3: câu 4 lựa chọn → 400 STUDY_001 (details[].code TOO_MANY, đúng index); 3 lựa chọn vẫn lưu được và không ghi gì khi có lỗi", async () => {
    const h = makeHarness();
    const s = services(h, () => Promise.resolve({ ...HARD, optionsMax: 3 }));
    const set = await s.sets.create(AUTHOR, { title: "Trắc nghiệm", tags: [], visibility: "PRIVATE" });
    const four = mc("bon", { options: [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }] });
    await expect(s.bulk.save(AUTHOR, set.id, { expectedVersion: set.version, upsert: [flash("ok"), four], delete: [] })).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "STUDY_001",
      details: [{ index: 1, clientItemKey: "bon", field: "options", code: "TOO_MANY" }],
    });
    expect(await h.items.listBySet(set.id)).toHaveLength(0);
    const saved = await s.bulk.save(AUTHOR, set.id, { expectedVersion: set.version, upsert: [mc("ba")], delete: [] });
    expect(saved.itemCount).toBe(1);
  });

  it("optionsMax = 6 (mặc định) không chặn câu 6 lựa chọn", async () => {
    const h = makeHarness();
    const s = services(h, () => Promise.resolve({ ...HARD }));
    const set = await s.sets.create(AUTHOR, { title: "Sáu", tags: [], visibility: "PRIVATE" });
    const six = mc("sau", { options: ["A", "B", "C", "D", "E", "F"].map((text) => ({ text })), correctOptionIndex: 0 });
    await expect(s.bulk.save(AUTHOR, set.id, { expectedVersion: set.version, upsert: [six], delete: [] })).resolves.toMatchObject({ itemCount: 1 });
  });

  it("setsPerUserMax = 1: bộ thứ hai → 409 STUDY_007 (max = 1); nhân bản của người đã có 1 bộ cũng vậy", async () => {
    const h = makeHarness();
    const s = services(h, () => Promise.resolve({ ...HARD, setsPerUserMax: 1 }));
    const a = await s.sets.create(AUTHOR, { title: "Bộ đầu", tags: [], visibility: "PRIVATE" });
    await expect(s.sets.create(AUTHOR, { title: "Bộ thứ hai", tags: [], visibility: "PRIVATE" })).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "STUDY_007",
      details: { max: 1 },
    });
    // Một bộ PUBLIC của AUTHOR; STRANGER đã có 1 bộ riêng → nhân bản bị chặn bởi trần hạ.
    const pub = await h.setService.create(AUTHOR, { title: "Công khai", tags: [], visibility: "PUBLIC", confirmPublic: true });
    await s.sets.create(STRANGER, { title: "Bộ của người lạ", tags: [], visibility: "PRIVATE" });
    await expect(s.duplicates.duplicate(STRANGER, pub.id, { targetVisibility: "PRIVATE" })).rejects.toMatchObject({ errorCode: "STUDY_007", details: { max: 1 } });
    expect(a.id).toBeDefined();
  });
});
