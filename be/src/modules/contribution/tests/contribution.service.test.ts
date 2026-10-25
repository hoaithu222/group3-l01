import { createHarness, IDS, seedDone, type Harness } from "./support/harness";
import { oid } from "./support/fakes";


async function seedFixture(h: Harness): Promise<void> {
  // PM2-33: An 8 điểm thẻ, đúng hạn 3/4, chấm TB 8,0 · Bình 4 điểm, 2/2, 7,0 · Chi không có gì.
  const due = "2026-09-10T10:00:00Z";
  await seedDone(h, 1, { assignees: [IDS.an], storyPoints: 3, due, completedAt: "2026-09-10T08:00:00Z" });
  await seedDone(h, 2, { assignees: [IDS.an], storyPoints: 2, due, completedAt: "2026-09-10T09:00:00Z" });
  await seedDone(h, 3, { assignees: [IDS.an], storyPoints: 2, due, completedAt: "2026-09-10T10:00:00Z" });
  await seedDone(h, 4, { assignees: [IDS.an], storyPoints: 1, due, completedAt: "2026-09-11T02:00:00Z" });
  await seedDone(h, 5, { assignees: [IDS.binh], storyPoints: 2, due, completedAt: "2026-09-10T11:00:00Z" });
  await seedDone(h, 6, { assignees: [IDS.binh], storyPoints: 2, due, completedAt: "2026-09-10T12:00:00Z" });
  const reviews: Array<[string, number, string]> = [[IDS.an, 7, "a"], [IDS.an, 8, "b"], [IDS.an, 8, "c"], [IDS.an, 8, "d"], [IDS.an, 9, "e"], [IDS.binh, 7, "f"]];
  for (const [assignee, score, tag] of reviews) {
    await h.facts.insertReviewFact({
      reviewId: oid(parseInt(tag, 16) + 0x900),
      taskId: oid(0x501),
      boardId: IDS.board,
      workspaceId: IDS.ws,
      reviewerId: IDS.owner,
      assigneeIds: [assignee],
      status: "APPROVED",
      score10: score,
      submittedAt: new Date("2026-09-12T05:00:00Z"),
    });
  }
}

const member = (r: Awaited<ReturnType<Harness["reports"]["getReport"]>>, id: string) => r.members.find((m) => m.user.id === id)!;

