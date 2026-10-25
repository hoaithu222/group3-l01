import type { ReviewerLoad } from "../entities/task-review.interface";
import { pickReviewers, rankReviewers, tieBreakHash } from "../services/review/reviewer-selector";

const load = (userId: string, pending: number, lastAssignedAt: string | null = null): [string, ReviewerLoad] => [
  userId,
  { userId, pending, lastAssignedAt: lastAssignedAt ? new Date(lastAssignedAt) : null },
];
const loads = (...entries: [string, ReviewerLoad][]): Map<string, ReviewerLoad> => new Map(entries);
const TASK = "66f1a2b3c4d5e6f708192a3b";

describe("reviewer-selector — chọn người chấm cân tải (PM2-05)", () => {
  it("PM2-05: Bình chờ 3 lượt, Chi 0, Dũng 1, Em 0 (An là người làm đã bị loại) → chọn Chi và Em", () => {
    const candidates = ["binh", "chi", "dung", "em"]; // An đã bị lọc khỏi ứng viên bởi nơi gọi
    const picked = pickReviewers({ candidates, loads: loads(load("binh", 3), load("dung", 1)), taskId: TASK }, 2);
    expect(new Set(picked)).toEqual(new Set(["chi", "em"]));
  });

  it("thứ tự: tải tăng dần → lần được giao gần nhất cũ hơn (chưa từng = trước nhất)", () => {
    const ranked = rankReviewers({
      candidates: ["a", "b", "c", "d"],
      loads: loads(load("a", 1, "2026-09-20T00:00:00Z"), load("b", 1, "2026-09-10T00:00:00Z"), load("c", 0, "2026-09-24T00:00:00Z")),
      taskId: TASK,
    });
    // d chưa từng có dòng nào (tải 0, chưa từng được giao) ⇒ trước c (tải 0 nhưng vừa được giao); rồi b (cũ hơn) trước a.
    expect(ranked).toEqual(["d", "c", "b", "a"]);
  });

  it("ưu tiên người chấm ở vòng trước (khi mở vòng mới) dù tải cao hơn", () => {
    const ranked = rankReviewers({
      candidates: ["lan", "minh", "chi"],
      loads: loads(load("lan", 5), load("minh", 4), load("chi", 0)),
      previousReviewers: new Set(["lan", "minh"]),
      taskId: TASK,
    });
    expect(ranked.slice(0, 2).sort()).toEqual(["lan", "minh"]);
    expect(ranked[0]).toBe("minh"); // trong nhóm ưu tiên vẫn xếp theo tải
    expect(ranked[2]).toBe("chi");
  });

  it("hoà hoàn toàn → băm sha1(taskId+userId) ổn định (không phụ thuộc thứ tự danh sách đầu vào)", () => {
    const a = rankReviewers({ candidates: ["u1", "u2", "u3", "u4"], loads: new Map(), taskId: TASK });
    const b = rankReviewers({ candidates: ["u4", "u3", "u2", "u1"], loads: new Map(), taskId: TASK });
    expect(a).toEqual(b);
    const byHash = ["u1", "u2", "u3", "u4"].sort((x, y) => (tieBreakHash(TASK, x) < tieBreakHash(TASK, y) ? -1 : 1));
    expect(a).toEqual(byHash);
    // Thẻ khác → thứ tự băm khác (không thiên vị cùng một người cho mọi thẻ).
    const other = rankReviewers({ candidates: ["u1", "u2", "u3", "u4"], loads: new Map(), taskId: "66f1a2b3c4d5e6f708192a3c" });
    expect(other).not.toEqual(a);
  });

  it("bỏ ứng viên trùng; n lớn hơn số ứng viên → trả hết; n = 0 → rỗng", () => {
    expect(pickReviewers({ candidates: ["a", "a", "b"], loads: new Map(), taskId: TASK }, 5)).toHaveLength(2);
    expect(pickReviewers({ candidates: ["a", "b"], loads: new Map(), taskId: TASK }, 0)).toEqual([]);
    expect(pickReviewers({ candidates: [], loads: new Map(), taskId: TASK }, 2)).toEqual([]);
  });
});
