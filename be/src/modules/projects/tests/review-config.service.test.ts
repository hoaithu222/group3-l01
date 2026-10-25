import type { AuthUser } from "../../../core/types/express";
import type { PutReviewConfigDto } from "../dtos";
import type { Board } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import { CRITERION_ID_REGEX, parseBoardReview } from "../services/review/review-config.schema";
import { ReviewHarness } from "./support/review-harness";

const base = (over: Partial<PutReviewConfigDto> = {}): PutReviewConfigDto => ({
  enabled: true,
  requiredReviews: 2,
  rubric: [],
  preventSelfReview: true,
  autoCompleteOnApproval: false,
  expectedVersion: 1,
  ...over,
});

describe("ReviewConfigService — GET/PUT cấu hình chấm chéo", () => {
  let h: ReviewHarness;
  let owner: AuthUser;
  let member: AuthUser;
  let board: Board;

  beforeEach(async () => {
    h = new ReviewHarness();
    owner = h.addUser("OWNER");
    member = h.addUser("MEMBER");
    h.addUser("MEMBER");
    board = await h.createBoard(owner);
  });

  it("GET: bảng chưa cấu hình → mặc định tắt, 2 lượt; kèm số người chấm được, số lượt đang mở, version", async () => {
    expect(await h.configService.get(member, board.id)).toEqual({
      enabled: false,
      requiredReviews: 2,
      rubric: [],
      autoCompleteOnApproval: false,
      eligibleReviewerCount: 3,
      openRoundCount: 0,
      version: 1,
    });
  });

  it("PUT (OWNER): lưu cấu hình, cấp id cho tiêu chí mới, version +1, phát board:updated, ghi outbox review.backfill (bật)", async () => {
    const res = await h.configService.put(owner, board.id, base({ enabled: true, requiredReviews: 3, rubric: [{ label: "Đúng yêu cầu", maxScore: 6 }, { label: "Trình bày", description: "Gọn", maxScore: 4 }] }));

    expect(res).toMatchObject({ enabled: true, requiredReviews: 3, version: 2, eligibleReviewerCount: 3 });
    expect(res.rubric).toHaveLength(2);
    expect(res.rubric.every((c) => CRITERION_ID_REGEX.test(c.id))).toBe(true);
    expect(res.rubric[1]).toMatchObject({ label: "Trình bày", description: "Gọn", maxScore: 4 });
    expect(parseBoardReview((await h.boards.findById(board.id))!.review)).toMatchObject({ enabled: true, requiredReviews: 3, preventSelfReview: true });
    expect(h.emitter.of("board:updated")[0].payload).toEqual({ boardId: board.id, version: 2 });
    expect(h.outbox.events).toEqual([
      expect.objectContaining({ type: "review.backfill", queue: "reports", jobName: "review.backfill", dedupeKey: `review.backfill:board:${board.id}:v2`, payload: { boardId: board.id, version: 2, mode: "ENABLE" } }),
    ]);
  });

  it("tắt → outbox mode DISABLE; giữ nguyên trạng thái bật/tắt → KHÔNG ghi outbox; sửa rubric giữ id ổn định khi đổi tên", async () => {
    const on = await h.configService.put(owner, board.id, base({ rubric: [{ label: "Tên cũ", maxScore: 5 }] }));
    h.outbox.events.length = 0;
    const renamed = await h.configService.put(owner, board.id, base({ expectedVersion: on.version, rubric: [{ id: on.rubric[0].id, label: "Tên mới", maxScore: 8 }] }));
    expect(renamed.rubric[0]).toMatchObject({ id: on.rubric[0].id, label: "Tên mới", maxScore: 8 });
    expect(h.outbox.events).toHaveLength(0);

    await h.configService.put(owner, board.id, base({ expectedVersion: renamed.version, enabled: false }));
    expect(h.outbox.events).toEqual([expect.objectContaining({ payload: expect.objectContaining({ mode: "DISABLE" }) })]);
  });

  it("đổi rubric/số lượt chỉ áp cho lượt MỚI: lượt đang mở giữ rubricSnapshot cũ", async () => {
    const a = h.addUser("MEMBER");
    const cfg = await h.configService.put(owner, board.id, base({ requiredReviews: 1, rubric: [{ label: "Cũ", maxScore: 10 }] }));
    const t = await h.addTask(owner, board, "Thẻ");
    h.setTask(t.id, { assigneeIds: [a.id] });
    await h.moveTo(a, board, t as Task, "REVIEW");
    const round = (await h.currentRound(t.id))!;
    expect(round.rubricSnapshot.map((c) => c.label)).toEqual(["Cũ"]);

    await h.configService.put(owner, board.id, base({ expectedVersion: cfg.version, requiredReviews: 3, rubric: [{ id: cfg.rubric[0].id, label: "Mới", maxScore: 5 }] }));
    expect((await h.roundRepo.findById(round.id))!.rubricSnapshot.map((c) => c.label)).toEqual(["Cũ"]);
    expect((await h.roundRepo.findById(round.id))!.configuredReviews).toBe(1);
  });

  it("REVIEW_004: id tiêu chí trùng / không còn trong cấu hình / nhóm người chấm có người không hợp lệ → 400 kèm lỗi theo trường; không lưu gì", async () => {
    const saved = await h.configService.put(owner, board.id, base({ rubric: [{ label: "A", maxScore: 5 }] }));
    const id = saved.rubric[0].id;
    await expect(h.configService.put(owner, board.id, base({ expectedVersion: 2, rubric: [{ id, label: "A", maxScore: 5 }, { id, label: "B", maxScore: 5 }] }))).rejects.toMatchObject({ statusCode: 400, errorCode: "REVIEW_004", details: { rubric: ["Mã tiêu chí bị trùng"] } });
    await expect(h.configService.put(owner, board.id, base({ expectedVersion: 2, rubric: [{ id: "r_ZZZZZZ", label: "Lạ", maxScore: 5 }] }))).rejects.toMatchObject({ errorCode: "REVIEW_004", details: { rubric: ["Tiêu chí không còn trong cấu hình hiện tại"] } });
    const guest = h.addUser("GUEST");
    await expect(h.configService.put(owner, board.id, base({ expectedVersion: 2, reviewerPool: [member.id, guest.id, "0".repeat(24)] }))).rejects.toMatchObject({ errorCode: "REVIEW_004", details: { reviewerPool: [expect.stringContaining("2 người")] } });
    expect((await h.boards.findById(board.id))!.version).toBe(2);
  });

  it("nhóm người chấm hợp lệ được lưu và làm hẹp eligibleReviewerCount", async () => {
    const res = await h.configService.put(owner, board.id, base({ reviewerPool: [member.id] }));
    expect(res).toMatchObject({ reviewerPool: [member.id], eligibleReviewerCount: 1 });
  });

  it("RES_003 khi expectedVersion cũ (kèm currentVersion); MEMBER → 403; GUEST → 404; bảng lưu trữ → 403", async () => {
    await h.configService.put(owner, board.id, base());
    await expect(h.configService.put(owner, board.id, base({ expectedVersion: 1 }))).rejects.toMatchObject({ statusCode: 409, errorCode: "RES_003", details: { currentVersion: 2 } });
    await expect(h.configService.put(member, board.id, base({ expectedVersion: 2 }))).rejects.toMatchObject({ statusCode: 403 });
    await expect(h.configService.put(h.addUser("GUEST"), board.id, base({ expectedVersion: 2 }))).rejects.toMatchObject({ statusCode: 404 });
    h.boards.boards.get(board.id)!.archivedAt = new Date();
    await expect(h.configService.put(owner, board.id, base({ expectedVersion: 2 }))).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("ReviewBackfillService — bật/tắt chấm chéo cho thẻ đang ở REVIEW", () => {
  it("ENABLE mở lượt cho thẻ đang ở REVIEW (bỏ qua thẻ đã có lượt mở), chạy lại không mở thêm; thẻ ở cột khác không bị đụng", async () => {
    const h = new ReviewHarness();
    const owner = h.addUser("OWNER");
    const a = h.addUser("MEMBER");
    h.addUser("MEMBER");
    h.addUser("MEMBER");
    const off = await h.reviewBoard(owner, { enabled: false, requiredReviews: 1 });
    const inReview = [];
    for (const title of ["Một", "Hai", "Ba"]) {
      const t = await h.addTask(owner, off, title, { columnId: h.columnId(off, "REVIEW") });
      h.setTask(t.id, { assigneeIds: [a.id] });
      inReview.push(t.id);
    }
    const todo = await h.addTask(owner, off, "Ở TODO");
    // Thẻ thứ ba đã có lượt mở từ trước (vd mở tay) — backfill phải bỏ qua.
    h.setBoardReview(off.id, { enabled: true, requiredReviews: 1, rubric: [], preventSelfReview: true, autoCompleteOnApproval: false });
    await h.reconcileService.onTaskEntered(inReview[2]);
    h.emitter.events.length = 0;

    expect(await h.backfillService.run({ boardId: off.id, version: 2, mode: "ENABLE" })).toEqual({ opened: 2, cancelled: 0 });
    expect(h.store.rounds.size).toBe(3);
    expect((await h.tasks.findById(todo.id))!.reviewState).toBe("NONE");
    for (const id of inReview) expect((await h.tasks.findById(id))!.reviewState).toBe("PENDING");
    expect(h.emitter.of("task:review-updated")).toHaveLength(2);

    expect(await h.backfillService.run({ boardId: off.id, version: 2, mode: "ENABLE" })).toEqual({ opened: 0, cancelled: 0 }); // idempotent
  });

  it("DISABLE huỷ mọi lượt đang mở (REVIEW_DISABLED, reviewState NONE, review chờ CANCELLED, outbox review.cancelled); bật lại giữa chừng thì giữ lượt", async () => {
    const h = new ReviewHarness();
    const owner = h.addUser("OWNER");
    const a = h.addUser("MEMBER");
    h.addUser("MEMBER");
    h.addUser("MEMBER");
    const board = await h.reviewBoard(owner, { requiredReviews: 1 });
    const ids: string[] = [];
    for (const title of ["Một", "Hai"]) {
      const t = await h.addTask(owner, board, title);
      h.setTask(t.id, { assigneeIds: [a.id] });
      await h.moveTo(a, board, t, "REVIEW");
      ids.push(t.id);
    }
    h.outbox.events.length = 0;

    // Bật lại giữa lúc job chạy → không huỷ.
    expect(await h.backfillService.run({ boardId: board.id, version: 3, mode: "DISABLE" })).toEqual({ opened: 0, cancelled: 0 });

    h.setBoardReview(board.id, { enabled: false, requiredReviews: 1, rubric: [], preventSelfReview: true, autoCompleteOnApproval: false });
    expect(await h.backfillService.run({ boardId: board.id, version: 3, mode: "DISABLE" })).toEqual({ opened: 0, cancelled: 2 });
    for (const id of ids) {
      expect((await h.tasks.findById(id))!.reviewState).toBe("NONE");
      expect(await h.roundRepo.findOpen(id)).toBeNull();
    }
    expect([...h.store.rounds.values()].every((r) => r.status === "CANCELLED" && r.closeReason === "REVIEW_DISABLED")).toBe(true);
    expect([...h.store.reviews.values()].every((r) => r.cancelReason === "REVIEW_DISABLED")).toBe(true);
    expect(h.outbox.events.filter((e) => e.type === "review.cancelled")).toHaveLength(2);
    // Tắt rồi: thẻ vào DONE không bị chặn nữa.
    await h.moveTo(a, board, (await h.tasks.findById(ids[0])) as Task, "DONE");
  });

  it("bảng không còn / job sai trạng thái (ENABLE nhưng bảng đang tắt) → không làm gì", async () => {
    const h = new ReviewHarness();
    const owner = h.addUser("OWNER");
    const board = await h.reviewBoard(owner, { enabled: false });
    expect(await h.backfillService.run({ boardId: board.id, version: 2, mode: "ENABLE" })).toEqual({ opened: 0, cancelled: 0 });
    expect(await h.backfillService.run({ boardId: "0".repeat(24), version: 2, mode: "ENABLE" })).toEqual({ opened: 0, cancelled: 0 });
  });
});
