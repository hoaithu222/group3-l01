import { InMemoryContributionSnapshotRepository } from "../repositories/contribution-snapshot.repository.inmemory";
import type { ContributionSnapshotRow } from "../entities/contribution.interface";
import { ContributionReadService } from "../services/contribution-read.service";
import { oid } from "./support/fakes";

const row = (over: Partial<ContributionSnapshotRow>): ContributionSnapshotRow => ({
  workspaceId: oid(1),
  boardId: oid(2),
  userId: oid(9),
  periodKey: "ALL",
  storyPointsDone: 5,
  tasksDone: 2,
  unestimatedTasks: 0,
  tasksWithDue: 0,
  tasksOnTime: 0,
  tasksLate: 0,
  reviewCount: 0,
  peerScoreAvg: null,
  components: { points: 1, onTime: null, peer: null },
  weightsUsed: { points: 100, onTime: 0, peer: 0 },
  score: 80,
  share: 50,
  teamTasksDone: 4,
  teamStoryPoints: 10,
  formulaVersion: 1,
  computedAt: new Date(),
  ...over,
});

describe("ContributionReadService — cổng đọc cho p6-07/p6-08 (careerScore)", () => {
  const setup = async (rows: ContributionSnapshotRow[]) => {
    const snapshots = new InMemoryContributionSnapshotRepository();
    for (const boardId of new Set(rows.map((r) => r.boardId))) await snapshots.replaceForBoard(boardId, rows.filter((r) => r.boardId === boardId));
    return new ContributionReadService(snapshots);
  };

  it("memberScore: trung bình điểm/% các bảng có thẻ hoàn thành trong nhóm; bỏ bảng người này chưa làm gì", async () => {
    const svc = await setup([row({ boardId: oid(2), score: 91, share: 58.7 }), row({ boardId: oid(3), score: 70, share: 40 }), row({ boardId: oid(4), score: 0, share: 0, tasksDone: 0 })]);
    expect(await svc.memberScore(oid(1), oid(9))).toEqual({ scoreX10: 805, shareX10: 494, boards: 2 });
    expect(await svc.memberScore(oid(1), oid(8))).toBeNull();
    expect(await svc.memberScore(oid(77), oid(9))).toBeNull();
  });

  it("careerScore: trung bình theo NHÓM (mỗi nhóm một phiếu) nên nhóm nhiều bảng không lấn át nhóm khác; null khi chưa đủ dữ liệu", async () => {
    const svc = await setup([
      row({ workspaceId: oid(1), boardId: oid(2), score: 90 }),
      row({ workspaceId: oid(1), boardId: oid(3), score: 70 }), // nhóm 1: trung bình 80
      row({ workspaceId: oid(5), boardId: oid(4), score: 60 }), // nhóm 5: 60
    ]);
    expect(await svc.careerScore(oid(9))).toEqual({ pctX10: 700, workspaces: 2 });
    expect(await svc.careerScore(oid(8))).toBeNull();
  });

  it("chỉ đọc snapshot kỳ ALL (kỳ tháng không được tính)", async () => {
    const svc = await setup([row({ periodKey: "M:2026-09", score: 10 }), row({ periodKey: "ALL", score: 50 })]);
    expect(await svc.careerScore(oid(9))).toEqual({ pctX10: 500, workspaces: 1 });
  });
});
