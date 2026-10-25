// Unit-test redis mock mặc định (`setup.ts`) thiếu `incr/expire` mà `permissionService.bumpVersion` (archive) cần.
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import { LIMITS } from "../../../core/constants/limits";
import { AppError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { Board } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import { ServiceHarness } from "./support/service-harness";

let h: ServiceHarness;
let owner: AuthUser;
let member: AuthUser;
let member2: AuthUser;
let board: Board;
let task: Task;

beforeEach(async () => {
  h = new ServiceHarness();
  owner = h.addUser("OWNER");
  member = h.addUser("MEMBER");
  member2 = h.addUser("MEMBER");
  board = await h.createBoard(owner);
  task = await h.addTask(member, board, "Thẻ có checklist");
});

const catchError = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("Đáng lẽ phải ném lỗi");
};

const add = (user: AuthUser, text: string, afterItemId?: string) => h.checklistService.add(user, task.id, { text, afterItemId });
const stored = async () => (await h.tasks.findById(task.id)) as Task;

describe("task-checklist.service — thêm / thứ tự", () => {
  it("thêm mục: cuối danh sách, order tăng dần, đếm total + version +1, ghi CHECKLIST_ADDED, phát task:updated {changed:['checklist']} + task:activity", async () => {
    const a = await add(member, "Vẽ sơ đồ");
    const b = await add(member, "Viết báo cáo");

    expect(a.item).toMatchObject({ text: "Vẽ sơ đồ", done: false, doneBy: null, doneAt: null });
    expect(a.item.order).toBeLessThan(b.item.order);
    expect(b).toMatchObject({ checklistDone: 0, checklistTotal: 2, version: task.version + 2 });
    expect((await stored()).checklist.map((i) => i.text)).toEqual(["Vẽ sơ đồ", "Viết báo cáo"]);

    const types = h.activities.activities.filter((x) => x.taskId === task.id).map((x) => x.type);
    expect(types).toEqual(["CREATED", "CHECKLIST_ADDED", "CHECKLIST_ADDED"]);
    expect(h.activities.activities.at(-1)?.after).toEqual({ itemId: b.item.id, text: "Viết báo cáo" });
    expect(h.emitter.of("task:updated").at(-1)?.payload).toMatchObject({ changed: ["checklist"], actorId: member.id });
    expect(h.emitter.of("task:activity")).toHaveLength(2);
  });

  it("afterItemId chèn NGAY SAU mục đó (order là trung bình); mốc không còn → cuối danh sách, không lỗi", async () => {
    const a = await add(member, "A");
    await add(member, "C");
    await add(member, "B", a.item.id);
    await add(member, "Z", "0".repeat(24)); // mốc đã bị xoá

    expect((await stored()).checklist.map((i) => i.text)).toEqual(["A", "B", "C", "Z"]);
  });

  it("chèn 60 lần liên tiếp vào CÙNG một chỗ: order luôn duy nhất & đúng thứ tự (tự đánh số lại khi cạn độ chính xác)", async () => {
    const first = await add(member, "đầu");
    await add(member, "cuối");
    const expected: string[] = [];
    for (let i = 0; i < 60; i++) {
      await add(member, `x${i}`, first.item.id);
      expected.unshift(`x${i}`);
    }
    const items = (await stored()).checklist;
    expect(items.map((i) => i.text)).toEqual(["đầu", ...expected, "cuối"]);
    expect(new Set(items.map((i) => i.order)).size).toBe(items.length);
  });

  it("TASK_003 (409) khi đủ 100 mục; nhãn lỗi giữ nguyên số đếm", async () => {
    for (let i = 0; i < LIMITS.task.checklistMax; i++) await add(member, `m${i}`);
    const err = await catchError(add(member, "mục 101"));
    expect([err.statusCode, err.errorCode]).toEqual([409, "TASK_003"]);
    expect((await stored()).checklistTotal).toBe(LIMITS.task.checklistMax);
  });

  it("GUEST/người ngoài → 404; MEMBER trên bảng đã lưu trữ → 403; thẻ đã xoá → 404", async () => {
    const guest = h.addUser("GUEST");
    expect((await catchError(add(guest, "x"))).statusCode).toBe(404);
    expect((await catchError(add({ id: "f".repeat(24), email: "x@e.com" }, "x"))).statusCode).toBe(404);

    await h.boardService.archive(owner, board.id);
    expect((await catchError(add(member, "x"))).statusCode).toBe(403);
    await h.boardService.restore(owner, board.id);

    await h.detailService.remove(member, task.id);
    expect((await catchError(add(member, "x"))).statusCode).toBe(404);
  });
});