describe("ContributionService — recompute + đọc báo cáo (PM2-33)", () => {
  it("recompute ghi snapshot ALL + tháng; báo cáo đọc từ snapshot, khớp fixture PM2-33 và đủ số gốc", async () => {
    const h = createHarness();
    await seedFixture(h);
    await h.states.bumpFactsVersion(IDS.board, IDS.ws, await h.config.defaults());
    const result = await h.reports.recompute(IDS.board);
    expect(result).toMatchObject({ periods: 2 }); // ALL + M:2026-09
    expect(new Set(h.snapshots.rows.map((r) => r.periodKey))).toEqual(new Set(["ALL", "M:2026-09"]));

    const report = await h.reports.getReport(h.as(IDS.an), IDS.board, "ALL");
    expect(report.stale).toBe(false);
    expect(report.computedAt).not.toBeNull();
    expect(report.period).toMatchObject({ key: "ALL", from: null, to: null, timezone: "Asia/Ho_Chi_Minh" });
    expect(report.formula).toMatchObject({ weights: { points: 60, onTime: 20, peer: 20 }, formulaVersion: 1, changedAt: null, changedBy: null, previousWeights: null });
    expect(report.formula.definitions.points).toContain("thẻ chưa gán điểm tính 1 điểm");

    expect(report.members.map((m) => [m.user.name, m.score, m.share])).toEqual([["An", 91, 58.7], ["Bình", 64, 41.3], ["Chi", 0, 0], ["Minh", 0, 0]]);
    expect(member(report, IDS.an)).toMatchObject({ storyPointsDone: 8, tasksDone: 4, tasksWithDue: 4, tasksOnTime: 3, tasksLate: 1, reviewCount: 5, peerScoreAvg: 8 });
    expect(member(report, IDS.an).explanation).toBe("60 × 8/8 + 20 × 3/4 + 20 × 8,0/10 = 91,0");
    expect(report.totals).toEqual({ storyPointsDone: 12, tasksDone: 6 });
    expect(report.maxStoryPoints).toBe(8);
  });

  it("snapshot tháng khớp; tháng không có dữ liệu → tính tại chỗ ra bảng rỗng (điểm 0)", async () => {
    const h = createHarness();
    await seedFixture(h);
    await h.states.bumpFactsVersion(IDS.board, IDS.ws, await h.config.defaults());
    await h.reports.recompute(IDS.board);
    const sep = await h.reports.getReport(h.as(IDS.an), IDS.board, "M:2026-09");
    expect(member(sep, IDS.an).score).toBe(91);
    const oct = await h.reports.getReport(h.as(IDS.an), IDS.board, "M:2026-10");
    expect(oct.members.every((m) => m.score === 0 && m.tasksDone === 0)).toBe(true);
    expect(oct.totals).toEqual({ storyPointsDone: 0, tasksDone: 0 });
  });

  it("chưa từng tính (chưa có snapshot) → tính tại chỗ (không stale); có snapshot mà fact mới hơn → stale", async () => {
    const h = createHarness();
    await seedFixture(h);
    await h.states.bumpFactsVersion(IDS.board, IDS.ws, await h.config.defaults());
    const before = await h.reports.getReport(h.as(IDS.an), IDS.board, "ALL");
    expect(before.stale).toBe(false); // tính từ fact hiện tại nên không lệch
    expect(member(before, IDS.an).score).toBe(91);
    await h.reports.recompute(IDS.board);
    await seedDone(h, 7, { assignees: [IDS.chi], storyPoints: 5 });
    await h.states.bumpFactsVersion(IDS.board, IDS.ws, await h.config.defaults());
    const stale = await h.reports.getReport(h.as(IDS.an), IDS.board, "ALL");
    expect(stale.stale).toBe(true);
    expect(member(stale, IDS.chi).tasksDone).toBe(0); // snapshot cũ, chưa có thẻ mới
  });

  it("kỳ tuần tính tại chỗ và cache theo (factsVersion, configVersion)", async () => {
    const h = createHarness();
    await seedFixture(h);
    await h.states.bumpFactsVersion(IDS.board, IDS.ws, await h.config.defaults());
    const week = await h.reports.getReport(h.as(IDS.an), IDS.board, "W:2026-W37");
    expect(member(week, IDS.an).score).toBe(91);
    expect(h.cache.store.size).toBe(1);
    // Thêm thẻ nhưng CHƯA tăng phiên bản → vẫn trả bản cache (đúng ngữ nghĩa cache 300 s theo phiên bản).
    await seedDone(h, 8, { assignees: [IDS.chi], storyPoints: 9, completedAt: "2026-09-11T05:00:00Z" });
    expect(member(await h.reports.getReport(h.as(IDS.an), IDS.board, "W:2026-W37"), IDS.chi).tasksDone).toBe(0);
    await h.states.bumpFactsVersion(IDS.board, IDS.ws, await h.config.defaults());
    expect(member(await h.reports.getReport(h.as(IDS.an), IDS.board, "W:2026-W37"), IDS.chi).tasksDone).toBe(1);
  });

  it("kỳ sai → 400 CONTRIB_003; khách/người ngoài → 404", async () => {
    const h = createHarness();
    await expect(h.reports.getReport(h.as(IDS.an), IDS.board, "M:2026-13")).rejects.toMatchObject({ errorCode: "CONTRIB_003", statusCode: 400 });
    await expect(h.reports.getReport(h.as(IDS.outsider), IDS.board, "ALL")).rejects.toMatchObject({ errorCode: "PERM_404", statusCode: 404 });
  });

  it("thành viên đã rời hiện nhãn LEFT; tài khoản đã xoá (không còn trong danh bạ) hiện tên trung tính", async () => {
    const h = createHarness();
    await seedDone(h, 1, { assignees: [IDS.an, oid(0x777)], storyPoints: 4 });
    h.directory.users.set(IDS.an, { id: IDS.an, name: "An", avatarUrl: null, membership: "LEFT" });
    await h.states.bumpFactsVersion(IDS.board, IDS.ws, await h.config.defaults());
    const report = await h.reports.getReport(h.as(IDS.owner), IDS.board, "ALL");
    expect(member(report, IDS.an).user.membership).toBe("LEFT");
    expect(member(report, oid(0x777)).user).toMatchObject({ name: "Tài khoản đã xoá", membership: "ANONYMIZED" });
  });
});

