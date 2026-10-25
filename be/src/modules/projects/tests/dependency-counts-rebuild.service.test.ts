// Unit-test redis mock mặc định (`setup.ts`) thiếu `incr/expire` mà `permissionService.bumpVersion` cần.
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import type { AuthUser } from "../../../core/types/express";
import type { Board } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import { DependencyCountsRebuildService } from "../services/dependency-counts-rebuild.service";
import { ServiceHarness } from "./support/service-harness";

let h: ServiceHarness;
let owner: AuthUser;
let member: AuthUser;
let board: Board;
let a: Task;
let b: Task;
let c: Task;

const fresh = async (t: Task): Promise<Task> => (await h.tasks.findById(t.id)) as Task;
const counts = async (t: Task) => {
  const x = await fresh(t);
  return [x.blockedByCount ?? 0, x.blockingCount ?? 0];
};
const updatedIds = (): string[] => h.emitter.of("task:updated").map((e) => (e.payload as { task: { id: string } }).task.id);

beforeEach(async () => {
  h = new ServiceHarness();
  owner = h.addUser("OWNER");
  member = h.addUser("MEMBER");
  board = await h.createBoard(owner);
  [a, b, c] = [await h.addTask(member, board, "A"), await h.addTask(member, board, "B"), await h.addTask(member, board, "C")];
  await h.dependencyService.add(member, b.id, a.id); // A → B
  await h.dependencyService.add(member, c.id, b.id); // B → C
  h.emitter.events.length = 0;
});

describe("DependencyCountsRebuildService — cron dependency-counts.rebuild (p4-04 be.md §5.8)", () => {
  it("bộ đếm đã đúng → không ghi gì, không phát sự kiện", async () => {
    const versions = (await Promise.all([a, b, c].map(fresh))).map((t) => t.version);
    expect(await h.countsRebuild.rebuildAll()).toEqual({ boards: 1, fixed: 0, failed: 0 });
    expect((await Promise.all([a, b, c].map(fresh))).map((t) => t.version)).toEqual(versions);
    expect(h.emitter.events).toHaveLength(0);
  });

  it("sửa bộ đếm lệch (kể cả thẻ mồ côi không còn cạnh nào) + phát task:updated dependencies; chạy lần hai không sửa nữa", async () => {
    const orphan = await h.addTask(member, board, "Mồ côi");
    h.setTask(a.id, { blockedByCount: 4, blockingCount: 0 }); // A đúng phải [0, 1]
    h.setTask(b.id, { blockedByCount: 1, blockingCount: 9 }); // B đúng [1, 1]
    h.setTask(orphan.id, { blockedByCount: 2, blockingCount: 3 }); // không có cạnh nào → [0, 0]
    // C giữ nguyên (đúng [1, 0])

    expect(await h.countsRebuild.rebuildAll()).toEqual({ boards: 1, fixed: 3, failed: 0 });
    expect(await counts(a)).toEqual([0, 1]);
    expect(await counts(b)).toEqual([1, 1]);
    expect(await counts(c)).toEqual([1, 0]);
    expect(await counts(orphan)).toEqual([0, 0]);
    expect(updatedIds().sort()).toEqual([a.id, b.id, orphan.id].sort());
    expect(h.emitter.of("task:updated").every((e) => (e.payload as { changed: string[] }).changed[0] === "dependencies")).toBe(true);

    h.emitter.events.length = 0;
    expect(await h.countsRebuild.rebuildAll()).toEqual({ boards: 1, fixed: 0, failed: 0 });
    expect(h.emitter.events).toHaveLength(0);
  });

  it("thẻ trước DONE không tính vào blockedByCount; thẻ đã xoá không tính; cạnh tới thẻ đã xoá bị bỏ qua", async () => {
    h.setTask(a.id, { columnKind: "DONE" });
    h.setTask(c.id, { deletedAt: new Date() });
    // Bộ đếm cũ còn sót theo trạng thái trước đó (A chưa DONE, C chưa xoá).
    await h.countsRebuild.rebuildAll();
    expect(await counts(b)).toEqual([0, 0]); // A(DONE) không chặn B; C(đã xoá) không còn bị B chặn
    expect(await counts(a)).toEqual([0, 1]); // A vẫn chặn B (B chưa DONE)
  });

  it("nhiều bảng, phân trang theo bảng: đối soát đủ mọi bảng có cạnh; lỗi một bảng không dừng cả job", async () => {
    const other = await h.boardService.create(owner, h.workspaceId, { name: "Bảng 2" });
    const otherBoard = { ...board, id: other.id } as Board;
    const [x, y] = [await h.addTask(member, otherBoard, "X"), await h.addTask(member, otherBoard, "Y")];
    await h.dependencyService.add(member, y.id, x.id);
    h.setTask(x.id, { blockingCount: 7 });
    h.setTask(a.id, { blockingCount: 7 });

    const paged = new DependencyCountsRebuildService({ dependencies: h.dependencyRepo, emitter: h.emitter, directory: h.directory, boardPageSize: 1 });
    expect(await paged.rebuildAll()).toEqual({ boards: 2, fixed: 2, failed: 0 });
    expect(await counts(x)).toEqual([0, 1]);
    expect(await counts(a)).toEqual([0, 1]);

    // Một bảng lỗi (đọc cạnh ném) → đếm failed, bảng còn lại vẫn được xử lý.
    h.setTask(a.id, { blockingCount: 5 });
    h.setTask(x.id, { blockingCount: 5 });
    const original = h.dependencyRepo.edgesOfBoard.bind(h.dependencyRepo);
    const failingBoard = [board.id, other.id].sort()[0];
    jest.spyOn(h.dependencyRepo, "edgesOfBoard").mockImplementation((boardId, limit) => (boardId === failingBoard ? Promise.reject(new Error("đọc lỗi")) : original(boardId, limit)));
    const summary = await paged.rebuildAll();
    expect(summary).toMatchObject({ boards: 2, fixed: 1, failed: 1 });
  });

  it("không có cạnh nào (kho rỗng) → không làm gì", async () => {
    h.dependencyRepo.edges.length = 0;
    expect(await h.countsRebuild.rebuildAll()).toEqual({ boards: 0, fixed: 0, failed: 0 });
  });
});