describe("task-checklist.service — tick / gộp activity 60 s", () => {
  it("tick: done + doneBy/doneAt, checklistDone +1, version +1; bỏ tick trả về 0 (PM2-02: 2/4 = 50%)", async () => {
    const items = [await add(member, "1"), await add(member, "2"), await add(member, "3"), await add(member, "4")];
    await h.checklistService.patch(member, task.id, items[0].item.id, { done: true });
    const res = await h.checklistService.patch(member, task.id, items[1].item.id, { done: true });

    expect(res).toMatchObject({ checklistDone: 2, checklistTotal: 4 });
    expect(res.item).toMatchObject({ done: true, doneBy: member.id });
    expect(res.item.doneAt).not.toBeNull();
    const s = await stored();
    expect([s.checklistDone, s.checklistTotal]).toEqual([2, 4]);

    const undone = await h.checklistService.patch(member, task.id, items[1].item.id, { done: false });
    expect(undone).toMatchObject({ checklistDone: 1 });
    expect(undone.item).toMatchObject({ done: false, doneBy: null, doneAt: null });
  });

  it("tick LẶP không tăng bộ đếm/version hai lần và không ghi thêm activity (PM2-22)", async () => {
    const it1 = await add(member, "1");
    const first = await h.checklistService.patch(member, task.id, it1.item.id, { done: true });
    const activities = h.activities.activities.length;
    const events = h.emitter.events.length;
    const again = await h.checklistService.patch(member, task.id, it1.item.id, { done: true });

    expect(again).toMatchObject({ checklistDone: 1, version: first.version });
    expect(h.activities.activities).toHaveLength(activities);
    expect(h.emitter.events).toHaveLength(events);
  });

  it("PM2-22: tick/untick 10 lần trong 30 s → 1 activity gộp, hiển thị KẾT QUẢ CUỐI (mục + trạng thái cuối)", async () => {
    const it1 = await add(member, "Mục A");
    const it2 = await add(member, "Mục B");
    for (let i = 0; i < 10; i++) {
      await h.checklistService.patch(member, task.id, it1.item.id, { done: i % 2 === 0 });
      h.travel(2_000); // 10 lần trong 20 s
    }
    await h.checklistService.patch(member, task.id, it2.item.id, { done: true });

    const toggles = h.activities.activities.filter((a) => a.type === "CHECKLIST_DONE" || a.type === "CHECKLIST_UNDONE");
    expect(toggles).toHaveLength(1);
    expect(toggles[0].groupKey).toBe(`cl:${member.id}`);
    expect(toggles[0].type).toBe("CHECKLIST_DONE"); // lần cuối là tick Mục B
    expect(toggles[0].after?.["items"]).toEqual([
      { itemId: it1.item.id, text: "Mục A", done: false }, // 10 lần: tick, bỏ, tick, … → cuối cùng bỏ tick
      { itemId: it2.item.id, text: "Mục B", done: true },
    ]);
  });

  it("quá 60 s → bản ghi MỚI; người khác → bản ghi riêng; activity khác xen vào (đổi tên mục) cắt nhóm", async () => {
    const it1 = await add(member, "1");
    const it2 = await add(member, "2");
    await h.checklistService.patch(member, task.id, it1.item.id, { done: true });
    h.travel(61_000);
    await h.checklistService.patch(member, task.id, it2.item.id, { done: true });
    await h.checklistService.patch(member2, task.id, it1.item.id, { done: false });
    await h.checklistService.patch(member2, task.id, it1.item.id, { done: true });

    const toggles = h.activities.activities.filter((a) => a.type.startsWith("CHECKLIST_DONE") || a.type === "CHECKLIST_UNDONE");
    // member@t0, member@t0+61s, member2 (2 lần gộp làm 1)
    expect(toggles.map((a) => a.actorId)).toEqual([member.id, member.id, member2.id]);

    await h.checklistService.patch(member2, task.id, it2.item.id, { text: "2 (sửa)" });
    await h.checklistService.patch(member2, task.id, it2.item.id, { done: false });
    expect(h.activities.activities.filter((a) => a.groupKey === `cl:${member2.id}`)).toHaveLength(2);
  });
});

