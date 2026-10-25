import { LIMITS } from "../../../core/constants/limits";
import { newObjectId } from "../../../core/utils/object-id";
import { buildHarness, seedUser, seedWorkspace, stats, tinyPng, type Harness } from "./support/harness";

/** CR-04 (thêm dự án), PORT_004/005/006, sửa/ẩn/sắp xếp/làm mới, quyền sở hữu. */
let h: Harness;
let me: string;
const other = newObjectId();

beforeEach(() => {
  h = buildHarness();
  me = seedUser(h, "Nguyễn Văn An").id;
  seedUser(h, "Người khác");
});

describe("eligibleWorkspaces", () => {
  it("liệt kê nhóm có thẻ hoàn thành được tính (kể cả đã lưu trữ/đã rời), sắp theo số task giảm dần, đánh dấu đã thêm", async () => {
    const a = seedWorkspace(h, me, "Nhóm A", { stats: { tasksDone: 12 } });
    const b = seedWorkspace(h, me, "Nhóm B", { stats: { tasksDone: 40 }, archived: true });
    const c = seedWorkspace(h, me, "Nhóm C", { stats: { tasksDone: 5 }, member: false });
    await h.c.projectService.add(me, a);
    const page = await h.c.projectService.eligibleWorkspaces(me, undefined, 10);
    expect(page.items.map((i) => i.workspaceId)).toEqual([b, a, c]);
    expect(page.items).toEqual([
      { workspaceId: b, name: "Nhóm B", archived: true, left: false, myTasksDone: 40, alreadyAdded: false },
      { workspaceId: a, name: "Nhóm A", archived: false, left: false, myTasksDone: 12, alreadyAdded: true },
      { workspaceId: c, name: "Nhóm C", archived: false, left: true, myTasksDone: 5, alreadyAdded: false },
    ]);
    expect(page.hasMore).toBe(false);
  });

  it("phân trang bằng cursor", async () => {
    for (let i = 0; i < 5; i += 1) seedWorkspace(h, me, `Nhóm ${i}`, { stats: { tasksDone: 10 + i } });
    const first = await h.c.projectService.eligibleWorkspaces(me, undefined, 2);
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    const second = await h.c.projectService.eligibleWorkspaces(me, first.nextCursor ?? undefined, 2);
    const third = await h.c.projectService.eligibleWorkspaces(me, second.nextCursor ?? undefined, 2);
    expect([...first.items, ...second.items, ...third.items]).toHaveLength(5);
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();
  });

  it("người chưa có thẻ nào → danh sách rỗng", async () => {
    expect((await h.c.projectService.eligibleWorkspaces(me, undefined, 10)).items).toEqual([]);
  });
});

describe("add", () => {
  it("CR-04: thêm dự án A → tạo hồ sơ lười (tên tài khoản, slug tự sinh, noindex), snapshot đúng số, tiêu đề = tên nhóm", async () => {
    const ws = seedWorkspace(h, me, "Nhóm Đồ án kho", { teammates: [seedUser(h, "Lan").id, seedUser(h, "Minh").id, seedUser(h, "Khoa").id] });
    h.contribution.scores.set(`${me}:${ws}`, { scoreX10: 910, shareX10: 310, boards: 1 });
    const dto = await h.c.projectService.add(me, ws);
    expect(dto).toMatchObject({ workspaceId: ws, title: "Nhóm Đồ án kho", visible: true, showTeammates: false, order: 0, version: 1 });
    expect(dto.snapshot).toMatchObject({ tasksDone: 40, storyPoints: 62, onTimeRatePct: 90, contributionPct: 91, contributionSharePct: 31, peerReviewAvg: 8.5, filesUploaded: 7, teammatesCount: 3, namedTeammates: [] });
    const overview = await h.c.portfolio.overview(me);
    expect(overview.portfolio).toMatchObject({ displayName: "Nguyễn Văn An", status: "DRAFT", seoIndexable: false, theme: { template: "CLASSIC", accent: "GREEN" } });
    expect(overview.portfolio?.slug).toMatch(/^nguyen-van-an-[0-9a-f]{4}$/);
    expect(overview.projects).toHaveLength(1);
  });

  it("thứ tự tăng dần theo lần thêm", async () => {
    const a = seedWorkspace(h, me, "A");
    const b = seedWorkspace(h, me, "B");
    expect((await h.c.projectService.add(me, a)).order).toBe(0);
    expect((await h.c.projectService.add(me, b)).order).toBe(1);
  });

  it("PORT_004 (404): nhóm chưa có đóng góp được ghi nhận / nhóm không tồn tại", async () => {
    await expect(h.c.projectService.add(me, newObjectId())).rejects.toMatchObject({ errorCode: "PORT_004", statusCode: 404 });
  });

  it("PORT_006 (409): thêm trùng nhóm", async () => {
    const ws = seedWorkspace(h, me, "A");
    await h.c.projectService.add(me, ws);
    await expect(h.c.projectService.add(me, ws)).rejects.toMatchObject({ errorCode: "PORT_006", statusCode: 409 });
  });

  it("PORT_005 (409): quá số dự án tối đa", async () => {
    for (let i = 0; i < LIMITS.portfolio.projectsMax; i += 1) await h.c.projectService.add(me, seedWorkspace(h, me, `Nhóm ${i}`));
    await expect(h.c.projectService.add(me, seedWorkspace(h, me, "Thừa"))).rejects.toMatchObject({ errorCode: "PORT_005", statusCode: 409, details: { max: 12 } });
  });

  it("cổng số liệu chính lỗi → 503 SYS_503 (không tạo dự án rỗng)", async () => {
    const ws = seedWorkspace(h, me, "A");
    h.source.failing.add("memberStats");
    await expect(h.c.projectService.add(me, ws)).rejects.toMatchObject({ errorCode: "SYS_503", statusCode: 503 });
    expect(await h.projects.count((await h.portfolios.findByUserId(me))?.id ?? "")).toBe(0);
  });

  it("tên nhóm quá dài bị cắt theo trần tiêu đề", async () => {
    const ws = seedWorkspace(h, me, "N".repeat(200));
    expect((await h.c.projectService.add(me, ws)).title).toHaveLength(LIMITS.portfolio.projectTitleMax);
  });
});