describe("ContributionService — thẻ được tính theo người + kỳ", () => {
  it("phân trang cursor mới → cũ, có điểm chia, đúng/trễ hạn, điểm chấm; thẻ xoá không lộ tiêu đề", async () => {
    const h = createHarness();
    await seedFixture(h);
    h.directory.tasks.set(oid(0x502), { id: oid(0x502), title: "Bí mật", deleted: true });
    await h.states.bumpFactsVersion(IDS.board, IDS.ws, await h.config.defaults());
    const first = await h.memberTasks.list(h.as(IDS.an), IDS.board, IDS.an, { period: "ALL", limit: 3 });
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
    expect(first.items.map((i) => i.completedAt)).toEqual([...first.items.map((i) => i.completedAt)].sort().reverse());
    const second = await h.memberTasks.list(h.as(IDS.an), IDS.board, IDS.an, { period: "ALL", limit: 3, cursor: first.nextCursor as string });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const all = [...first.items, ...second.items];
    expect(new Set(all.map((i) => i.taskId)).size).toBe(4);
    const late = all.find((i) => i.completedAt.startsWith("2026-09-11"));
    expect(late).toMatchObject({ onTime: false, storyPoints: 1, sharedPoints: 1, assigneeCount: 1 });
    expect(all.filter((i) => i.onTime === true)).toHaveLength(3);
    const deleted = all.find((i) => i.taskId === oid(0x502));
    expect(deleted).toMatchObject({ deleted: true, title: null });
    expect(all.find((i) => i.taskId === oid(0x501))).toMatchObject({ title: "Thẻ 1", deleted: false, reviewCount: 6, reviewScoreAvg: 7.8 });
  });

  it("thẻ hai người làm: điểm chia đôi; người lạ → 404; kỳ lọc theo completedAt", async () => {
    const h = createHarness();
    await seedDone(h, 1, { assignees: [IDS.an, IDS.binh], storyPoints: 5, completedAt: "2026-08-20T05:00:00Z" });
    await seedDone(h, 2, { assignees: [IDS.an], storyPoints: null, completedAt: "2026-09-10T05:00:00Z" });
    const aug = await h.memberTasks.list(h.as(IDS.an), IDS.board, IDS.binh, { period: "M:2026-08", limit: 10 });
    expect(aug.items).toHaveLength(1);
    expect(aug.items[0]).toMatchObject({ sharedPoints: 2.5, assigneeCount: 2, storyPoints: 5 });
    const sep = await h.memberTasks.list(h.as(IDS.an), IDS.board, IDS.an, { period: "M:2026-09", limit: 10 });
    expect(sep.items).toHaveLength(1);
    expect(sep.items[0]).toMatchObject({ storyPoints: null, sharedPoints: 1 });
    await expect(h.memberTasks.list(h.as(IDS.an), IDS.board, oid(0x999), { period: "ALL", limit: 10 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.memberTasks.list(h.as(IDS.an), IDS.board, IDS.an, { period: "bad", limit: 10 })).rejects.toMatchObject({ errorCode: "CONTRIB_003" });
  });

  it("danh sách kỳ: tháng + tuần có dữ liệu, mới nhất trước", async () => {
    const h = createHarness();
    await seedDone(h, 1, { completedAt: "2026-08-20T05:00:00Z" });
    await seedDone(h, 2, { completedAt: "2026-09-10T05:00:00Z" });
    const periods = await h.reports.getPeriods(h.as(IDS.an), IDS.board);
    expect(periods.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(periods.months).toEqual(["M:2026-09", "M:2026-08"]);
    expect(periods.weeks).toEqual(["W:2026-W37", "W:2026-W34"]);
  });
});

describe("ContributionService — bảng chưa tuỳ chỉnh dùng mặc định ĐÃ ĐÓNG BĂNG", () => {
  it("admin đổi mặc định nền tảng sau đó không làm đổi công thức của bảng đã có state", async () => {
    const h = createHarness();
    await seedDone(h, 1, { assignees: [IDS.an], storyPoints: 5 });
    const first = await h.reports.getReport(h.as(IDS.an), IDS.board, "ALL");
    expect(first.formula.weights).toEqual({ points: 60, onTime: 20, peer: 20 });
    h.config.value = { weights: { points: 10, onTime: 10, peer: 80 }, onTimeGraceHours: 12, unestimatedPoints: 3 };
    const second = await h.reports.getReport(h.as(IDS.an), IDS.board, "ALL");
    expect(second.formula).toMatchObject({ weights: { points: 60, onTime: 20, peer: 20 }, onTimeGraceHours: 0, unestimatedPoints: 1 });
    // Bảng MỚI (state chưa có) nhận mặc định mới.
    h.directory.boards.set(oid(0xb2), { id: oid(0xb2), workspaceId: IDS.ws, name: "Bảng 2", archivedAt: null, createdAt: new Date(), version: 1, contribution: null });
    const other = await h.reports.getReport(h.as(IDS.owner), oid(0xb2), "ALL");
    expect(other.formula).toMatchObject({ weights: { points: 10, onTime: 10, peer: 80 }, onTimeGraceHours: 12, unestimatedPoints: 3 });
  });
});
