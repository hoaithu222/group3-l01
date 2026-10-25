import { AppError } from "../../../core/exceptions";
import type { ColumnKindValue } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import type { DependencyEdge } from "../services/dependency-graph";
import { STATIC_DEPENDENCY_LIMITS } from "../services/dependency-limits";
import { computeGantt, GanttService } from "../services/gantt.service";
import { ServiceHarness } from "./support/service-harness";

const HCM = "Asia/Ho_Chi_Minh";
const at = (s: string): Date => new Date(`2026-${s}+07:00`);

function mk(id: string, o: { start?: string; due?: string; kind?: ColumnKindValue; blockedBy?: number; columnId?: string } = {}): Task {
  return {
    id,
    boardId: "b",
    columnId: o.columnId ?? "c_aaaaaaaa",
    title: `Thẻ ${id}`,
    columnKind: o.kind ?? "TODO",
    startDate: o.start ? at(o.start) : null,
    dueDate: o.due ? at(o.due) : null,
    assigneeIds: [],
    blockedByCount: o.blockedBy ?? 0,
  } as unknown as Task;
}

const e = (p: string, s: string): DependencyEdge => ({ predecessorId: p, successorId: s });

describe("gantt.computeGantt (p4-04 be.md §5.7, PM2-28) — đường găng theo ngày thực tế", () => {
  it("slackDays 0 / dương / âm; isCritical (slack ≤ 0) và conflict (slack < 0)", () => {
    const tasks = [
      mk("T", { due: "10-05T17:00:00" }),
      mk("S0", { start: "10-06T09:00:00", due: "10-07T17:00:00" }), // bắt đầu ngay ngày sau hạn T → slack 0
      mk("S3", { start: "10-09T09:00:00", due: "10-10T17:00:00" }), // dư 3 ngày
      mk("SX", { start: "10-04T09:00:00", due: "10-04T18:00:00" }), // bắt đầu TRƯỚC hạn T → xung đột
    ];
    const g = computeGantt(tasks, [e("T", "S0"), e("T", "S3"), e("T", "SX")], HCM);
    expect(g.edges.map((x) => [x.successorId, x.slackDays])).toEqual([["S0", 0], ["S3", 3], ["SX", -2]]);
    const by = (id: string) => g.tasks.find((t) => t.id === id)!;
    // slackDays(T) = min các cạnh ra = -2 ⇒ xung đột + găng.
    expect(by("T")).toMatchObject({ slackDays: -2, conflict: true, isCritical: true });
    expect(by("S0")).toMatchObject({ slackDays: null, isCritical: true, conflict: false }); // cạnh vào slack 0
    expect(by("S3")).toMatchObject({ slackDays: null, isCritical: false, conflict: false });
    expect(by("SX")).toMatchObject({ isCritical: true }); // cạnh vào slack -2 ≤ 0
  });

  it("thẻ dư ngày không găng; slack của thẻ trước = MIN các cạnh ra (0 thắng 3)", () => {
    const tasks = [mk("T", { due: "10-05T17:00:00" }), mk("S0", { start: "10-06T09:00:00" }), mk("S3", { start: "10-09T09:00:00" }), mk("Solo", { due: "10-01T09:00:00" })];
    const g = computeGantt(tasks, [e("T", "S3"), e("T", "S0")], HCM);
    expect(g.tasks.find((t) => t.id === "T")).toMatchObject({ slackDays: 0, isCritical: true, conflict: false });
    expect(g.tasks.find((t) => t.id === "Solo")).toMatchObject({ slackDays: null, isCritical: false, conflict: false });
    const onlyLoose = computeGantt([mk("T", { due: "10-05T17:00:00" }), mk("S3", { start: "10-09T09:00:00" })], [e("T", "S3")], HCM);
    expect(onlyLoose.tasks.find((t) => t.id === "T")).toMatchObject({ slackDays: 3, isCritical: false });
  });

  it("thẻ sau DONE, thẻ trước không có hạn, thẻ sau không có ngày → cạnh không tính slack (null), không găng", () => {
    const g = computeGantt(
      [mk("T", { due: "10-05T17:00:00" }), mk("Done", { start: "10-05T09:00:00", kind: "DONE" }), mk("NoDue"), mk("S", { start: "10-06T09:00:00" }), mk("NoDates")],
      [e("T", "Done"), e("NoDue", "S"), e("T", "NoDates")],
      HCM
    );
    expect(g.edges.map((x) => x.slackDays)).toEqual([null, null, null]);
    expect(g.tasks.every((t) => !t.isCritical && !t.conflict && t.slackDays === null)).toBe(true);
  });

  it("thẻ sau chỉ có dueDate dùng hạn làm mốc; múi giờ quyết định 'ngày' (cùng mốc UTC, khác kết luận)", () => {
    const tasks = [mk("T", { due: "10-05T23:30:00" }), mk("S", { due: "10-06T12:00:00" })];
    expect(computeGantt(tasks, [e("T", "S")], HCM).edges[0].slackDays).toBe(0);
    // T = 16:30Z (10-05), S = 05:00Z (10-06): ở UTC cách 1 ngày → slack 0; kiểm chứng tz khác nhau cho kết quả khác khi vượt nửa đêm.
    const late = [mk("T", { due: "10-05T23:30:00" }), mk("S", { start: "10-06T00:30:00" })]; // S = 17:30Z ngày 10-05
    expect(computeGantt(late, [e("T", "S")], HCM).edges[0].slackDays).toBe(0);
    expect(computeGantt(late, [e("T", "S")], "UTC").edges[0].slackDays).toBe(-1);
  });

  it("trả blockedByCount, mảng người làm (CHỈ id) và columnId của từng thẻ", () => {
    const g = computeGantt([mk("T", { due: "10-05T17:00:00", blockedBy: 2, columnId: "c_bbbbbbbb" })], [], HCM);
    expect(g.tasks[0]).toMatchObject({ id: "T", columnId: "c_bbbbbbbb", columnKind: "TODO", blockedByCount: 2, assigneeIds: [], startDate: null, dueDate: at("10-05T17:00:00").toISOString() });
  });
});

