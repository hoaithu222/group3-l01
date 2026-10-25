import { installMocks, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, ensureProjectIndexes, makeApi, seedChain, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { mutationId } from "./projects-test-kit";
import { AppError } from "../../../../core/exceptions";
import { createProjectsContainer } from "../../projects.container";
import { KeyedMutex } from "../../services/keyed-mutex";
import { FakeEmitter, FakeRebalanceScheduler, userOf } from "../support/service-harness";
import { prisma } from "../../../../infrastructure/database";

// Mongo memory replset chậm (mỗi request/transaction tính bằng trăm ms trên Windows) — các ca có nhiều lời gọi tuần tự cần trần rộng hơn 5 s mặc định.
jest.setTimeout(90_000);

const app = buildProjectsApp();
const api = makeApi(app);

type Board = { id: string; columns: { id: string; kind: string }[] };
type Card = { id: string; version: number; blockedByCount: number; blockingCount: number };

describe("projects p4-04 — phụ thuộc giữa thẻ (integration, Mongo memory replset)", () => {
  const groups: Group[] = [];
  let g: Group;
  let board: Board;
  let board2: Board;

  beforeAll(() => ensureProjectIndexes());
  beforeEach(async () => {
    installMocks();
    g = await seedGroup({ A: "OWNER", B: "ADMIN", C: "MEMBER", D: "MEMBER", G: "GUEST" });
    groups.push(g);
    board = (await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "Bảng 1" })).body.data;
    board2 = (await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "Bảng 2" })).body.data;
  });
  afterEach(async () => {
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const as = (who: string) => tokenFor(g.ids[who]);
  const newTask = async (title: string, b: Board = board): Promise<Card> => (await api("post", `/boards/${b.id}/tasks`, as("C"), { title })).body.data;
  const card = async (id: string): Promise<Card> => (await api("get", `/tasks/${id}`, as("C"))).body.data;
  /** `:id` là thẻ SAU, `predecessorId` là thẻ TRƯỚC. */
  const link = (successor: string, predecessor: string, who = "C") => api("post", `/tasks/${successor}/dependencies`, as(who), { predecessorId: predecessor });

  it("PM2-03: A→B → 201; lặp lại → 200 cùng cạnh; B→A → 409 TASK_005 {cycle}; A→A và khác bảng → 400 TASK_017", async () => {
    const [a, b] = [await newTask("A"), await newTask("B")];
    const other = await newTask("Khác bảng", board2);

    const created = await link(b.id, a.id);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ predecessorId: a.id, successorId: b.id, type: "FINISH_TO_START", createdBy: g.ids.C });
    const again = await link(b.id, a.id, "D");
    expect([again.status, again.body.data.id]).toEqual([200, created.body.data.id]);
    expect(await prisma.taskDependency.count({ where: { successorId: b.id } })).toBe(1);

    const loop = await link(a.id, b.id); // B trước A ⇒ vòng
    expect([loop.status, loop.body.error.code, loop.body.error.details]).toEqual([409, "TASK_005", { cycle: [a.id, b.id] }]);
    const self = await link(a.id, a.id);
    expect([self.status, self.body.error.code]).toEqual([400, "TASK_017"]);
    const cross = await link(a.id, other.id);
    expect([cross.status, cross.body.error.code]).toEqual([400, "TASK_017"]);
    expect(await prisma.taskDependency.count({ where: { workspaceId: g.workspaceId } })).toBe(1);

    // Vòng dài: A→B→C rồi C→A.
    const c = await newTask("C");
    expect((await link(c.id, b.id)).status).toBe(201);
    const long = await link(a.id, c.id);
    expect([long.status, long.body.error.details]).toEqual([409, { cycle: [a.id, b.id, c.id] }]);
  });

  it("bộ đếm + task:updated dữ liệu: blockedByCount/blockingCount trên thẻ Kanban và chi tiết; activity DEPENDENCY_ADDED/REMOVED hai thẻ; DELETE → 204 (không có cạnh cũng 204)", async () => {
    const [a, b] = [await newTask("A"), await newTask("B")];
    await link(b.id, a.id);

    expect(await card(b.id)).toMatchObject({ blockedByCount: 1, blockingCount: 0, version: b.version + 1 });
    expect(await card(a.id)).toMatchObject({ blockedByCount: 0, blockingCount: 1 });
    const list = (await api("get", `/boards/${board.id}/tasks`, as("C"))).body.data.columns.flatMap((c: { tasks: Card[] }) => c.tasks) as Card[];
    expect(list.find((t) => t.id === b.id)).toMatchObject({ blockedByCount: 1, blockingCount: 0 });
    const types = async (id: string) => (await prisma.taskActivity.findMany({ where: { taskId: id }, orderBy: { at: "asc" } })).map((x) => x.type);
    expect(await types(a.id)).toContain("DEPENDENCY_ADDED");
    expect(await types(b.id)).toContain("DEPENDENCY_ADDED");

    const deps = await api("get", `/tasks/${b.id}/dependencies`, as("D"));
    expect(deps.status).toBe(200);
    expect(deps.body.data.predecessors).toEqual([expect.objectContaining({ id: a.id, title: "A", columnKind: "TODO", startDate: null, dueDate: null, assignees: [] })]);
    expect(deps.body.data.successors).toEqual([]);
    const detail = await card(b.id);
    expect((detail as unknown as { dependencies: { predecessors: { id: string }[] } }).dependencies.predecessors.map((p) => p.id)).toEqual([a.id]);

    const del = await api("delete", `/tasks/${b.id}/dependencies/${a.id}`, as("C"));
    expect(del.status).toBe(204);
    expect(await card(b.id)).toMatchObject({ blockedByCount: 0 });
    expect(await card(a.id)).toMatchObject({ blockingCount: 0 });
    expect(await types(b.id)).toContain("DEPENDENCY_REMOVED");
    expect((await api("delete", `/tasks/${b.id}/dependencies/${a.id}`, as("C"))).status).toBe(204); // idempotent
    expect((await api("delete", `/tasks/${b.id}/dependencies/${newObjectId()}`, as("C"))).status).toBe(204);
  });

  it("thẻ trước đã ở cột DONE lúc thêm phụ thuộc → không tính vào blockedByCount (vẫn tính blockingCount vì thẻ sau chưa xong)", async () => {
    const [a, b] = [await newTask("A"), await newTask("B")];
    const done = board.columns.find((c) => c.kind === "DONE")!.id;
    const moved = await api("post", `/tasks/${a.id}/move`, as("C"), { columnId: done, afterTaskId: null, beforeTaskId: null, expectedVersion: a.version, clientMutationId: mutationId() });
    expect(moved.status).toBe(200);
    await link(b.id, a.id);
    expect(await card(b.id)).toMatchObject({ blockedByCount: 0 });
    expect(await card(a.id)).toMatchObject({ blockingCount: 1 });
  });

  it("quyền: GUEST/người ngoài 404 (xem/thêm/xoá); bảng lưu trữ → thêm/xoá 403 nhưng xem được; validation predecessorId", async () => {
    const [a, b] = [await newTask("A"), await newTask("B")];
    await link(b.id, a.id);
    for (const [method, path, body] of [
      ["get", `/tasks/${b.id}/dependencies`, undefined],
      ["post", `/tasks/${b.id}/dependencies`, { predecessorId: a.id }],
      ["delete", `/tasks/${b.id}/dependencies/${a.id}`, undefined],
    ] as const) {
      expect([method, (await api(method, path, as("G"), body)).status]).toEqual([method, 404]);
      expect([method, (await api(method, path, tokenFor(newObjectId()), body)).status]).toEqual([method, 404]);
    }
    expect((await link(newObjectId(), a.id)).status).toBe(404);
    expect((await link(b.id, "khong-phai-id")).status).toBe(400);
    expect((await api("post", `/tasks/${b.id}/dependencies`, as("C"), {})).status).toBe(400);

    expect((await api("post", `/boards/${board.id}/archive`, as("A"))).status).toBe(200);
    expect((await link(b.id, a.id, "D")).status).toBe(403);
    expect((await api("delete", `/tasks/${b.id}/dependencies/${a.id}`, as("C"))).status).toBe(403);
    expect((await api("get", `/tasks/${b.id}/dependencies`, as("C"))).status).toBe(200);
  });

  it("đua tạo: 6 lệnh CÙNG cạnh → đúng 1 bản ghi (unique index), một 201, còn lại 200; hai lệnh vòng A→B và B→A song song → tối đa một thắng", async () => {
    const [a, b] = [await newTask("A"), await newTask("B")];
    const same = await Promise.all(Array.from({ length: 6 }, (_, i) => link(b.id, a.id, i % 2 ? "C" : "D")));
    expect(same.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 200, 201]);
    expect(new Set(same.map((r) => r.body.data.id)).size).toBe(1);
    expect(await prisma.taskDependency.count({ where: { successorId: b.id } })).toBe(1);
    expect(await card(b.id)).toMatchObject({ blockedByCount: 1 });

    // Ngược chiều cùng lúc, lặp nhiều lần: KHÔNG được có 500 thô (từng xảy ra khi hai lệnh chạm hai thẻ theo thứ tự ngược nhau).
    for (let round = 0; round < 6; round += 1) {
      const [x, y] = [await newTask(`X${round}`), await newTask(`Y${round}`)];
      const both = await Promise.all([link(y.id, x.id), link(x.id, y.id)]); // X→Y và Y→X cùng lúc
      expect([round, both.map((r) => r.status).sort()]).toEqual([round, [201, 409]]);
      expect(await prisma.taskDependency.count({ where: { predecessorId: { in: [x.id, y.id] }, successorId: { in: [x.id, y.id] } } })).toBe(1);
      expect(both.find((r) => r.status === 409)?.body.error.code).toBe("TASK_005");
    }
  }, 120_000);

  it("KHÁC instance (không chung hàng đợi tiến trình): cạnh ngược chiều đồng thời → mỗi lệnh thành công, TASK_005 hoặc 503 SYS_503 thử lại được (KHÔNG 500 thô); không bao giờ có vòng", async () => {
    const instance = () => createProjectsContainer({ boardMutex: new KeyedMutex(), emitter: new FakeEmitter(), rebalance: new FakeRebalanceScheduler() });
    const [i1, i2] = [instance(), instance()];
    for (let round = 0; round < 6; round += 1) {
      const [x, y] = [await newTask(`P${round}`), await newTask(`Q${round}`)];
      const results = await Promise.allSettled([
        i1.dependencyService.add(userOf(g.ids.C), y.id, x.id), // X→Y
        i2.dependencyService.add(userOf(g.ids.D), x.id, y.id), // Y→X
      ]);
      for (const r of results) {
        if (r.status === "fulfilled") continue;
        const err = r.reason as AppError;
        const ok = (err.statusCode === 409 && err.errorCode === "TASK_005") || (err.statusCode === 503 && err.errorCode === "SYS_503");
        expect([round, err.statusCode, err.errorCode, ok]).toEqual([round, err.statusCode, err.errorCode, true]);
      }
      const edges = await prisma.taskDependency.findMany({ where: { predecessorId: { in: [x.id, y.id] }, successorId: { in: [x.id, y.id] } } });
      expect(edges.length).toBeLessThanOrEqual(1); // tối đa MỘT chiều (cả hai cùng 503 là cực hiếm nhưng hợp lệ)
      if (edges.length === 1) {
        // Lệnh thua chạy lại tuần tự → chắc chắn TASK_005 (cạnh kia đã có).
        const loser = edges[0].predecessorId === x.id ? { s: x.id, p: y.id } : { s: y.id, p: x.id };
        const retry = await link(loser.s, loser.p);
        expect([retry.status, retry.body.error.code]).toEqual([409, "TASK_005"]);
      }
    }
  }, 120_000);

  it("thẻ đã xoá: không thêm phụ thuộc (404 nếu là thẻ sau, TASK_017 nếu là thẻ trước); list bỏ thẻ đã xoá", async () => {
    const [a, b, c] = [await newTask("A"), await newTask("B"), await newTask("C")];
    await link(b.id, a.id);
    await link(c.id, b.id);
    expect((await api("delete", `/tasks/${a.id}`, as("C"))).status).toBe(204);
    expect((await link(b.id, a.id)).status).toBe(400); // A đã xoá làm thẻ trước mới
    expect((await link(a.id, c.id)).status).toBe(404);
    const deps = await api("get", `/tasks/${b.id}/dependencies`, as("C"));
    expect(deps.body.data.predecessors).toEqual([]); // A đã xoá bị bỏ
    expect(deps.body.data.successors.map((t: { id: string }) => t.id)).toEqual([c.id]);
  });

  it("PM2-28 (API): GET /boards/:id/gantt trả slackDays/isCritical/conflict + cạnh; khoảng ngày sai/quá dài → 400; GUEST/người ngoài 404", async () => {
    const [root, t1, t2, t3] = await seedChain(board.id, g.workspaceId, board.columns[0].id, g.ids.C, 3);
    // T2 bắt đầu CÙNG ngày hạn T1 (xung đột, slack -1); T3 bắt đầu xa (slack 6).
    await prisma.task.update({ where: { id: t2 }, data: { startDate: new Date("2026-10-04T02:00:00Z"), dueDate: new Date("2026-10-05T10:00:00Z") } });
    await prisma.task.update({ where: { id: t3 }, data: { startDate: new Date("2026-10-12T02:00:00Z"), dueDate: new Date("2026-10-13T10:00:00Z") } });

    const res = await api("get", `/boards/${board.id}/gantt?from=2026-09-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z`, as("D"));
    expect(res.status).toBe(200);
    const gantt = res.body.data as { timezone: string; truncated: boolean; tasks: { id: string; slackDays: number | null; isCritical: boolean; conflict: boolean; blockedByCount: number }[]; edges: { predecessorId: string; successorId: string; slackDays: number | null }[] };
    expect(gantt).toMatchObject({ timezone: "Asia/Ho_Chi_Minh", truncated: false });
    const edge = (p: string, sId: string) => gantt.edges.find((e) => e.predecessorId === p && e.successorId === sId)?.slackDays;
    expect([edge(root, t1), edge(t1, t2), edge(t2, t3)]).toEqual([0, -1, 6]);
    const by = (id: string) => gantt.tasks.find((t) => t.id === id)!;
    expect(by(root)).toMatchObject({ slackDays: 0, isCritical: true, conflict: false, columnId: board.columns[0].id, columnKind: "TODO", assigneeIds: [] });
    expect(by(t1)).toMatchObject({ slackDays: -1, isCritical: true, conflict: true });
    expect(by(t2)).toMatchObject({ slackDays: 6, isCritical: true, conflict: false, blockedByCount: 1 }); // có cạnh vào slack ≤ 0
    expect(by(t3)).toMatchObject({ slackDays: null, isCritical: false, conflict: false });

    for (const q of ["from=2026-12-31T00:00:00.000Z&to=2026-09-01T00:00:00.000Z", "from=2026-01-01T00:00:00.000Z&to=2027-06-01T00:00:00.000Z", "from=khong-phai-ngay&to=2026-09-01T00:00:00.000Z", ""]) {
      expect([q, (await api("get", `/boards/${board.id}/gantt?${q}`, as("C"))).status]).toEqual([q, 400]);
    }
    const ok = "from=2026-09-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z";
    expect((await api("get", `/boards/${board.id}/gantt?${ok}`, as("G"))).status).toBe(404);
    expect((await api("get", `/boards/${board.id}/gantt?${ok}`, tokenFor(newObjectId()))).status).toBe(404);
  });
});
