import { LIMITS } from "../../../core/constants/limits";
import { putReviewConfigSchema } from "../dtos";
import {
  CRITERION_ID_REGEX,
  assignCriterionIds,
  boardReviewConfigSchema,
  defaultBoardReview,
  newCriterionId,
  parseBoardReview,
  rubricTotal,
} from "../services/review/review-config.schema";
import { FALLBACK_REVIEW_DEFAULTS, snapshotForNewBoard } from "../services/review/review-defaults";

const oid = (n: number): string => n.toString(16).padStart(24, "0");

describe("parseBoardReview — đọc Board.review thô", () => {
  it("null/thiếu/không phải object → mặc định TẮT, 2 lượt duyệt, không rubric", () => {
    for (const raw of [null, undefined, "x", 3, []]) {
      expect(parseBoardReview(raw)).toEqual({ enabled: false, requiredReviews: 2, rubric: [], preventSelfReview: true, autoCompleteOnApproval: false });
    }
  });

  it("chuẩn hoá: kẹp requiredReviews 1–5, bỏ tiêu chí hỏng, giữ nhóm người chấm hợp lệ, preventSelfReview luôn true", () => {
    const parsed = parseBoardReview({
      enabled: true,
      requiredReviews: 99,
      preventSelfReview: false,
      autoCompleteOnApproval: true,
      reviewerPool: [oid(1), "khong-phai-id", oid(1), oid(2)],
      rubric: [
        { id: "r_abc123", label: "Đúng yêu cầu", maxScore: 5 },
        { id: "sai-id", label: "Bỏ", maxScore: 5 },
        { id: "r_abc124", label: "  ", maxScore: 5 },
        { id: "r_abc125", label: "Điểm 0", maxScore: 0 },
        { id: "r_abc126", label: "Mô tả rỗng", description: "", maxScore: 2 },
      ],
    });
    expect(parsed).toEqual({
      enabled: true,
      requiredReviews: LIMITS.review.requiredMax,
      rubric: [
        { id: "r_abc123", label: "Đúng yêu cầu", description: null, maxScore: 5 },
        { id: "r_abc126", label: "Mô tả rỗng", description: null, maxScore: 2 },
      ],
      preventSelfReview: true,
      reviewerPool: [oid(1), oid(2)],
      autoCompleteOnApproval: true,
    });
  });

  it("requiredReviews không phải số → dùng giá trị dự phòng", () => {
    expect(parseBoardReview({ enabled: true, requiredReviews: "2" }, 3).requiredReviews).toBe(3);
    expect(parseBoardReview({ enabled: true, requiredReviews: 0 }).requiredReviews).toBe(1);
  });
});

describe("boardReviewConfigSchema / putReviewConfigSchema (Zod)", () => {
  const base = { enabled: true, requiredReviews: 2, rubric: [], expectedVersion: 3 };

  it("nhận cấu hình hợp lệ và điền mặc định (preventSelfReview, autoCompleteOnApproval, rubric)", () => {
    const parsed = putReviewConfigSchema.parse({ enabled: true, requiredReviews: 1, expectedVersion: 1 });
    expect(parsed).toMatchObject({ preventSelfReview: true, autoCompleteOnApproval: false, rubric: [] });
  });

  it("requiredReviews 0 hoặc 6 → lỗi; preventSelfReview=false bị từ chối", () => {
    expect(putReviewConfigSchema.safeParse({ ...base, requiredReviews: 0 }).success).toBe(false);
    expect(putReviewConfigSchema.safeParse({ ...base, requiredReviews: LIMITS.review.requiredMax + 1 }).success).toBe(false);
    expect(putReviewConfigSchema.safeParse({ ...base, preventSelfReview: false }).success).toBe(false);
  });

  it("rubric: ≤ 10 tiêu chí, tên ≤ 80, mô tả ≤ 300, điểm tối đa nguyên 1–100, id đúng dạng r_xxxxxx", () => {
    const criterion = (over: Record<string, unknown> = {}) => ({ label: "Tiêu chí", maxScore: 5, ...over });
    const ok = (rubric: unknown[]) => boardReviewConfigSchema.safeParse({ enabled: true, requiredReviews: 2, rubric }).success;
    expect(ok(Array.from({ length: 10 }, () => criterion()))).toBe(true);
    expect(ok(Array.from({ length: 11 }, () => criterion()))).toBe(false);
    expect(ok([criterion({ label: "" })])).toBe(false);
    expect(ok([criterion({ label: "x".repeat(81) })])).toBe(false);
    expect(ok([criterion({ description: "y".repeat(301) })])).toBe(false);
    expect(ok([criterion({ maxScore: 0 })])).toBe(false);
    expect(ok([criterion({ maxScore: 101 })])).toBe(false);
    expect(ok([criterion({ maxScore: 2.5 })])).toBe(false);
    expect(ok([criterion({ id: "sai" })])).toBe(false);
    expect(ok([criterion({ id: "r_Ab1Z9k", description: null })])).toBe(true);
  });

  it("reviewerPool ≤ 200 ObjectId", () => {
    expect(boardReviewConfigSchema.safeParse({ ...base, reviewerPool: ["x"] }).success).toBe(false);
    expect(boardReviewConfigSchema.safeParse({ ...base, reviewerPool: [oid(1)] }).success).toBe(true);
  });
});

describe("assignCriterionIds — id tiêu chí ổn định", () => {
  it("cấp id mới cho tiêu chí chưa có id (đúng dạng, không trùng), giữ id đã có", () => {
    const { rubric, problems } = assignCriterionIds(
      [
        { id: "r_AAAAAA", label: "Giữ", maxScore: 4 },
        { label: "Mới", description: "Mô tả", maxScore: 6 },
      ],
      new Set(["r_AAAAAA", "r_BBBBBB"])
    );
    expect(problems).toEqual([]);
    expect(rubric[0]).toEqual({ id: "r_AAAAAA", label: "Giữ", description: null, maxScore: 4 });
    expect(rubric[1].id).toMatch(CRITERION_ID_REGEX);
    expect(["r_AAAAAA", "r_BBBBBB"]).not.toContain(rubric[1].id);
    expect(rubricTotal(rubric)).toBe(10);
  });

  it("id trùng trong yêu cầu hoặc id không còn trong cấu hình hiện tại → problems (service đổi thành REVIEW_004)", () => {
    const dup = assignCriterionIds([{ id: "r_AAAAAA", label: "a", maxScore: 1 }, { id: "r_AAAAAA", label: "b", maxScore: 1 }], new Set(["r_AAAAAA"]));
    expect(dup.problems.map((p) => p.message)).toEqual(["Mã tiêu chí bị trùng"]);
    const unknown = assignCriterionIds([{ id: "r_ZZZZZZ", label: "a", maxScore: 1 }], new Set(["r_AAAAAA"]));
    expect(unknown.problems.map((p) => p.message)).toEqual(["Tiêu chí không còn trong cấu hình hiện tại"]);
  });

  it("newCriterionId không trả id đã dùng", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 200; i++) taken.add(newCriterionId(taken));
    expect(taken.size).toBe(200);
  });
});

describe("snapshotForNewBoard — mặc định hệ thống chụp vào bảng mới", () => {
  it("dùng enabledForNewBoards + requiredReviews; rubric trống", () => {
    expect(snapshotForNewBoard({ ...FALLBACK_REVIEW_DEFAULTS, enabledForNewBoards: true, requiredReviews: 3 })).toEqual(defaultBoardReview(3, true));
    expect(snapshotForNewBoard(FALLBACK_REVIEW_DEFAULTS)).toEqual(defaultBoardReview(2, false));
  });
});