describe("GanttService.get (in-memory)", () => {
  let h: ServiceHarness;
  const range = { from: at("10-01T00:00:00"), to: at("10-31T00:00:00") };

  const build = async () => {
    h = new ServiceHarness();
    const owner = h.addUser("OWNER");
    const guest = h.addUser("GUEST");
    const board = await h.createBoard(owner);
    const a = await h.addDatedTask(owner, board, "A", { start: "2026-10-02T09:00:00+07:00", due: "2026-10-05T17:00:00+07:00" });
    const b = await h.addDatedTask(owner, board, "B", { start: "2026-10-06T09:00:00+07:00", due: "2026-10-08T17:00:00+07:00" });
    await h.addDatedTask(owner, board, "Ngoài khoảng", { start: "2027-01-01T09:00:00+07:00", due: "2027-01-02T09:00:00+07:00" });
    await h.addDatedTask(owner, board, "Không ngày", {});
    await h.dependencyService.add(owner, b.id, a.id);
    return { owner, guest, board, a, b };
  };
  const svc = (limits = STATIC_DEPENDENCY_LIMITS) => new GanttService({ access: h.access, dependencies: h.dependencyRepo, timezone: () => Promise.resolve(HCM), limits });

  it("chỉ thẻ CÓ ngày giao khoảng + cạnh giữa các thẻ đó; kèm timezone/from/to; GUEST 404", async () => {
    const { owner, guest, board, a, b } = await build();
    const g = await svc().get(owner, board.id, range);
    expect(g.tasks.map((t) => t.id).sort()).toEqual([a.id, b.id].sort());
    expect(g.edges).toEqual([{ predecessorId: a.id, successorId: b.id, slackDays: 0 }]);
    expect(g).toMatchObject({ timezone: HCM, truncated: false, from: range.from.toISOString(), to: range.to.toISOString() });
    await expect(svc().get(guest, board.id, range)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("múi giờ tính ngày theo NHÓM chứa bảng (đồng bộ chéo #9): provider nhận workspaceId của bảng, kết quả đổi theo múi giờ đó", async () => {
    const { owner, board, a, b } = await build();
    const seen: string[] = [];
    const tokyo = new GanttService({
      access: h.access,
      dependencies: h.dependencyRepo,
      timezone: (workspaceId) => {
        seen.push(workspaceId);
        return Promise.resolve("Asia/Tokyo");
      },
      limits: STATIC_DEPENDENCY_LIMITS,
    });
    const g = await tokyo.get(owner, board.id, range);
    expect(seen).toEqual([h.workspaceId]);
    expect(g.timezone).toBe("Asia/Tokyo");
    // A hạn 2026-10-05 17:00 (+07) = 19:00 Tokyo cùng ngày; B bắt đầu 2026-10-06 09:00 (+07) = 11:00 Tokyo → vẫn slack 0 (ngày kế tiếp), tính bằng ngày TOKYO.
    expect(g.edges).toEqual([{ predecessorId: a.id, successorId: b.id, slackDays: 0 }]);
  });

  it("vượt ganttTasksMax hiệu lực → truncated (chỉ giữ số thẻ đầu)", async () => {
    const { owner, board } = await build();
    const g = await svc({ load: () => Promise.resolve({ ...{ dependenciesMax: 50, dependencyGraphVisitMax: 5000, rescheduleSyncMax: 200, rescheduleBulkMax: 5000, rescheduleEmitEachMax: 50 }, ganttRangeMaxDays: 366, ganttTasksMax: 1 }) }).get(owner, board.id, range);
    expect(g.tasks).toHaveLength(1);
    expect(g.truncated).toBe(true);
  });

  it("khoảng vượt trần HIỆU LỰC (admin hạ ganttRangeMaxDays) → 400 VAL_001, dù DTO chỉ kiểm trần cứng", async () => {
    const { owner, board } = await build();
    const limits = { load: () => Promise.resolve({ dependenciesMax: 50, dependencyGraphVisitMax: 5000, rescheduleSyncMax: 200, rescheduleBulkMax: 5000, rescheduleEmitEachMax: 50, ganttRangeMaxDays: 7, ganttTasksMax: 2000 }) };
    const err = (await svc(limits).get(owner, board.id, range).catch((x: unknown) => x)) as AppError;
    expect([err.statusCode, err.errorCode]).toEqual([400, "VAL_001"]);
  });
});
