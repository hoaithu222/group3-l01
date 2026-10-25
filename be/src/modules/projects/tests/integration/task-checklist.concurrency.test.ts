import { installMocks, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, makeApi, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";

const app = buildProjectsApp();
const api = makeApi(app);

type Item = { id: string; text: string; done: boolean; order: number };

/**
 * Checklist theo TỪNG MỤC qua `$runCommandRaw` + `arrayFilters` — PHẢI kiểm trên Mongo thật (replset), không chỉ in-memory:
 * đây là nơi PM2-21 (hai người tick hai mục khác nhau không xung đột) và PM2-22 (tick lặp không \`$inc\` kép) được chứng minh.
 */
describe("projects p3-03 — checklist (integration, Mongo memory replset)", () => {
  const groups: Group[] = [];
  let g: Group;
  let taskId: string;

  beforeEach(async () => {
    installMocks();
    g = await seedGroup({ A: "OWNER", B: "ADMIN", C: "MEMBER", D: "MEMBER", E: "MEMBER", G: "GUEST" });
    groups.push(g);
    const board = (await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "Đồ án" })).body.data;
    taskId = (await api("post", `/boards/${board.id}/tasks`, tokenFor(g.ids.C), { title: "Thẻ có checklist" })).body.data.id;
  });
  afterEach(async () => {
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const as = (who: string) => tokenFor(g.ids[who]);
  const add = async (who: string, text: string, afterItemId?: string): Promise<Item> => {
    const res = await api("post", `/tasks/${taskId}/checklist`, as(who), { text, ...(afterItemId && { afterItemId }) });
    expect(res.status).toBe(201);
    return res.body.data.item;
  };
  const tick = (who: string, itemId: string, done: boolean) => api("patch", `/tasks/${taskId}/checklist/${itemId}`, as(who), { done });
  const stored = () => prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  /** Bất biến: đếm phi chuẩn hoá LUÔN khớp mảng (không trôi dù bao nhiêu thao tác song song). */
  const assertConsistent = async () => {
    const t = await stored();
    expect([t.checklistTotal, t.checklistDone]).toEqual([t.checklist.length, t.checklist.filter((i) => i.done).length]);
    return t;
  };

  it("PM2-02: thêm 4 mục, tick 2 → 2/4 (50 %) ở GET /tasks/:id và trên thẻ mini của bảng; GUEST không sửa được (404)", async () => {
    const items = [await add("C", "1"), await add("C", "2"), await add("C", "3"), await add("C", "4")];
    await tick("C", items[0].id, true);
    await tick("D", items[1].id, true);

    const detail = (await api("get", `/tasks/${taskId}`, as("D"))).body.data;
    expect([detail.checklistDone, detail.checklistTotal]).toEqual([2, 4]);
    expect(detail.checklist.map((i: Item) => [i.text, i.done])).toEqual([["1", true], ["2", true], ["3", false], ["4", false]]);
    const boardId = detail.boardId;
    const card = (await api("get", `/boards/${boardId}/tasks`, as("C"))).body.data.columns.flatMap((c: { tasks: { id: string; checklistDone: number; checklistTotal: number }[] }) => c.tasks).find((t: { id: string }) => t.id === taskId);
    expect([card.checklistDone, card.checklistTotal]).toEqual([2, 4]);

    expect((await api("post", `/tasks/${taskId}/checklist`, as("G"), { text: "x" })).status).toBe(404);
    expect((await tick("G", items[2].id, true)).status).toBe(404);
    await assertConsistent();
  });

  it("PM2-21: hai người tick hai mục KHÁC nhau cùng lúc → cả hai 200 (không 409), cả hai mục done, version +2", async () => {
    const [a, b] = [await add("C", "A"), await add("C", "B")];
    const before = await stored();
    const [r1, r2] = await Promise.all([tick("C", a.id, true), tick("D", b.id, true)]);

    expect([r1.status, r2.status]).toEqual([200, 200]);
    const t = await assertConsistent();
    expect(t.checklist.map((i) => i.done)).toEqual([true, true]);
    expect(t.checklistDone).toBe(2);
    expect(t.version).toBe(before.version + 2);
    expect(t.checklist.find((i) => i.id === a.id)?.doneBy).toBe(g.ids.C);
    expect(t.checklist.find((i) => i.id === b.id)?.doneBy).toBe(g.ids.D);
  });

  it("PM2-21 (tải cao): 3 người × 8 mục tick song song → không mất cập nhật nào, không 409/500, đếm khớp mảng", async () => {
    const items: Item[] = [];
    for (let i = 0; i < 8; i++) items.push(await add("C", `Mục ${i}`));
    const users = ["C", "D", "E"];
    const results = await Promise.all(items.map((it, i) => tick(users[i % 3], it.id, true)));
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
    const t = await assertConsistent();
    expect(t.checklistDone).toBe(8);
  });

  it("PM2-22: tick LẶP (10 yêu cầu song song cùng đích) → bộ đếm +1 đúng MỘT lần, version +1, đúng một activity", async () => {
    const it1 = await add("C", "Mục");
    const before = await stored();
    const results = await Promise.all(Array.from({ length: 10 }, () => tick("C", it1.id, true)));

    expect(results.every((r) => r.status === 200)).toBe(true);
    const t = await assertConsistent();
    expect([t.checklistDone, t.version]).toEqual([1, before.version + 1]);
    expect(await prisma.taskActivity.count({ where: { taskId, type: "CHECKLIST_DONE" } })).toBe(1);
    // Bỏ tick lặp cũng vậy.
    await Promise.all(Array.from({ length: 5 }, () => tick("C", it1.id, false)));
    expect((await assertConsistent()).checklistDone).toBe(0);
  });

  it("PM2-22: tick/untick 10 lần trong vài giây → 1 activity gộp (groupKey cl:<userId>) hiển thị KẾT QUẢ CUỐI; người khác có bản ghi riêng", async () => {
    const [a, b] = [await add("C", "Mục A"), await add("C", "Mục B")];
    for (let i = 0; i < 10; i++) await tick("C", a.id, i % 2 === 0); // tick, bỏ, tick, … → cuối cùng bỏ tick
    await tick("C", b.id, true);
    await tick("D", a.id, true);

    const toggles = await prisma.taskActivity.findMany({ where: { taskId, type: { in: ["CHECKLIST_DONE", "CHECKLIST_UNDONE"] } }, orderBy: [{ at: "asc" }, { id: "asc" }] });
    expect(toggles.map((x) => [x.actorId, x.groupKey])).toEqual([[g.ids.C, `cl:${g.ids.C}`], [g.ids.D, `cl:${g.ids.D}`]]);
    expect(toggles[0].type).toBe("CHECKLIST_DONE"); // lần cuối của C là tick Mục B
    expect(toggles[0].after).toEqual({
      items: [{ itemId: a.id, text: "Mục A", done: false }, { itemId: b.id, text: "Mục B", done: true }],
    });
    await assertConsistent();
  });

  it("thêm song song 5 mục → đủ 5, id duy nhất; TASK_003 nguyên tử: chỉ đủ chỗ cho 2 khi đã có 98 mục (không vượt 100)", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => api("post", `/tasks/${taskId}/checklist`, as(["C", "D", "E"][i % 3]), { text: `Mục ${i}` })));
    expect(results.map((r) => r.status)).toEqual(Array(5).fill(201));
    expect(new Set(results.map((r) => r.body.data.item.id)).size).toBe(5);
    expect((await assertConsistent()).checklistTotal).toBe(5);

    // Nâng lên 98 mục bằng ghi trực tiếp (nhanh), rồi thêm 5 mục song song.
    const filler = Array.from({ length: 93 }, (_, i) => ({ id: newObjectId(), text: `Đệm ${i}`, done: false, order: 100_000 + i }));
    await prisma.task.update({ where: { id: taskId }, data: { checklist: { push: filler }, checklistTotal: 98 } });
    const race = await Promise.all(Array.from({ length: 5 }, (_, i) => api("post", `/tasks/${taskId}/checklist`, as("C"), { text: `Chen ${i}` })));
    expect(race.filter((r) => r.status === 201)).toHaveLength(2);
    const rejected = race.filter((r) => r.status === 409);
    expect(rejected).toHaveLength(3);
    expect(rejected.every((r) => r.body.error.code === "TASK_003")).toBe(true);
    expect((await assertConsistent()).checklistTotal).toBe(100);
  }, 30_000);

  it("sửa text (CHECKLIST_EDITED), đổi chỗ (lên đầu / ra sau mục khác), xoá (giảm cả done); mục không còn → 404", async () => {
    const [a, b, c] = [await add("C", "A"), await add("C", "B"), await add("C", "C")];
    await tick("C", b.id, true);

    const edited = await api("patch", `/tasks/${taskId}/checklist/${a.id}`, as("D"), { text: "A (sửa)" });
    expect([edited.status, edited.body.data.item.text]).toEqual([200, "A (sửa)"]);
    await api("patch", `/tasks/${taskId}/checklist/${c.id}`, as("C"), { moveAfterItemId: null });
    await api("patch", `/tasks/${taskId}/checklist/${a.id}`, as("C"), { moveAfterItemId: b.id });
    expect((await stored()).checklist.sort((x, y) => x.order - y.order).map((i) => i.text)).toEqual(["C", "B", "A (sửa)"]);
    const detail = (await api("get", `/tasks/${taskId}`, as("C"))).body.data;
    expect(detail.checklist.map((i: Item) => i.text)).toEqual(["C", "B", "A (sửa)"]); // API luôn trả theo order

    const removed = await api("delete", `/tasks/${taskId}/checklist/${b.id}`, as("C")); // mục ĐÃ tick
    expect([removed.status, removed.body.data.checklistDone, removed.body.data.checklistTotal]).toEqual([200, 0, 2]);
    expect((await api("delete", `/tasks/${taskId}/checklist/${b.id}`, as("C"))).status).toBe(404);
    expect((await tick("C", b.id, true)).status).toBe(404);
    expect((await api("patch", `/tasks/${taskId}/checklist/${a.id}`, as("C"), {})).status).toBe(400);
    expect((await api("patch", `/tasks/${taskId}/checklist/${a.id}`, as("C"), { text: "" })).status).toBe(400);
    expect((await api("post", `/tasks/${taskId}/checklist`, as("C"), { text: "   " })).status).toBe(400);
    await assertConsistent();
  });

  it("hỗn hợp song song (tick/bỏ tick/xoá/thêm/sửa) — đếm phi chuẩn hoá luôn khớp mảng; thẻ đã xoá mềm không sửa được (404)", async () => {
    const items: Item[] = [];
    for (let i = 0; i < 6; i++) items.push(await add("C", `Mục ${i}`));
    const ops = [
      tick("C", items[0].id, true), tick("D", items[1].id, true), tick("E", items[1].id, true), tick("C", items[2].id, true),
      api("delete", `/tasks/${taskId}/checklist/${items[2].id}`, as("D")), api("delete", `/tasks/${taskId}/checklist/${items[3].id}`, as("E")),
      tick("C", items[3].id, true), tick("D", items[4].id, true), tick("D", items[4].id, false), api("post", `/tasks/${taskId}/checklist`, as("E"), { text: "Mới 1" }), api("post", `/tasks/${taskId}/checklist`, as("C"), { text: "Mới 2" }),
      api("patch", `/tasks/${taskId}/checklist/${items[5].id}`, as("D"), { text: "Sửa", done: true, moveAfterItemId: null }),
    ];
    const results = await Promise.all(ops);
    expect(results.every((r) => [200, 201, 404].includes((r as { status: number }).status))).toBe(true); // 404 = mục vừa bị xoá cùng lúc
    await assertConsistent();

    await api("delete", `/tasks/${taskId}`, as("C"));
    expect((await api("post", `/tasks/${taskId}/checklist`, as("C"), { text: "sau xoá" })).status).toBe(404);
  });
});
