// Unit-test redis mock mặc định (`setup.ts`) thiếu `incr/expire` mà `permissionService.bumpVersion` (archive) cần.
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import { AppError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { newObjectId } from "../../../core/utils/object-id";
import type { Board } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import { DependencyService } from "../services/dependency.service";
import { STATIC_DEPENDENCY_LIMITS } from "../services/dependency-limits";
import { ServiceHarness } from "./support/service-harness";

let h: ServiceHarness;
let owner: AuthUser;
let member: AuthUser;
let guest: AuthUser;
let board: Board;
let a: Task;
let b: Task;
let c: Task;

beforeEach(async () => {
  h = new ServiceHarness();
  owner = h.addUser("OWNER");
  member = h.addUser("MEMBER");
  guest = h.addUser("GUEST");
  board = await h.createBoard(owner);
  a = await h.addTask(member, board, "A");
  b = await h.addTask(member, board, "B");
  c = await h.addTask(member, board, "C");
});

const err = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error("Đáng lẽ phải ném lỗi");
};
const fresh = async (t: Task): Promise<Task> => (await h.tasks.findById(t.id)) as Task;
const activitiesOf = (t: Task, type: string) => h.activities.activities.filter((x) => x.taskId === t.id && x.type === type);
const updatedTaskIds = (): string[] => h.emitter.of("task:updated").map((e) => (e.payload as { task: { id: string } }).task.id);

