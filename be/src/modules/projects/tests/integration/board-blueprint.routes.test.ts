import { installMocks, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, ensureProjectIndexes, makeApi, mutationId, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { prisma } from "../../../../infrastructure/database";

jest.setTimeout(90_000);

const app = buildProjectsApp();
const api = makeApi(app);

type Column = { id: string; title: string; kind: string; order: number; wipLimit: number | null };
type Board = { id: string; name: string; description: string | null; columns: Column[]; labels?: { id: string; name: string; color: string; boardId: string }[]; version: number };

/** p3-02 P1 — mẫu bảng + sao chép bảng (integration, Mongo memory replset). */
describe("p3-02 P1 — mẫu bảng & sao chép bảng REST (integration)", () => {
  const groups: Group[] = [];
  let g: Group;

  beforeAll(async () => {
    await ensureProjectIndexes(); // unique (boardId, normalizedName) của Label — kiểm đường P2002
  });
  beforeEach(async () => {
    installMocks();
    g = await seedGroup({ A: "OWNER", B: "MEMBER", G: "GUEST" });
    groups.push(g);
  });
  afterEach(async () => {
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const as = (who: string) => tokenFor(g.ids[who]);

  it("GET /board-templates: hai mẫu 'Đồ án' + 'Scrum nhẹ'; 401 khi chưa đăng nhập", async () => {
    const res = await api("get", "/board-templates", as("B"));
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { code: string; name: string }) => [t.code, t.name])).toEqual([["COURSE_PROJECT", "Đồ án"], ["LIGHT_SCRUM", "Scrum nhẹ"]]);
    expect(res.body.data[0].columns).toHaveLength(5);
    expect((await api("get", "/board-templates", "")).status).toBe(401);
  });

  it("POST from-template: 201, cột + nhãn LƯU BỀN đúng mẫu; GET /boards/:id thấy nhãn; tạo thẻ vào cột TODO đầu; Idempotency-Key replay không tạo bảng thứ hai; MEMBER 403, GUEST 404, mẫu lạ 400", async () => {
    const key = { "Idempotency-Key": mutationId() };
    const res = await api("post", `/workspaces/${g.workspaceId}/boards/from-template`, as("A"), { template: "COURSE_PROJECT" }, key);
    expect(res.status).toBe(201);
    const board = res.body.data as Board;
    expect(board).toMatchObject({ name: "Đồ án", version: 1 });
    expect(board.columns.map((c) => [c.title, c.kind])).toEqual([["Ý tưởng", "TODO"], ["Cần làm", "TODO"], ["Đang làm", "IN_PROGRESS"], ["Chờ xem xét", "REVIEW"], ["Hoàn thành", "DONE"]]);
    expect(board.labels!.map((l) => [l.name, l.color])).toEqual([["Báo cáo", "blue"], ["Lập trình", "green"], ["Thiết kế", "purple"], ["Thuyết trình", "orange"], ["Cần gấp", "red"]]);

    const detail = (await api("get", `/boards/${board.id}`, as("B"))).body.data as Board;
    expect(detail.labels).toHaveLength(5);
    expect(await prisma.label.count({ where: { boardId: board.id } })).toBe(5);
    const task = await api("post", `/boards/${board.id}/tasks`, as("B"), { title: "Việc đầu tiên", assigneeIds: [] });
    expect([task.status, task.body.data.columnId]).toEqual([201, board.columns[0].id]);

    const replay = await api("post", `/workspaces/${g.workspaceId}/boards/from-template`, as("A"), { template: "COURSE_PROJECT" }, key);
    expect(replay.body.data.id).toBe(board.id);
    expect(await prisma.board.count({ where: { workspaceId: g.workspaceId } })).toBe(1);

    expect((await api("post", `/workspaces/${g.workspaceId}/boards/from-template`, as("B"), { template: "LIGHT_SCRUM" })).status).toBe(403);
    expect((await api("post", `/workspaces/${g.workspaceId}/boards/from-template`, as("G"), { template: "LIGHT_SCRUM" })).status).toBe(404);
    expect((await api("post", `/workspaces/${g.workspaceId}/boards/from-template`, as("A"), { template: "KHONG_CO" })).status).toBe(400);
    const named = await api("post", `/workspaces/${g.workspaceId}/boards/from-template`, as("A"), { template: "LIGHT_SCRUM", name: "Sprint 1" });
    expect(named.body.data).toMatchObject({ name: "Sprint 1" });
  });

  it("POST /boards/:id/duplicate: sao chép cột (id mới, WIP), nhãn, mô tả, cấu hình chấm chéo qua Prisma thật; KHÔNG sao chép thẻ; MEMBER 403; GUEST 404; đủ bảng → TASK_009", async () => {
    const src = (await api("post", `/workspaces/${g.workspaceId}/boards`, as("A"), { name: "Bảng gốc", description: "Mô tả gốc" })).body.data as Board;
    const cols = src.columns.map((c) => ({ id: c.id, title: c.title, kind: c.kind, wipLimit: c.kind === "IN_PROGRESS" ? 4 : null }));
    expect((await api("put", `/boards/${src.id}/columns`, as("A"), { columns: cols, expectedVersion: src.version })).status).toBe(200);
    await api("post", `/boards/${src.id}/labels`, as("A"), { name: "Gấp", color: "red" });
    await api("post", `/boards/${src.id}/labels`, as("A"), { name: "Chậm", color: "gray" });
    await api("post", `/boards/${src.id}/tasks`, as("A"), { title: "Thẻ gốc", assigneeIds: [] });
    const cfg = (await api("get", `/boards/${src.id}/review-config`, as("A"))).body.data as { version: number };
    expect((await api("put", `/boards/${src.id}/review-config`, as("A"), { enabled: true, requiredReviews: 2, rubric: [{ label: "Chất lượng", maxScore: 10 }], autoCompleteOnApproval: true, expectedVersion: cfg.version })).status).toBe(200);

    const res = await api("post", `/boards/${src.id}/duplicate`, as("A"), {});
    expect(res.status).toBe(201);
    const copy = res.body.data as Board;
    expect(copy).toMatchObject({ name: "Bảng gốc (bản sao)", description: "Mô tả gốc" });
    const srcNow = (await api("get", `/boards/${src.id}`, as("A"))).body.data as Board;
    expect(copy.columns.map((c) => [c.title, c.kind, c.wipLimit])).toEqual(srcNow.columns.map((c) => [c.title, c.kind, c.wipLimit]));
    expect(copy.columns.some((c) => srcNow.columns.some((s) => s.id === c.id))).toBe(false);
    expect(copy.labels!.map((l) => [l.name, l.color])).toEqual([["Gấp", "red"], ["Chậm", "gray"]]);
    expect(await prisma.task.count({ where: { boardId: copy.id } })).toBe(0);
    expect(await prisma.task.count({ where: { boardId: src.id } })).toBe(1);

    const stored = await prisma.board.findUniqueOrThrow({ where: { id: copy.id } });
    expect(stored.review).toMatchObject({ enabled: true, requiredReviews: 2, autoCompleteOnApproval: true });
    expect((stored.review as { rubric: { label: string; maxScore: number }[] }).rubric.map((r) => [r.label, r.maxScore])).toEqual([["Chất lượng", 10]]);

    const noReview = await api("post", `/boards/${src.id}/duplicate`, as("A"), { name: "Sao không chấm", includeReviewConfig: false, includeLabels: false });
    expect(noReview.body.data).toMatchObject({ name: "Sao không chấm", labels: [] });
    expect((await prisma.board.findUniqueOrThrow({ where: { id: noReview.body.data.id } })).review).not.toMatchObject({ enabled: true });

    expect((await api("post", `/boards/${src.id}/duplicate`, as("B"), {})).status).toBe(403);
    expect((await api("post", `/boards/${src.id}/duplicate`, as("G"), {})).status).toBe(404);
    expect((await api("post", `/boards/${src.id}/duplicate`, as("A"), { name: "" })).status).toBe(400);

    // Đủ số bảng đang hoạt động (mặc định 20) ⇒ TASK_009.
    const cap = 20 - (await prisma.board.count({ where: { workspaceId: g.workspaceId, archivedAt: null } }));
    for (let i = 0; i < cap; i += 1) expect((await api("post", `/boards/${src.id}/duplicate`, as("A"), { name: `Bản ${i}`, includeLabels: false })).status).toBe(201);
    const over = await api("post", `/boards/${src.id}/duplicate`, as("A"), {});
    expect([over.status, over.body.error.code]).toEqual([409, "TASK_009"]);
  });
});
