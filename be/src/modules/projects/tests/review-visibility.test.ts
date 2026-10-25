import type { TaskReview, TaskReviewRound } from "../entities/task-review.interface";
import { presentRound } from "../services/review/review.presenter";
import { canSeeResults, visibilityOf, type ReviewViewer } from "../services/review/review-visibility";

const NOW = new Date("2026-09-25T10:00:00Z");
const oid = (n: number): string => n.toString(16).padStart(24, "0");
const ids = { task: oid(1), board: oid(2), ws: oid(3), round: oid(4), lan: oid(10), minh: oid(11), an: oid(12), other: oid(13), owner: oid(14) };

const round = (status: TaskReviewRound["status"]): TaskReviewRound => ({
  id: ids.round,
  taskId: ids.task,
  boardId: ids.board,
  workspaceId: ids.ws,
  round: 1,
  status,
  activeKey: status === "OPEN" ? `task:${ids.task}` : `round:${ids.round}`,
  requiredReviews: 2,
  configuredReviews: 2,
  assignedCount: 2,
  approvedCount: 1,
  rubricSnapshot: [],
  shortage: false,
  autoApproved: false,
  openedBy: null,
  openedAt: NOW,
  closedAt: status === "OPEN" ? null : NOW,
  closeReason: null,
  waivedBy: null,
  waiveReason: null,
  version: 1,
});

const review = (reviewerId: string, status: TaskReview["status"], extra: Partial<TaskReview> = {}): TaskReview => ({
  id: oid(reviewerId === ids.lan ? 20 : 21),
  roundId: ids.round,
  taskId: ids.task,
  boardId: ids.board,
  workspaceId: ids.ws,
  reviewerId,
  status,
  assignedBy: null,
  assignedAt: NOW,
  submittedAt: status === "APPROVED" || status === "REQUEST_CHANGES" ? NOW : null,
  score10: status === "APPROVED" ? 8.5 : null,
  rubricScores: [],
  feedback: status === "APPROVED" ? "Tốt lắm" : null,
  cancelReason: null,
  replacedById: null,
  version: 2,
  ...extra,
});

const viewer = (userId: string, over: Partial<ReviewViewer> = {}): ReviewViewer => ({ userId, isAdmin: false, isAssignee: false, ...over });
const lanDone = review(ids.lan, "APPROVED");
const minhPending = review(ids.minh, "PENDING");

describe("review-visibility — ai thấy điểm/nhận xét (PM2-32)", () => {
  it("OWNER/ADMIN và người làm luôn thấy; MEMBER khác không thấy", () => {
    const open = round("OPEN");
    expect(canSeeResults(viewer(ids.owner, { isAdmin: true }), open, [lanDone, minhPending])).toBe(true);
    expect(canSeeResults(viewer(ids.an, { isAssignee: true }), open, [lanDone, minhPending])).toBe(true);
    expect(canSeeResults(viewer(ids.other), open, [lanDone, minhPending])).toBe(false);
  });

  it("người chấm CHƯA nộp không thấy kết quả người kia; nộp rồi (hoặc lượt đã đóng) thì thấy", () => {
    expect(canSeeResults(viewer(ids.minh), round("OPEN"), [lanDone, minhPending])).toBe(false);
    expect(canSeeResults(viewer(ids.lan), round("OPEN"), [lanDone, minhPending])).toBe(true);
    // Lượt đóng do người kia Yêu cầu sửa: review của Minh bị huỷ nhưng lượt đã đóng → Minh xem được.
    expect(canSeeResults(viewer(ids.minh), round("CHANGES_REQUESTED"), [lanDone, review(ids.minh, "CANCELLED")])).toBe(true);
  });

  it("presentRound: MEMBER khác KHÔNG có score10/feedback/rubricScores và không thấy quyết định (status che thành SUBMITTED)", () => {
    const dto = presentRound(round("OPEN"), [lanDone, minhPending], new Map(), viewer(ids.other));
    const lan = dto.reviews.find((r) => r.reviewer.id === ids.lan)!;
    expect(lan.status).toBe("SUBMITTED");
    expect(lan).not.toHaveProperty("score10");
    expect(lan).not.toHaveProperty("feedback");
    expect(lan).not.toHaveProperty("rubricScores");
    expect(JSON.stringify(dto)).not.toContain("Tốt lắm");
    expect(dto.reviews.find((r) => r.reviewer.id === ids.minh)!.status).toBe("PENDING");
    expect(dto.approvedCount).toBe(1); // số đếm tổng vẫn hiện ("1/2 duyệt")
  });

  it("presentRound: người chấm chưa nộp thấy review CỦA MÌNH nhưng không thấy kết quả của Lan", () => {
    const dto = presentRound(round("OPEN"), [lanDone, minhPending], new Map(), viewer(ids.minh));
    expect(dto.reviews.find((r) => r.reviewer.id === ids.lan)).toMatchObject({ status: "SUBMITTED" });
    expect(dto.reviews.find((r) => r.reviewer.id === ids.lan)).not.toHaveProperty("score10");
    expect(dto.reviews.find((r) => r.reviewer.id === ids.minh)).toMatchObject({ status: "PENDING" });
  });

  it("presentRound: OWNER/người làm thấy đủ điểm + nhận xét + quyết định thật", () => {
    for (const v of [viewer(ids.owner, { isAdmin: true }), viewer(ids.an, { isAssignee: true }), viewer(ids.lan)]) {
      const lan = presentRound(round("OPEN"), [lanDone, minhPending], new Map(), v).reviews.find((r) => r.reviewer.id === ids.lan)!;
      expect(lan).toMatchObject({ status: "APPROVED", score10: 8.5, feedback: "Tốt lắm" });
    }
  });

  it("visibilityOf: review của CHÍNH viewer luôn hiện trạng thái thật", () => {
    expect(visibilityOf(viewer(ids.lan), false, lanDone)).toEqual({ status: "APPROVED", showResult: true });
    expect(visibilityOf(viewer(ids.other), false, lanDone)).toEqual({ status: "SUBMITTED", showResult: false });
    expect(visibilityOf(viewer(ids.other), false, minhPending)).toEqual({ status: "PENDING", showResult: false });
  });

  it("lượt bị miễn/huỷ: hiển thị lý do, không lộ điểm cho người ngoài", () => {
    const waived = { ...round("WAIVED"), waivedBy: ids.owner, waiveReason: "Thẻ khẩn cấp cần giao ngay" };
    const dto = presentRound(waived, [review(ids.lan, "CANCELLED", { cancelReason: "MANUAL" })], new Map([[ids.owner, { id: ids.owner, name: "Chủ nhóm", avatarUrl: null }]]), viewer(ids.other));
    expect(dto.waived).toEqual({ by: { id: ids.owner, name: "Chủ nhóm", avatarUrl: null }, reason: "Thẻ khẩn cấp cần giao ngay" });
    expect(dto.reviews[0]).toMatchObject({ status: "CANCELLED", cancelReason: "MANUAL" });
  });
});