describe("dependency.service.add (p4-04 be.md §5.1)", () => {
  it("tạo cạnh: 201 (created), bộ đếm hai thẻ, version+1 cả hai, activity DEPENDENCY_ADDED hai phía, task:updated (dependencies) hai thẻ", async () => {
    const { dependency, created } = await h.dependencyService.add(member, b.id, a.id); // A chặn B
    expect(created).toBe(true);
    expect(dependency).toMatchObject({ predecessorId: a.id, successorId: b.id, type: "FINISH_TO_START", createdBy: member.id });

    expect(await fresh(b)).toMatchObject({ blockedByCount: 1, blockingCount: 0, version: b.version + 1 });
    expect(await fresh(a)).toMatchObject({ blockedByCount: 0, blockingCount: 1, version: a.version + 1 });
    expect(activitiesOf(b, "DEPENDENCY_ADDED")[0]).toMatchObject({ actorId: member.id, before: null, after: { predecessorId: a.id } });
    expect(activitiesOf(a, "DEPENDENCY_ADDED")[0]).toMatchObject({ after: { successorId: b.id } });

    expect(updatedTaskIds().sort()).toEqual([a.id, b.id].sort());
    const changed = h.emitter.of("task:updated").map((e) => (e.payload as { changed: string[] }).changed);
    expect(changed).toEqual([["dependencies"], ["dependencies"]]);
    expect(h.emitter.of("task:activity")).toHaveLength(2);
  });

  it("thẻ trước đã DONE ⇒ không tính vào blockedByCount; thẻ sau đã DONE ⇒ không tính vào blockingCount", async () => {
    h.setTask(a.id, { columnKind: "DONE" });
    await h.dependencyService.add(member, b.id, a.id); // A(DONE) → B
    expect(await fresh(b)).toMatchObject({ blockedByCount: 0 });
    expect(await fresh(a)).toMatchObject({ blockingCount: 1 });

    h.setTask(c.id, { columnKind: "DONE" });
    await h.dependencyService.add(member, c.id, b.id); // B → C(DONE)
    expect(await fresh(b)).toMatchObject({ blockingCount: 0 });
    expect(await fresh(c)).toMatchObject({ blockedByCount: 1 });
  });

  it("thêm trùng cạnh → created=false, trả bản cũ, KHÔNG đổi version/activity/sự kiện", async () => {
    const first = await h.dependencyService.add(member, b.id, a.id);
    const versions = [(await fresh(a)).version, (await fresh(b)).version];
    const eventsBefore = h.emitter.events.length;
    const again = await h.dependencyService.add(owner, b.id, a.id);
    expect(again.created).toBe(false);
    expect(again.dependency.id).toBe(first.dependency.id);
    expect([(await fresh(a)).version, (await fresh(b)).version]).toEqual(versions);
    expect(activitiesOf(b, "DEPENDENCY_ADDED")).toHaveLength(1);
    expect(h.emitter.events).toHaveLength(eventsBefore);
    expect(h.dependencyRepo.edges).toHaveLength(1);
  });

  it("TASK_017 (400): tự phụ thuộc, khác bảng, thẻ trước đã xoá; thẻ sau đã xoá/không tồn tại → 404", async () => {
    expect([(await err(h.dependencyService.add(member, a.id, a.id))).statusCode, (await err(h.dependencyService.add(member, a.id, a.id))).errorCode]).toEqual([400, "TASK_017"]);

    const other = await h.boardService.create(owner, h.workspaceId, { name: "Bảng khác" });
    const foreign = await h.addTask(member, { ...board, id: other.id } as Board, "Thẻ bảng khác");
    const cross = await err(h.dependencyService.add(member, a.id, foreign.id));
    expect([cross.statusCode, cross.errorCode]).toEqual([400, "TASK_017"]);
    expect(h.dependencyRepo.edges).toHaveLength(0);

    h.setTask(c.id, { deletedAt: new Date() });
    expect((await err(h.dependencyService.add(member, a.id, c.id))).errorCode).toBe("TASK_017");
    expect((await err(h.dependencyService.add(member, c.id, a.id))).statusCode).toBe(404);
    expect((await err(h.dependencyService.add(member, newObjectId(), a.id))).statusCode).toBe(404);
  });

  it("cạnh đã có nhưng thẻ trước SAU ĐÓ bị xoá → thêm lại là TASK_017 (không trả bản cũ như thể còn hợp lệ)", async () => {
    await h.dependencyService.add(member, b.id, a.id);
    h.setTask(a.id, { deletedAt: new Date() });
    expect((await err(h.dependencyService.add(member, b.id, a.id))).errorCode).toBe("TASK_017");
  });

  it("PM2-03: A→B rồi B→A ⇒ 409 TASK_005 kèm cycle [S…P]; vòng dài A→B→C rồi C→A", async () => {
    await h.dependencyService.add(member, b.id, a.id); // A trước B
    const e1 = await err(h.dependencyService.add(member, a.id, b.id)); // B trước A: S = A, P = B
    expect([e1.statusCode, e1.errorCode, e1.details]).toEqual([409, "TASK_005", { cycle: [a.id, b.id] }]);
    expect(h.dependencyRepo.edges).toHaveLength(1);

    await h.dependencyService.add(member, c.id, b.id); // B trước C
    const e2 = await err(h.dependencyService.add(member, a.id, c.id)); // C trước A
    expect(e2.details).toEqual({ cycle: [a.id, b.id, c.id] });
  });

  it("TASK_018: mỗi chiều tối đa dependenciesMax (theo giới hạn hiệu lực) — thẻ sau đủ thẻ trước, thẻ trước đủ thẻ sau", async () => {
    const svc = new DependencyService({
      access: h.access,
      tasks: h.tasks,
      dependencies: h.dependencyRepo,
      runner: h.runner,
      activity: h.activityWriter,
      emitter: h.emitter,
      directory: h.directory,
      limits: { load: async () => ({ ...(await STATIC_DEPENDENCY_LIMITS.load()), dependenciesMax: 2 }) },
    });
    const d = await h.addTask(member, board, "D");
    await svc.add(member, c.id, a.id);
    await svc.add(member, c.id, b.id); // C đã có 2 thẻ trước
    const preds = await err(svc.add(member, c.id, d.id));
    expect([preds.statusCode, preds.errorCode]).toEqual([409, "TASK_018"]);

    const [e1, e2, e3, e4] = [await h.addTask(member, board, "E1"), await h.addTask(member, board, "E2"), await h.addTask(member, board, "E3"), await h.addTask(member, board, "E4")];
    await svc.add(member, e2.id, e1.id);
    await svc.add(member, e3.id, e1.id); // E1 đã chặn 2 thẻ
    const succs = await err(svc.add(member, e4.id, e1.id));
    expect([succs.statusCode, succs.errorCode]).toEqual([409, "TASK_018"]);
    expect(h.dependencyRepo.edges).toHaveLength(4);
  });

  it("TASK_021: đồ thị vượt dependencyGraphVisitMax khi kiểm vòng", async () => {
    const svc = new DependencyService({
      access: h.access,
      tasks: h.tasks,
      dependencies: h.dependencyRepo,
      runner: h.runner,
      activity: h.activityWriter,
      emitter: h.emitter,
      directory: h.directory,
      limits: { load: async () => ({ ...(await STATIC_DEPENDENCY_LIMITS.load()), dependencyGraphVisitMax: 1 }) },
    });
    await svc.add(member, b.id, a.id); // A → B
    await svc.add(member, c.id, b.id); // B → C (kiểm vòng: từ C đi ra được 0 cạnh)
    const tooBig = await err(svc.add(member, a.id, c.id)); // C → A: từ A đi ra qua A→B, B→C = 2 cạnh > 1
    expect([tooBig.statusCode, tooBig.errorCode]).toEqual([409, "TASK_021"]);
  });

  it("quyền: GUEST/người ngoài 404; MEMBER làm được; bảng lưu trữ → thêm/xoá bị 403 nhưng xem được", async () => {
    expect((await err(h.dependencyService.add(guest, b.id, a.id))).statusCode).toBe(404);
    expect((await err(h.dependencyService.list(guest, a.id))).statusCode).toBe(404);
    const stranger: AuthUser = { id: newObjectId(), email: "x@e.com" };
    expect((await err(h.dependencyService.add(stranger, b.id, a.id))).statusCode).toBe(404);
    await h.dependencyService.add(member, b.id, a.id);

    await h.boardService.archive(owner, board.id);
    expect((await err(h.dependencyService.add(member, c.id, a.id))).statusCode).toBe(403);
    expect((await err(h.dependencyService.remove(member, b.id, a.id))).statusCode).toBe(403);
    expect((await h.dependencyService.list(member, b.id)).predecessors).toHaveLength(1);
  });
});