describe("task-checklist.service — sửa / đổi chỗ / xoá", () => {
  it("sửa text → CHECKLIST_EDITED (before/after); cùng text → không ghi gì", async () => {
    const a = await add(member, "cũ");
    await h.checklistService.patch(member, task.id, a.item.id, { text: "mới" });
    const edited = h.activities.activities.at(-1)!;
    expect([edited.type, edited.before, edited.after]).toEqual(["CHECKLIST_EDITED", { text: "cũ" }, { itemId: a.item.id, text: "mới" }]);

    const count = h.activities.activities.length;
    const same = await h.checklistService.patch(member, task.id, a.item.id, { text: "mới" });
    expect(h.activities.activities).toHaveLength(count);
    expect(same.item.text).toBe("mới");
  });

  it("đổi chỗ: lên đầu (null), ra sau mục khác; tự trỏ vào chính mình = không đổi; không ghi activity", async () => {
    const [a, b, c] = [await add(member, "A"), await add(member, "B"), await add(member, "C")];
    const count = h.activities.activities.length;

    await h.checklistService.patch(member, task.id, c.item.id, { moveAfterItemId: null });
    expect((await stored()).checklist.map((i) => i.text)).toEqual(["C", "A", "B"]);
    await h.checklistService.patch(member, task.id, c.item.id, { moveAfterItemId: a.item.id });
    expect((await stored()).checklist.map((i) => i.text)).toEqual(["A", "C", "B"]);
    await h.checklistService.patch(member, task.id, a.item.id, { moveAfterItemId: b.item.id });
    expect((await stored()).checklist.map((i) => i.text)).toEqual(["C", "B", "A"]);

    const version = (await stored()).version;
    await h.checklistService.patch(member, task.id, a.item.id, { moveAfterItemId: a.item.id });
    expect((await stored()).version).toBe(version);
    expect(h.activities.activities).toHaveLength(count); // đổi thứ tự không phải hoạt động đáng ghi
  });

  it("xoá: total −1; xoá mục ĐÃ tick giảm cả done; ghi CHECKLIST_REMOVED; mục không còn → 404", async () => {
    const a = await add(member, "A");
    const b = await add(member, "B");
    await h.checklistService.patch(member, task.id, a.item.id, { done: true });

    const res = await h.checklistService.remove(member, task.id, a.item.id);
    expect(res).toMatchObject({ checklistDone: 0, checklistTotal: 1 });
    expect(res.item).toMatchObject({ id: a.item.id, text: "A" });
    expect(h.activities.activities.at(-1)).toMatchObject({ type: "CHECKLIST_REMOVED", before: { itemId: a.item.id, text: "A" } });

    await h.checklistService.remove(member, task.id, b.item.id);
    const gone = await catchError(h.checklistService.remove(member, task.id, b.item.id));
    expect(gone.statusCode).toBe(404);
    expect((await catchError(h.checklistService.patch(member, task.id, b.item.id, { done: true }))).statusCode).toBe(404);
  });
});
