/**
 * Số liệu học tập chỉ đọc cho admin (p4-01 admin.md §1): `GET /admin/study-sets` (tab content — bộ PUBLIC ≥ N báo cáo) và
 * `GET /admin/users/:id/study-summary` (tab "Học tập" của user — chỉ số liệu).
 */
import { LIMITS } from "../../../core/constants/limits";
import { adminReportedSetsQuerySchema } from "../dtos";
import type { StudySetCreateInput } from "../entities/study-set.interface";
import { StudyAdminOverviewService } from "../services/study-admin-overview.service";
import { AUTHOR, MEMBER, WS, makeHarness, type Harness } from "./support/harness";

const base = (over: Partial<StudySetCreateInput> = {}): StudySetCreateInput => ({
  id: "",
  ownerId: AUTHOR.id,
  workspaceId: null,
  title: "Bộ",
  normalizedTitle: "bo",
  description: null,
  tags: [],
  coverAssetId: null,
  language: null,
  visibility: "PUBLIC",
  itemCount: 3,
  itemTypesMask: 1,
  copiedFromId: null,
  ...over,
});

let seq = 0;
async function seed(h: Harness, over: Partial<StudySetCreateInput> & { reported?: number; hidden?: boolean; deleted?: boolean } = {}) {
  seq += 1;
  const { reported, hidden, deleted, ...input } = over;
  const set = await h.sets.create(base({ id: seq.toString(16).padStart(24, "0"), title: `Bộ ${seq}`, normalizedTitle: `bo ${seq}`, ...input }));
  if (reported !== undefined) await h.sets.setReportedCount(set.id, reported);
  if (hidden) await h.sets.updateIf(set.id, {}, { status: "HIDDEN", hiddenReason: "vi phạm", hiddenBy: "0000000000000000000000ff", hiddenAt: new Date() });
  if (deleted) await h.sets.updateIf(set.id, {}, { status: "DELETED", deletedAt: new Date() });
  return set;
}

function service(h: Harness) {
  return new StudyAdminOverviewService({ sets: h.sets, assets: h.assets, users: h.users });
}