describe("update", () => {
  it("sửa nội dung + CAS version; version lệch → 409 RES_003 kèm currentVersion", async () => {
    const ws = seedWorkspace(h, me, "A");
    const p = await h.c.projectService.add(me, ws);
    const updated = await h.c.projectService.update(me, p.id, {
      expectedVersion: 1,
      title: "Hệ thống kho",
      summary: "Tóm tắt",
      role: "Trưởng nhóm",
      periodFrom: new Date("2025-09-01"),
      periodTo: new Date("2025-12-01"),
      highlights: ["Điểm 1"],
      visible: false,
    });
    expect(updated).toMatchObject({ title: "Hệ thống kho", summary: "Tóm tắt", role: "Trưởng nhóm", highlights: ["Điểm 1"], visible: false, version: 2 });
    await expect(h.c.projectService.update(me, p.id, { expectedVersion: 1, title: "Cũ" })).rejects.toMatchObject({ errorCode: "RES_003", statusCode: 409, details: { currentVersion: 2 } });
  });

  it("thời gian bắt đầu sau kết thúc (kể cả khi chỉ gửi một đầu) → 400", async () => {
    const p = await h.c.projectService.add(me, seedWorkspace(h, me, "A"));
    await h.c.projectService.update(me, p.id, { expectedVersion: 1, periodFrom: new Date("2025-06-01"), periodTo: new Date("2025-12-01") });
    await expect(h.c.projectService.update(me, p.id, { expectedVersion: 2, periodTo: new Date("2025-01-01") })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("CR-31: bật showTeammates → tên người đã đồng ý; tắt → xoá tên (không gọi lại số liệu chính)", async () => {
    const lan = seedUser(h, "Lan Anh").id;
    const minh = seedUser(h, "Minh").id;
    h.source.consent.add(lan);
    const ws = seedWorkspace(h, me, "A", { teammates: [lan, minh] });
    const p = await h.c.projectService.add(me, ws);
    expect(p.snapshot.namedTeammates).toEqual([]);
    const spy = jest.spyOn(h.source, "memberStats");
    const on = await h.c.projectService.update(me, p.id, { expectedVersion: 1, showTeammates: true });
    expect(on.snapshot).toMatchObject({ teammatesCount: 2, namedTeammates: ["Lan Anh"] });
    expect(spy).not.toHaveBeenCalled();
    const off = await h.c.projectService.update(me, p.id, { expectedVersion: 2, showTeammates: false });
    expect(off.snapshot).toMatchObject({ teammatesCount: 2, namedTeammates: [] });
  });

  it("ảnh bìa: gắn/gỡ link asset; asset không hợp lệ → lỗi, dự án không đổi", async () => {
    const p = await h.c.projectService.add(me, seedWorkspace(h, me, "A"));
    const assetId = newObjectId();
    h.assets.images.set(assetId, await tinyPng());
    const withCover = await h.c.projectService.update(me, p.id, { expectedVersion: 1, coverAssetId: assetId });
    expect(withCover.coverAssetId).toBe(assetId);
    expect(h.assets.links).toEqual([{ targetId: p.id, assetId }]);
    await expect(h.c.projectService.update(me, p.id, { expectedVersion: 2, coverAssetId: newObjectId() })).rejects.toMatchObject({ statusCode: 404 });
    const cleared = await h.c.projectService.update(me, p.id, { expectedVersion: 2, coverAssetId: null });
    expect(cleared.coverAssetId).toBeNull();
    expect(h.assets.links).toEqual([]);
  });

  it("dự án của người khác / không tồn tại → 404", async () => {
    const p = await h.c.projectService.add(me, seedWorkspace(h, me, "A"));
    const stranger = seedUser(h, "Kẻ lạ").id;
    await expect(h.c.projectService.update(stranger, p.id, { expectedVersion: 1, title: "Chiếm" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.c.projectService.remove(stranger, p.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.c.projectService.refresh(stranger, p.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.c.projectService.update(me, newObjectId(), { expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("remove / reorder / refresh", () => {
  it("xoá dự án gỡ link ảnh bìa và đánh dấu hồ sơ có thay đổi", async () => {
    const p = await h.c.projectService.add(me, seedWorkspace(h, me, "A"));
    const assetId = newObjectId();
    h.assets.images.set(assetId, await tinyPng());
    await h.c.projectService.update(me, p.id, { expectedVersion: 1, coverAssetId: assetId });
    await h.c.projectService.remove(me, p.id);
    expect(h.assets.links).toEqual([]);
    expect((await h.c.portfolio.overview(me)).projects).toEqual([]);
  });

  it("reorder: đúng tập id mới đổi được; thiếu/thừa/trùng → 400 VAL_001", async () => {
    for (const name of ["A", "B", "C"]) await h.c.projectService.add(me, seedWorkspace(h, me, name));
    const ids = (await h.c.portfolio.overview(me)).projects.map((p) => p.id);
    const reversed = [...ids].reverse();
    const result = await h.c.projectService.reorder(me, reversed);
    expect(result.map((p) => p.id)).toEqual(reversed);
    expect(result.map((p) => p.order)).toEqual([0, 1, 2]);
    await expect(h.c.projectService.reorder(me, ids.slice(1))).rejects.toMatchObject({ errorCode: "VAL_001" });
    await expect(h.c.projectService.reorder(me, [...ids, newObjectId()])).rejects.toMatchObject({ errorCode: "VAL_001" });
    await expect(h.c.projectService.reorder(me, [ids[0], ids[0], ids[1]])).rejects.toMatchObject({ errorCode: "VAL_001" });
  });

  it("refresh: chụp lại số liệu mới (task tăng), cập nhật snapshotAt, KHÔNG đổi version dự án", async () => {
    const ws = seedWorkspace(h, me, "A");
    const p = await h.c.projectService.add(me, ws);
    h.source.stats.set(`${me}:${ws}`, stats({ tasksDone: 55, storyPointsX10: 900 }));
    h.clock.now = new Date("2026-09-27T03:00:00.000Z");
    const r = await h.c.projectService.refresh(me, p.id);
    expect(r.snapshot).toMatchObject({ tasksDone: 55, storyPoints: 90 });
    expect(r.snapshotAt).toBe("2026-09-27T03:00:00.000Z");
    expect(r.version).toBe(1);
  });

  it("refresh khi không còn đóng góp được tính → PORT_004; cổng lỗi → 503 (giữ số cũ)", async () => {
    const ws = seedWorkspace(h, me, "A");
    const p = await h.c.projectService.add(me, ws);
    h.source.failing.add("memberStats");
    await expect(h.c.projectService.refresh(me, p.id)).rejects.toMatchObject({ errorCode: "SYS_503" });
    h.source.failing.clear();
    h.source.stats.delete(`${me}:${ws}`);
    await expect(h.c.projectService.refresh(me, p.id)).rejects.toMatchObject({ errorCode: "PORT_004" });
    expect((await h.c.portfolio.overview(me)).projects[0].snapshot.tasksDone).toBe(40);
  });
});

it("người khác không thấy dự án của tôi trong overview của họ", async () => {
  await h.c.projectService.add(me, seedWorkspace(h, me, "A"));
  expect(await h.c.portfolio.overview(other)).toEqual({ portfolio: null, projects: [], latestBuild: null, publicUrl: null });
});
