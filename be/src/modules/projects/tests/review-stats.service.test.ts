import type { AuthUser } from "../../../core/types/express";
import type { Task } from "../entities/task.interface";
import { medianHours } from "../services/review/review-stats.service";
import { ReviewHarness } from "./support/review-harness";
import { userOf } from "./support/service-harness";

const at = (iso: string): Date => new Date(iso);

describe("medianHours — trung vị giờ chấm", () => {
  it("rỗng → null; lẻ → phần tử giữa; chẵn → trung bình hai phần tử giữa; làm tròn 1 chữ số; không âm", () => {
    expect(medianHours([])).toBeNull();
    const row = (h: number) => ({ assignedAt: at("2026-09-20T00:00:00Z"), submittedAt: new Date(at("2026-09-20T00:00:00Z").getTime() + h * 3_600_000) });
    expect(medianHours([row(5), row(1), row(3)])).toBe(3);
    expect(medianHours([row(1), row(2), row(4), row(10)])).toBe(3);
    expect(medianHours([row(1.26), row(1.3)])).toBe(1.3);
    expect(medianHours([{ assignedAt: at("2026-09-20T10:00:00Z"), submittedAt: at("2026-09-20T09:00:00Z") }])).toBe(0);
  });
});

describe("ReviewStatsService — số liệu cho admin (PM2-32: chỉ số đếm)", () => {
  let h: ReviewHarness;
  let owner: AuthUser;
  let an: AuthUser;

  beforeEach(() => {
    h = new ReviewHarness();
    owner = h.addUser("OWNER");
    an = h.addUser("MEMBER");
    h.addUser("MEMBER");
    h.addUser("MEMBER");
    h.directory.workspaceNameMap.set(h.workspaceId, "Nhóm học");
  });

  it("đếm lượt đang mở / review chờ / chờ quá 72 giờ / tự duyệt / miễn chấm / theo bảng; KHÔNG chứa tên người, điểm, nhận xét, tiêu đề thẻ", async () => {
    const board = await h.reviewBoard(owner, { requiredReviews: 2 });
    const mk = async (title: string): Promise<Task> => {
      const t = await h.addTask(owner, board, title);
      h.setTask(t.id, { assigneeIds: [an.id] });
      return (await h.tasks.findById(t.id)) as Task;
    };
    const t1 = await mk("Bí mật tiêu đề một");
    const t2 = await mk("Bí mật tiêu đề hai");
    await h.moveTo(an, board, t1, "REVIEW");
    await h.moveTo(an, board, t2, "REVIEW");
    // Lượt 1: một người đã nộp (đo thời gian chấm). Lượt 2: bị miễn.
    const r1 = (await h.currentRound(t1.id))!;
    const [first, second] = await h.reviewsOf(r1);
    await h.submitService.submit(userOf(first.reviewerId), first.id, { status: "APPROVED", rubricScores: [], score10: 8, feedback: "Nhận xét bí mật", expectedVersion: 1 });
    await h.waiveService.waive(owner, t2.id, { reason: "Lý do miễn chấm bí mật đủ dài" });
    // Review còn chờ đã "quá 72 giờ": lùi thời điểm được giao.
    h.store.reviews.get(second.id)!.assignedAt = new Date(Date.now() - 80 * 3_600_000);

    const stats = await h.statsService.get(h.workspaceId, 30);

    expect(stats).toEqual({
      openRounds: 1,
      pendingReviews: 1,
      overdue72h: 1,
      medianHoursToSubmit: expect.any(Number),
      roundsInPeriod: 2,
      autoApprovedRounds: 0,
      waivedRounds: 1,
      byBoard: [{ boardId: board.id, boardName: "Bảng test", enabled: true, openRounds: 1 }],
    });
    const json = JSON.stringify(stats);
    for (const secret of ["Bí mật", "Nhận xét bí mật", "Lý do miễn chấm", "Người MEMBER", "Người OWNER", "score10", "reviewerId", "feedback"]) expect(json).not.toContain(secret);
  });

  it("tự duyệt do thiếu người được đếm (mẫu số roundsInPeriod cho tỉ lệ 30%); ngoài cửa sổ days không tính; nhóm không tồn tại → 404", async () => {
    const solo = new ReviewHarness();
    const o = solo.addUser("OWNER");
    solo.directory.workspaceNameMap.set(solo.workspaceId, "Nhóm một người");
    const board = await solo.reviewBoard(o, { requiredReviews: 2 });
    const t = await solo.addTask(o, board, "Một mình");
    solo.setTask(t.id, { assigneeIds: [o.id] });
    await solo.moveTo(o, board, t, "REVIEW"); // 0 ứng viên → tự duyệt

    expect(await solo.statsService.get(solo.workspaceId, 30)).toMatchObject({ roundsInPeriod: 1, autoApprovedRounds: 1, openRounds: 0, medianHoursToSubmit: null });
    // Đẩy lượt ra ngoài cửa sổ 7 ngày.
    solo.store.rounds.forEach((r) => (r.openedAt = new Date(Date.now() - 20 * 86_400_000)));
    expect(await solo.statsService.get(solo.workspaceId, 7)).toMatchObject({ roundsInPeriod: 0, autoApprovedRounds: 0 });
    await expect(solo.statsService.get("0".repeat(24), 30)).rejects.toMatchObject({ statusCode: 404 });
  });
});