describe("adminReportedSetsQuerySchema", () => {
  it("mặc định ngưỡng = LIMITS.study.reportedPriorityThreshold (5), page 1, limit 20; ép kiểu từ query string", () => {
    expect(LIMITS.study.reportedPriorityThreshold).toBe(5);
    expect(adminReportedSetsQuerySchema.parse({})).toEqual({ minReports: 5, page: 1, limit: 20 });
    expect(adminReportedSetsQuerySchema.parse({ minReports: "3", status: "HIDDEN", page: "2", limit: "50" })).toEqual({ minReports: 3, status: "HIDDEN", page: 2, limit: 50 });
  });

  it("từ chối ngưỡng < 1, limit > 50, status lạ (kể cả DELETED)", () => {
    for (const bad of [{ minReports: 0 }, { limit: 51 }, { page: 0 }, { status: "DELETED" }, { status: "PRIVATE" }]) {
      expect(adminReportedSetsQuerySchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("StudyAdminOverviewService.listReported — tab content", () => {
  it("chỉ bộ PUBLIC chưa xoá có ≥ ngưỡng báo cáo; sắp reportedCount giảm dần; WORKSPACE/PRIVATE/đã xoá không bao giờ có mặt", async () => {
    const h = makeHarness();
    const low = await seed(h, { reported: 4 });
    const five = await seed(h, { reported: 5 });
    const nine = await seed(h, { reported: 9, hidden: true });
    await seed(h, { reported: 30, visibility: "WORKSPACE", workspaceId: WS });
    await seed(h, { reported: 30, visibility: "PRIVATE" });
    await seed(h, { reported: 30, deleted: true });

    const page = await service(h).listReported({ minReports: 5, page: 1, limit: 20 });
    expect(page.data.map((s) => s.id)).toEqual([nine.id, five.id]);
    expect(page.data.map((s) => s.reportedCount)).toEqual([9, 5]);
    expect(page.data[0]).toMatchObject({ status: "HIDDEN", hiddenReason: "vi phạm", visibility: "PUBLIC", canViewContent: true });
    expect(page.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false, hasPrev: false });
    expect(page.data.map((s) => s.id)).not.toContain(low.id);
  });

  it("hạ ngưỡng → thêm bộ; lọc status ACTIVE/HIDDEN", async () => {
    const h = makeHarness();
    await seed(h, { reported: 2 });
    const hidden = await seed(h, { reported: 3, hidden: true });
    expect((await service(h).listReported({ minReports: 2, page: 1, limit: 20 })).meta.total).toBe(2);
    expect((await service(h).listReported({ minReports: 2, status: "ACTIVE", page: 1, limit: 20 })).meta.total).toBe(1);
    expect((await service(h).listReported({ minReports: 2, status: "HIDDEN", page: 1, limit: 20 })).data.map((s) => s.id)).toEqual([hidden.id]);
  });

  it("phân trang: total là tổng đã lọc, các trang không trùng, hasNext/hasPrev đúng", async () => {
    const h = makeHarness();
    for (let i = 0; i < 5; i += 1) await seed(h, { reported: 10 + i });
    const p1 = await service(h).listReported({ minReports: 5, page: 1, limit: 2 });
    const p2 = await service(h).listReported({ minReports: 5, page: 2, limit: 2 });
    const p3 = await service(h).listReported({ minReports: 5, page: 3, limit: 2 });
    expect([p1, p2, p3].map((p) => p.data.length)).toEqual([2, 2, 1]);
    expect(p1.meta).toMatchObject({ total: 5, totalPages: 3, hasNext: true, hasPrev: false });
    expect(p3.meta).toMatchObject({ hasNext: false, hasPrev: true });
    const ids = [p1, p2, p3].flatMap((p) => p.data.map((s) => s.id));
    expect(new Set(ids).size).toBe(5);
    expect([p1, p2, p3].flatMap((p) => p.data.map((s) => s.reportedCount))).toEqual([14, 13, 12, 11, 10]);
  });

  it("DTO có tên tác giả nhưng KHÔNG có nội dung mục/đáp án", async () => {
    const h = makeHarness();
    await seed(h, { reported: 6 });
    const [dto] = (await service(h).listReported({ minReports: 5, page: 1, limit: 20 })).data;
    expect(dto).toMatchObject({ ownerId: AUTHOR.id, owner: { id: AUTHOR.id }, itemCount: 3 });
    expect(Object.keys(dto!)).not.toEqual(expect.arrayContaining(["items", "correctOptionIds", "acceptedAnswers"]));
  });
});

describe("StudyAdminOverviewService.userSummary — tab Học tập của user", () => {
  it("đếm theo phạm vi + số bị ẩn, không tính bộ đã xoá; chỉ số, không tiêu đề", async () => {
    const h = makeHarness();
    await seed(h, { visibility: "PUBLIC" });
    await seed(h, { visibility: "PUBLIC", hidden: true });
    await seed(h, { visibility: "WORKSPACE", workspaceId: WS });
    await seed(h, { visibility: "PRIVATE" });
    await seed(h, { visibility: "PRIVATE" });
    await seed(h, { visibility: "PUBLIC", deleted: true });
    await seed(h, { ownerId: MEMBER.id, visibility: "PUBLIC" });

    const summary = await service(h).userSummary(AUTHOR.id);
    expect(summary).toEqual({ userId: AUTHOR.id, total: 5, public: 2, workspace: 1, private: 2, hidden: 1 });
    expect(JSON.stringify(summary)).not.toContain("Bộ ");
    expect(await service(h).userSummary(MEMBER.id)).toEqual({ userId: MEMBER.id, total: 1, public: 1, workspace: 0, private: 0, hidden: 0 });
  });

  it("người chưa có bộ nào → toàn 0; người không tồn tại → 404", async () => {
    const h = makeHarness();
    h.users.users.set("0000000000000000000000b1", { id: "0000000000000000000000b1", name: "Chưa học" });
    expect(await service(h).userSummary("0000000000000000000000b1")).toEqual({ userId: "0000000000000000000000b1", total: 0, public: 0, workspace: 0, private: 0, hidden: 0 });
    await expect(service(h).userSummary("0000000000000000000000c9")).rejects.toMatchObject({ statusCode: 404 });
  });
});
