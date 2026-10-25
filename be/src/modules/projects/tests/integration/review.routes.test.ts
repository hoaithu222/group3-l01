import { installMocks, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, ensureProjectIndexes, makeApi, mutationId, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { reviewSubmittedSchema } from "../../../../shared/events/domain-events";
import { getProjectsContainer } from "../../projects.container";

// Không có Redis/BullMQ thật: huỷ/hẹn job nhắc là no-op (huỷ nhắc là tối ưu best-effort có trần thời gian).
jest.mock("../../../../infrastructure/queue", () => ({
  ...jest.requireActual("../../../../infrastructure/queue"),
  cancelJob: jest.fn(),
  scheduleAt: jest.fn(),
}));

const app = buildProjectsApp();
const api = makeApi(app);

type Board = { id: string; version: number; columns: { id: string; kind: string }[] };
type Card = { id: string; version: number; reviewState: string; columnKind: string; review?: { approvedCount: number; requiredReviews: number } | null };

const RUBRIC = [
  { id: undefined as string | undefined, label: "Đúng yêu cầu", maxScore: 4 },
  { id: undefined as string | undefined, label: "Chất lượng mã", maxScore: 3 },
  { id: undefined as string | undefined, label: "Trình bày", maxScore: 3 },
];

describe("p4-05 chấm chéo — REST (integration, Mongo memory replset)", () => {
  const groups: Group[] = [];
  let g: Group;
  let board: Board;
  let criteria: { id: string; maxScore: number }[];

  beforeAll(async () => {
    await ensureProjectIndexes();
    await prisma.$runCommandRaw({ createIndexes: "OutboxEvent", indexes: [{ key: { dedupeKey: 1 }, name: "OutboxEvent_dedupeKey_key", unique: true }] });
  });
  beforeEach(async () => {
    installMocks();
    g = await seedGroup({ A: "OWNER", B: "MEMBER", C: "MEMBER", D: "MEMBER", E: "MEMBER", F: "MEMBER", G: "GUEST" });
    groups.push(g);
    board = (await api("post", `/workspaces/${g.workspaceId}/boards`, as("A"), { name: "Đồ án chấm chéo" })).body.data;
    // Nhóm người chấm giới hạn C, D để kết quả tất định.
    const res = await putConfig({ enabled: true, requiredReviews: 2, rubric: RUBRIC, reviewerPool: [g.ids.C, g.ids.D] });
    expect(res.status).toBe(200);
    criteria = res.body.data.rubric;
  });
  afterEach(async () => {
    const wsIds = groups.map((x) => x.workspaceId);
    await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.notification.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const as = (who: string) => tokenFor(g.ids[who]);
  const col = (kind: string) => board.columns.find((c) => c.kind === kind)!.id;
  const nameOf = (userId: string): string => Object.entries(g.ids).find(([, id]) => id === userId)![0];

  async function putConfig(body: Record<string, unknown>, who = "A") {
    const current = (await api("get", `/boards/${board.id}`, as("A"))).body.data as Board;
    board = { ...current, columns: current.columns };
    return api("put", `/boards/${board.id}/review-config`, as(who), { autoCompleteOnApproval: false, expectedVersion: current.version, ...body });
  }
  const newTask = async (title: string, assignee = "B"): Promise<Card> => {
    const res = await api("post", `/boards/${board.id}/tasks`, as("A"), { title, assigneeIds: [g.ids[assignee]] });
    expect(res.status).toBe(201);
    return res.body.data as Card;
  };
  const move = (who: string, task: { id: string; version?: number }, kind: string, version?: number) =>
    api("post", `/tasks/${task.id}/move`, as(who), {
      columnId: col(kind),
      afterTaskId: null,
      beforeTaskId: null,
      expectedVersion: version ?? task.version ?? 1,
      clientMutationId: mutationId(),
    });
  const detail = async (who: string, id: string) => (await api("get", `/tasks/${id}`, as(who))).body.data;
  /** Đưa thẻ (người làm B) vào REVIEW; trả thẻ mới nhất. */
  const toReview = async (title = "Thẻ chấm"): Promise<Card> => {
    const t = await newTask(title);
    const res = await move("B", t, "REVIEW");
    expect(res.status).toBe(200);
    return { ...t, version: res.body.data.version };
  };
  const reviewsOf = async (taskId: string) => prisma.taskReview.findMany({ where: { taskId }, orderBy: { assignedAt: "asc" } });
  const reviewer = (r: { reviewerId: string }): string => nameOf(r.reviewerId);
  const score = (points: number[]) => criteria.map((c, i) => ({ criterionId: c.id, score: points[i] }));
  const submit = (who: string, review: { id: string; version: number }, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
    api("post", `/task-reviews/${review.id}/submit`, as(who), { status: "APPROVED", rubricScores: score([4, 3, 3]), expectedVersion: review.version, ...body }, headers);

  describe("PUT/GET /boards/:id/review-config", () => {
    it("OWNER lưu cấu hình: cấp id tiêu chí, version tăng, ghi outbox review.backfill khi bật/tắt; MEMBER xem được nhưng không sửa (403); GUEST 404", async () => {
      expect(criteria.every((c) => /^r_[A-Za-z0-9]{6}$/.test(c.id))).toBe(true);
      const get = await api("get", `/boards/${board.id}/review-config`, as("C"));
      expect(get.status).toBe(200);
      expect(get.body.data).toMatchObject({ enabled: true, requiredReviews: 2, reviewerPool: [g.ids.C, g.ids.D], eligibleReviewerCount: 2, openRoundCount: 0, version: 2 });
      expect(get.body.data.rubric).toHaveLength(3);

      expect((await putConfig({ enabled: true, requiredReviews: 2, rubric: criteria }, "C")).status).toBe(403);
      expect((await putConfig({ enabled: true, requiredReviews: 2, rubric: criteria }, "G")).status).toBe(404);
      expect((await api("get", `/boards/${board.id}/review-config`, as("G"))).status).toBe(404);

      // Bật lần đầu (beforeEach) đã ghi outbox mode ENABLE; tắt ghi thêm DISABLE.
      await putConfig({ enabled: false, requiredReviews: 2, rubric: criteria });
      const rows = await prisma.outboxEvent.findMany({ where: { aggregateType: "Board", aggregateId: board.id }, orderBy: { createdAt: "asc" } });
      expect(rows.map((r) => (r.payload as { mode: string }).mode)).toEqual(["ENABLE", "DISABLE"]);
      expect(rows[0]).toMatchObject({ queue: "reports", jobName: "review.backfill", type: "review.backfill" });
    });

    it("REVIEW_004 (id tiêu chí trùng / không còn / nhóm người chấm có GUEST), RES_003 khi version cũ, VAL_001 khi requiredReviews ngoài 1–5", async () => {
      const dup = await putConfig({ enabled: true, requiredReviews: 2, rubric: [{ id: criteria[0].id, label: "A", maxScore: 1 }, { id: criteria[0].id, label: "B", maxScore: 1 }] });
      expect([dup.status, dup.body.error.code, dup.body.error.details.rubric]).toEqual([400, "REVIEW_004", ["Mã tiêu chí bị trùng"]]);
      const pool = await putConfig({ enabled: true, requiredReviews: 2, rubric: criteria, reviewerPool: [g.ids.C, g.ids.G] });
      expect([pool.status, pool.body.error.code]).toEqual([400, "REVIEW_004"]);
      const stale = await api("put", `/boards/${board.id}/review-config`, as("A"), { enabled: true, requiredReviews: 2, rubric: criteria, autoCompleteOnApproval: false, expectedVersion: 1 });
      expect([stale.status, stale.body.error.code, stale.body.error.details.currentVersion]).toEqual([409, "RES_003", 2]);
      expect((await putConfig({ enabled: true, requiredReviews: 6, rubric: criteria })).status).toBe(400);
      expect((await putConfig({ enabled: true, requiredReviews: 0, rubric: criteria })).status).toBe(400);
    });
  });

  describe("PM2-05 / PM2-06 — vào REVIEW mở lượt, chặn DONE ở server", () => {
    it("thẻ của B vào REVIEW: đúng MỘT lượt OPEN, giao C và D (không B), reviewState PENDING, thẻ mini có tiến độ, chi tiết có reviews; outbox review.assigned", async () => {
      const t = await toReview();
      const rounds = await prisma.taskReviewRound.findMany({ where: { taskId: t.id } });
      expect(rounds).toHaveLength(1);
      expect(rounds[0]).toMatchObject({ round: 1, status: "OPEN", requiredReviews: 2, configuredReviews: 2, activeKey: `task:${t.id}`, shortage: false, autoApproved: false });
      expect(rounds[0].rubricSnapshot.map((c) => c.label)).toEqual(["Đúng yêu cầu", "Chất lượng mã", "Trình bày"]);
      expect((await reviewsOf(t.id)).map(reviewer).sort()).toEqual(["C", "D"]);
      expect(await prisma.outboxEvent.count({ where: { type: "review.assigned", aggregateId: rounds[0].id } })).toBe(1);

      const cards = (await api("get", `/boards/${board.id}/tasks?columnId=${col("REVIEW")}`, as("E"))).body.data.columns[0].tasks as Card[];
      expect(cards[0]).toMatchObject({ id: t.id, reviewState: "PENDING", review: { approvedCount: 0, requiredReviews: 2 } });
      const d = await detail("E", t.id);
      expect(d.reviewState).toBe("PENDING");
      expect(d.reviews).toMatchObject({ enabled: true, currentRound: { round: 1, status: "OPEN", approvedCount: 0 }, myReview: null, myPermissions: { submit: false, reassign: false, waive: false } });
    });

    it("PM2-06: 1/2 duyệt kéo sang DONE, thẻ ở TODO nhảy thẳng sang DONE → cả hai 409 TASK_002 REVIEW_REQUIRED; thẻ giữ nguyên, không có task.completed", async () => {
      const t = await toReview();
      const [first] = await reviewsOf(t.id);
      expect((await submit(reviewer(first), first, {})).status).toBe(200);

      const blocked = await move("B", t, "DONE");
      expect(blocked.status).toBe(409);
      expect(blocked.body.error).toMatchObject({ code: "TASK_002", details: { reason: "REVIEW_REQUIRED", approvedCount: 1, requiredReviews: 2, roundStatus: "OPEN" } });
      expect(await prisma.task.findUnique({ where: { id: t.id } })).toMatchObject({ columnKind: "REVIEW", completedAt: null });

      const direct = await newTask("Nhảy thẳng");
      const jump = await move("B", direct, "DONE");
      expect([jump.status, jump.body.error.code, jump.body.error.details.reason, jump.body.error.details.roundStatus]).toEqual([409, "TASK_002", "REVIEW_REQUIRED", "NONE"]);
      expect(await prisma.outboxEvent.count({ where: { type: "task.completed", aggregateId: { in: [t.id, direct.id] } } })).toBe(0);
    });

    it("đủ 2 lượt duyệt → sang DONE thành công; task.completed mang review { enabled, approved:true, roundId }", async () => {
      const t = await toReview();
      for (const r of await reviewsOf(t.id)) expect((await submit(reviewer(r), r, {})).status).toBe(200);
      const res = await move("B", t, "DONE", (await prisma.task.findUnique({ where: { id: t.id } }))!.version);
      expect(res.status).toBe(200);
      const round = (await prisma.taskReviewRound.findFirst({ where: { taskId: t.id } }))!;
      expect(round).toMatchObject({ status: "APPROVED", approvedCount: 2, activeKey: `round:${round.id}` });
      const completed = (await prisma.outboxEvent.findFirst({ where: { type: "task.completed", aggregateId: t.id } }))!.payload as { review: Record<string, unknown> };
      expect(completed.review).toMatchObject({ enabled: true, approved: true, roundId: round.id, autoApproved: false, waived: false });
    });

    it("hai lượt kéo song song cùng vào REVIEW (cùng expectedVersion): một 200, một 409; vẫn đúng MỘT lượt OPEN và hai review", async () => {
      const t = await newTask("Kéo song song");
      const [a, b] = await Promise.all([move("B", t, "REVIEW"), move("A", t, "REVIEW")]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await prisma.taskReviewRound.count({ where: { taskId: t.id, status: "OPEN" } })).toBe(1);
      expect(await prisma.taskReview.count({ where: { taskId: t.id } })).toBe(2);
    });

    it("rời REVIEW sang IN_PROGRESS khi lượt OPEN → lượt CANCELLED (LEFT_REVIEW), review chờ CANCELLED, reviewState NONE; kéo lại → lượt 2", async () => {
      const t = await toReview();
      const back = await move("B", t, "IN_PROGRESS", t.version);
      expect(back.status).toBe(200);
      const r1 = (await prisma.taskReviewRound.findFirst({ where: { taskId: t.id, round: 1 } }))!;
      expect(r1).toMatchObject({ status: "CANCELLED", closeReason: "LEFT_REVIEW", activeKey: `round:${r1.id}` });
      expect((await reviewsOf(t.id)).every((r) => r.status === "CANCELLED" && r.cancelReason === "ROUND_CLOSED")).toBe(true);
      expect((await detail("B", t.id)).reviewState).toBe("NONE");

      expect((await move("B", t, "REVIEW", back.body.data.version)).status).toBe(200);
      expect(await prisma.taskReviewRound.count({ where: { taskId: t.id, round: 2, status: "OPEN" } })).toBe(1);
    });

    it("mở lại thẻ khỏi DONE: trong ân hạn 10 phút vẫn còn duyệt; quá hạn → cần lượt mới", async () => {
      const t = await toReview();
      for (const r of await reviewsOf(t.id)) await submit(reviewer(r), r, {});
      const done = await move("B", t, "DONE", (await prisma.task.findUnique({ where: { id: t.id } }))!.version);
      expect(done.status).toBe(200);

      const reopened = await move("B", { id: t.id }, "TODO", done.body.data.version);
      expect((await detail("B", t.id)).reviewState).toBe("APPROVED"); // trong ân hạn
      expect((await move("B", { id: t.id }, "DONE", reopened.body.data.version)).status).toBe(200);

      await prisma.task.update({ where: { id: t.id }, data: { completedAt: new Date(Date.now() - 11 * 60_000) } });
      const v = (await prisma.task.findUnique({ where: { id: t.id } }))!.version;
      const reopened2 = await move("B", { id: t.id }, "TODO", v);
      expect(reopened2.status).toBe(200);
      expect((await detail("B", t.id)).reviewState).toBe("NONE");
      const blocked = await move("B", { id: t.id }, "DONE", reopened2.body.data.version);
      expect([blocked.status, blocked.body.error.code]).toEqual([409, "TASK_002"]);
    });
  });

  describe("PM2-31 — nộp chấm", () => {
    it("rubric 4 + 3 + 3, chấm 3 + 3 + 2 → score10 8,0; nộp hai lần cùng Idempotency-Key → một bản ghi, cùng phản hồi; outbox review.submitted đúng một lần cho mỗi consumer", async () => {
      const t = await toReview();
      const [review] = await reviewsOf(t.id);
      const key = { "Idempotency-Key": `review-submit-${newObjectId()}` };

      const first = await submit(reviewer(review), review, { rubricScores: score([3, 3, 2]), feedback: "Gọn" }, key);
      expect(first.status).toBe(200);
      expect(first.body.data.review).toMatchObject({ id: review.id, status: "APPROVED", score10: 8, feedback: "Gọn" });
      expect(first.body.data.round).toMatchObject({ approvedCount: 1, status: "OPEN" });
      expect(first.body.data.task).toMatchObject({ id: t.id, reviewState: "PENDING", columnKind: "REVIEW" });

      const replay = await submit(reviewer(review), review, { rubricScores: score([3, 3, 2]), feedback: "Gọn" }, key);
      expect(replay.status).toBe(200);
      expect(replay.body.data.review.id).toBe(review.id);

      const stored = (await prisma.taskReview.findUnique({ where: { id: review.id } }))!;
      expect(stored).toMatchObject({ status: "APPROVED", score10: 8, version: 2 });
      expect(stored.rubricScores).toEqual(criteria.map((c, i) => ({ criterionId: c.id, score: [3, 3, 2][i] })));
      expect(await prisma.taskReview.count({ where: { taskId: t.id, status: "APPROVED" } })).toBe(1);

      const rows = await prisma.outboxEvent.findMany({ where: { type: "review.submitted", aggregateId: review.id } });
      expect(rows.map((r) => `${r.queue}/${r.jobName}`).sort()).toEqual(["gamification/xp.consume", "reports/contribution.review-fact"]);
      expect(reviewSubmittedSchema.safeParse(rows[0].payload).success).toBe(true);
    });

    it("điểm vượt tối đa / thiếu tiêu chí → 400 REVIEW_002 (details theo tiêu chí); nộp sau khi lượt đóng, hoặc lần hai khác khoá → 409 REVIEW_001; sai version → 409 RES_003", async () => {
      const t = await toReview();
      const [a, b] = await reviewsOf(t.id);
      const bad = await submit(reviewer(a), a, { rubricScores: [{ criterionId: criteria[0].id, score: 5 }, { criterionId: criteria[1].id, score: 3 }] });
      expect(bad.status).toBe(400);
      expect(bad.body.error).toMatchObject({ code: "REVIEW_002", details: { criteria: { [criteria[0].id]: "OUT_OF_RANGE", [criteria[2].id]: "MISSING" } } });

      expect((await submit(reviewer(a), a, {}, { "Idempotency-Key": "k-1-aaaaaaaa" })).status).toBe(200);
      const again = await submit(reviewer(a), a, {}, { "Idempotency-Key": "k-2-bbbbbbbb" });
      expect([again.status, again.body.error.code]).toEqual([409, "REVIEW_001"]);
      const stale = await submit(reviewer(b), b, { expectedVersion: 9 });
      expect([stale.status, stale.body.error.code]).toEqual([409, "RES_003"]);
      // Người kia đóng lượt bằng Yêu cầu sửa → b nộp = REVIEW_001.
      await prisma.taskReview.update({ where: { id: b.id }, data: { status: "CANCELLED", cancelReason: "ROUND_CLOSED" } });
      await prisma.taskReviewRound.updateMany({ where: { taskId: t.id }, data: { status: "CHANGES_REQUESTED", activeKey: `round:${a.roundId}` } });
      const closed = await submit(reviewer(b), b, { expectedVersion: 1 });
      expect([closed.status, closed.body.error.code]).toEqual([409, "REVIEW_001"]);
    });

    it("quyền: người không phải người chấm → 403; GUEST → 404; người làm được thêm vào làm người chấm cũng không nộp được (REVIEW_003)", async () => {
      const t = await toReview();
      const [a] = await reviewsOf(t.id);
      expect((await submit("E", a, {})).status).toBe(403);
      expect((await submit("G", a, {})).status).toBe(404);
      await prisma.task.update({ where: { id: t.id }, data: { assigneeIds: [g.ids.B, a.reviewerId] } });
      const self = await submit(reviewer(a), a, {});
      expect([self.status, self.body.error.code]).toEqual([409, "REVIEW_003"]);
    });
  });

  describe("PM2-29 — Yêu cầu sửa", () => {
    it("thiếu nhận xét → 400 REVIEW_006; có nhận xét → lượt CHANGES_REQUESTED, review chờ CANCELLED, thẻ về IN_PROGRESS (activity MOVED do hệ thống); vào lại REVIEW → lượt 2 ưu tiên người chấm cũ", async () => {
      const t = await toReview();
      const [a, b] = await reviewsOf(t.id);
      expect((await submit(reviewer(a), a, {})).status).toBe(200);

      const missing = await submit(reviewer(b), b, { status: "REQUEST_CHANGES" });
      expect([missing.status, missing.body.error.code]).toEqual([400, "REVIEW_006"]);
      expect((await prisma.taskReview.findUnique({ where: { id: b.id } }))!.status).toBe("PENDING");

      const res = await submit(reviewer(b), b, { status: "REQUEST_CHANGES", rubricScores: score([1, 1, 1]), feedback: "Cần thêm kiểm thử" });
      expect(res.status).toBe(200);
      expect(res.body.data.round).toMatchObject({ status: "CHANGES_REQUESTED" });
      expect(res.body.data.task).toMatchObject({ reviewState: "CHANGES_REQUESTED", columnKind: "IN_PROGRESS", columnId: col("IN_PROGRESS") });
      const stored = await prisma.task.findUnique({ where: { id: t.id } });
      expect(stored).toMatchObject({ columnKind: "IN_PROGRESS", reviewState: "CHANGES_REQUESTED" });
      const moved = await prisma.taskActivity.findFirst({ where: { taskId: t.id, type: "MOVED", actorId: null } });
      expect(moved).toMatchObject({ before: { columnKind: "REVIEW" }, after: { columnKind: "IN_PROGRESS" } });
      expect((await prisma.taskActivity.findMany({ where: { taskId: t.id, type: "REVIEW_SUBMITTED" } })).every((x) => JSON.stringify(x).indexOf("Cần thêm kiểm thử") === -1)).toBe(true);

      const back = await move("B", { id: t.id }, "REVIEW", stored!.version);
      expect(back.status).toBe(200);
      const r2 = (await prisma.taskReviewRound.findFirst({ where: { taskId: t.id, round: 2 } }))!;
      expect((await prisma.taskReview.findMany({ where: { roundId: r2.id } })).map(reviewer).sort()).toEqual(["C", "D"]);
    });
  });

  describe("PM2-32 — ai thấy điểm/nhận xét", () => {
    it("MEMBER khác: không có score10/feedback; người chấm chưa nộp không thấy kết quả người kia; người làm và OWNER thấy đủ", async () => {
      const t = await toReview();
      const [a, b] = await reviewsOf(t.id);
      await submit(reviewer(a), a, { rubricScores: score([4, 3, 3]), feedback: "Bí mật nhận xét" });

      const other = await api("get", `/tasks/${t.id}/reviews`, as("F"));
      expect(other.status).toBe(200);
      expect(JSON.stringify(other.body.data)).not.toMatch(/Bí mật nhận xét|score10|rubricScores|feedback/);
      expect(other.body.data.currentRound.reviews.find((r: { id: string }) => r.id === a.id).status).toBe("SUBMITTED");
      expect(other.body.data.currentRound).toMatchObject({ approvedCount: 1, requiredReviews: 2 });

      const pending = await api("get", `/tasks/${t.id}/reviews`, as(reviewer(b)));
      expect(JSON.stringify(pending.body.data.currentRound.reviews.find((r: { id: string }) => r.id === a.id))).not.toContain("Bí mật");
      expect(pending.body.data.myReview).toMatchObject({ id: b.id, status: "PENDING", version: 1 });
      expect(pending.body.data.myPermissions).toMatchObject({ submit: true, reassign: false, waive: false });

      for (const who of ["B", "A"]) {
        const view = await api("get", `/tasks/${t.id}/reviews`, as(who));
        expect(view.body.data.currentRound.reviews.find((r: { id: string }) => r.id === a.id)).toMatchObject({ status: "APPROVED", score10: 10, feedback: "Bí mật nhận xét" });
      }
      expect((await api("get", `/tasks/${t.id}/reviews`, as("A"))).body.data.myPermissions).toMatchObject({ reassign: true, waive: true });
      expect((await api("get", `/tasks/${t.id}/reviews`, as("G"))).status).toBe(404);
    });
  });

  describe("giao lại · miễn chấm · hộp Cần chấm của tôi", () => {
    it("OWNER giao lại thủ công: review cũ REASSIGNED (MANUAL), audit task-review.reassign; MEMBER 403; toUserId là người làm → 400", async () => {
      const t = await toReview();
      const [a] = await reviewsOf(t.id);
      const reason = "Bạn chấm cũ đang bận thi";
      expect((await api("post", `/task-reviews/${a.id}/reassign`, as("F"), { reason })).status).toBe(403);
      const bad = await api("post", `/task-reviews/${a.id}/reassign`, as("A"), { toUserId: g.ids.B, reason });
      expect(bad.status).toBe(400); // B là người làm
      const outsidePool = await api("post", `/task-reviews/${a.id}/reassign`, as("A"), { toUserId: g.ids.E, reason });
      expect([outsidePool.status, outsidePool.body.error.details.toUserId?.length]).toEqual([400, 1]); // E không thuộc nhóm người chấm [C, D]
      await putConfig({ enabled: true, requiredReviews: 2, rubric: criteria }); // bỏ giới hạn nhóm người chấm

      const res = await api("post", `/task-reviews/${a.id}/reassign`, as("A"), { toUserId: g.ids.E, reason });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ cancelled: { id: a.id, status: "REASSIGNED", cancelReason: "MANUAL" }, assigned: { status: "PENDING", reviewer: { id: g.ids.E } } });
      expect(await prisma.taskReview.findUnique({ where: { id: a.id } })).toMatchObject({ status: "REASSIGNED", replacedById: res.body.data.assigned.id });
      const audit = await prisma.auditLog.findFirst({ where: { workspaceId: g.workspaceId, action: "task-review.reassign" } });
      expect(audit).toMatchObject({ actorId: g.ids.A, targetType: "TaskReview", targetId: a.id, reason });
    });

    it("OWNER miễn chấm: lượt WAIVED, audit task-review.waive, thẻ sang DONE được (task.completed.review.waived); REVIEW_007 khi không còn lượt mở; MEMBER 403", async () => {
      const t = await toReview();
      const reason = "Thẻ khẩn cấp, chủ nhóm đã kiểm tra";
      expect((await api("post", `/tasks/${t.id}/review/waive`, as("F"), { reason })).status).toBe(403);
      const res = await api("post", `/tasks/${t.id}/review/waive`, as("A"), { reason });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: "WAIVED", waived: { by: { id: g.ids.A }, reason } });
      expect(await prisma.auditLog.count({ where: { workspaceId: g.workspaceId, action: "task-review.waive" } })).toBe(1);
      const again = await api("post", `/tasks/${t.id}/review/waive`, as("A"), { reason });
      expect([again.status, again.body.error.code]).toEqual([409, "REVIEW_007"]);

      const done = await move("B", { id: t.id }, "DONE", (await prisma.task.findUnique({ where: { id: t.id } }))!.version);
      expect(done.status).toBe(200);
      const completed = (await prisma.outboxEvent.findFirst({ where: { type: "task.completed", aggregateId: t.id } }))!.payload as { review: Record<string, unknown> };
      expect(completed.review).toMatchObject({ approved: true, waived: true });
    });

    it("GET /me/reviews: PENDING của tôi (kèm thẻ, bảng, nhóm, tiến độ), SUBMITTED sau khi nộp; người khác không thấy; nhóm đã rời thì ẩn", async () => {
      const t = await toReview("Thẻ trong hộp");
      const [a] = await reviewsOf(t.id);
      const mine = await api("get", `/me/reviews?status=PENDING`, as(reviewer(a)));
      expect(mine.status).toBe(200);
      expect(mine.body.data).toEqual([
        expect.objectContaining({
          reviewId: a.id,
          status: "PENDING",
          task: expect.objectContaining({ id: t.id, title: "Thẻ trong hộp", boardId: board.id, boardName: "Đồ án chấm chéo", workspaceId: g.workspaceId, columnKind: "REVIEW" }),
          round: { round: 1, approvedCount: 0, requiredReviews: 2 },
        }),
      ]);
      expect(mine.body.meta).toMatchObject({ hasMore: false, nextCursor: null });
      expect((await api("get", `/me/reviews`, as("F"))).body.data).toEqual([]);

      await submit(reviewer(a), a, {});
      expect((await api("get", `/me/reviews?status=PENDING`, as(reviewer(a)))).body.data).toEqual([]);
      const done = await api("get", `/me/reviews?status=SUBMITTED`, as(reviewer(a)));
      expect(done.body.data[0]).toMatchObject({ reviewId: a.id, status: "APPROVED" });

      await prisma.workspaceMembership.updateMany({ where: { workspaceId: g.workspaceId, userId: a.reviewerId }, data: { status: "LEFT" } });
      expect((await api("get", `/me/reviews?status=SUBMITTED`, as(reviewer(a)))).body.data).toEqual([]);
      expect((await api("get", `/me/reviews?status=NOPE`, as("A"))).status).toBe(400);
    });
  });

  describe("bật chấm chéo giữa chừng (job review.backfill) · thống kê admin", () => {
    it("bật khi thẻ đã ở REVIEW → job mở lượt (một lần, idempotent); tắt → job huỷ lượt và thẻ sang DONE không bị chặn", async () => {
      await putConfig({ enabled: false, requiredReviews: 2, rubric: criteria, reviewerPool: [g.ids.C, g.ids.D] });
      const t = await toReview("Đã ở REVIEW từ trước");
      expect(await prisma.taskReviewRound.count({ where: { taskId: t.id } })).toBe(0);

      const on = await putConfig({ enabled: true, requiredReviews: 2, rubric: criteria, reviewerPool: [g.ids.C, g.ids.D] });
      const backfill = getProjectsContainer().review.backfill;
      expect(await backfill.run({ boardId: board.id, version: on.body.data.version, mode: "ENABLE" })).toEqual({ opened: 1, cancelled: 0 });
      expect(await backfill.run({ boardId: board.id, version: on.body.data.version, mode: "ENABLE" })).toEqual({ opened: 0, cancelled: 0 });
      expect(await prisma.taskReviewRound.count({ where: { taskId: t.id, status: "OPEN" } })).toBe(1);
      expect((await detail("F", t.id)).reviewState).toBe("PENDING");

      const off = await putConfig({ enabled: false, requiredReviews: 2, rubric: criteria, reviewerPool: [g.ids.C, g.ids.D] });
      expect(await backfill.run({ boardId: board.id, version: off.body.data.version, mode: "DISABLE" })).toEqual({ opened: 0, cancelled: 1 });
      expect(await prisma.taskReviewRound.findFirst({ where: { taskId: t.id } })).toMatchObject({ status: "CANCELLED", closeReason: "REVIEW_DISABLED" });
      const done = await move("B", { id: t.id }, "DONE", (await prisma.task.findUnique({ where: { id: t.id } }))!.version);
      expect(done.status).toBe(200);
    });

    it("GET /admin/workspaces/:id/review-stats: chỉ số đếm + tên bảng, KHÔNG có tên người/điểm/nhận xét/tiêu đề thẻ; cần workspace:view; nhóm lạ 404", async () => {
      const t = await toReview("Tiêu đề thẻ bí mật");
      const [a] = await reviewsOf(t.id);
      await submit(reviewer(a), a, { feedback: "Nhận xét bí mật" });

      const admin = await api("get", `/admin/workspaces/${g.workspaceId}/review-stats?days=30`, tokenFor(newObjectId(), "admin"));
      expect(admin.status).toBe(200);
      expect(admin.body.data).toMatchObject({ openRounds: 1, pendingReviews: 1, overdue72h: 0, roundsInPeriod: 1, autoApprovedRounds: 0, waivedRounds: 0, byBoard: [{ boardId: board.id, boardName: "Đồ án chấm chéo", enabled: true, openRounds: 1 }] });
      expect(typeof admin.body.data.medianHoursToSubmit).toBe("number");
      expect(JSON.stringify(admin.body.data)).not.toMatch(/bí mật|Người |score|feedback|reviewerId/);
      expect((await api("get", `/admin/workspaces/${g.workspaceId}/review-stats`, tokenFor(g.ids.A, "user"))).status).toBe(403);
      expect((await api("get", `/admin/workspaces/${newObjectId()}/review-stats`, tokenFor(newObjectId(), "admin"))).status).toBe(404);
      expect((await api("get", `/admin/workspaces/${g.workspaceId}/review-stats?days=0`, tokenFor(newObjectId(), "admin"))).status).toBe(400);
    });
  });
});