describe("dependency.service.remove / list / recountAround", () => {
  it("xoá cạnh: recount hai thẻ, activity DEPENDENCY_REMOVED hai phía, task:updated; xoá cạnh không tồn tại → thành công, không ghi gì", async () => {
    await h.dependencyService.add(member, b.id, a.id);
    h.emitter.events.length = 0;
    await h.dependencyService.remove(member, b.id, a.id);
    expect(await fresh(b)).toMatchObject({ blockedByCount: 0 });
    expect(await fresh(a)).toMatchObject({ blockingCount: 0 });
    expect(activitiesOf(b, "DEPENDENCY_REMOVED")[0]).toMatchObject({ before: { predecessorId: a.id }, after: null });
    expect(activitiesOf(a, "DEPENDENCY_REMOVED")[0]).toMatchObject({ before: { successorId: b.id } });
    expect(updatedTaskIds().sort()).toEqual([a.id, b.id].sort());

    const versions = [(await fresh(a)).version, (await fresh(b)).version];
    h.emitter.events.length = 0;
    await h.dependencyService.remove(member, b.id, a.id); // không còn cạnh
    expect([(await fresh(a)).version, (await fresh(b)).version]).toEqual(versions);
    expect(h.emitter.events).toHaveLength(0);
  });

  it("list: thẻ trước/sau kèm cột, ngày, người làm; bỏ thẻ đã xoá và thẻ khác bảng; mới → cũ", async () => {
    const worker = h.addUser("MEMBER");
    const dated = await h.addDatedTask(member, board, "Có ngày", { start: "2026-10-01T02:00:00Z", due: "2026-10-03T10:00:00Z" }, [worker.id]);
    await h.dependencyService.add(member, dated.id, a.id);
    await h.dependencyService.add(member, dated.id, b.id);
    await h.dependencyService.add(member, c.id, dated.id);
    await h.dependencyService.remove(member, dated.id, b.id);
    await h.dependencyService.add(member, dated.id, b.id);
    h.setTask(a.id, { deletedAt: new Date() });

    const dto = await h.dependencyService.list(member, dated.id);
    expect(dto.predecessors.map((t) => t.id)).toEqual([b.id]); // A đã xoá bị bỏ
    expect(dto.successors).toEqual([
      { id: c.id, title: "C", columnKind: "TODO", startDate: null, dueDate: null, assignees: [] },
    ]);
    const back = await h.dependencyService.list(member, c.id);
    expect(back.predecessors[0]).toMatchObject({ id: dated.id, startDate: "2026-10-01T02:00:00.000Z", dueDate: "2026-10-03T10:00:00.000Z" });
    expect(back.predecessors[0].assignees.map((u) => u.id)).toEqual([worker.id]);
  });

  it("recountAround (sink task.completed|reopened|deleted|restored): bộ đếm đúng một giá trị dù chạy 3 lần; hàng xóm được đếm lại; idempotent", async () => {
    await h.dependencyService.add(member, b.id, a.id); // A → B
    await h.dependencyService.add(member, c.id, b.id); // B → C
    h.setTask(b.id, { columnKind: "DONE" }); // hoàn thành B
    h.emitter.events.length = 0;
    for (let i = 0; i < 3; i += 1) await h.dependencyService.recountAround(b.id);
    // Chỉ thẻ THẬT SỰ đổi bộ đếm mới phát task:updated (C và A), đúng một lần mỗi thẻ dù chạy 3 lần.
    expect(updatedTaskIds().sort()).toEqual([a.id, c.id].sort());
    expect(await fresh(c)).toMatchObject({ blockedByCount: 0 }); // B(DONE) không còn chặn C
    expect(await fresh(a)).toMatchObject({ blockingCount: 0 }); // A không còn chặn thẻ chưa DONE nào
    const v = (await fresh(c)).version;
    await h.dependencyService.recountAround(b.id);
    expect((await fresh(c)).version).toBe(v); // idempotent: không ghi thêm
    // Mở lại B ⇒ đếm lại đúng.
    h.setTask(b.id, { columnKind: "TODO" });
    await h.dependencyService.recountAround(b.id);
    expect(await fresh(c)).toMatchObject({ blockedByCount: 1 });
    expect(await fresh(a)).toMatchObject({ blockingCount: 1 });
  });
});
