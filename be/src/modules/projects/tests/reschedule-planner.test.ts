import type { ColumnKindValue } from "../entities/board.interface";
import type { DependencyEdge } from "../services/dependency-graph";
import {
  planReschedule,
  RescheduleTooLargeError,
  type PlannerTask,
  type PlanSource,
  type ReschedulePlan,
} from "../services/reschedule-planner";

const HCM = "Asia/Ho_Chi_Minh";
const LIMITS_DEFAULT = { syncMax: 200, bulkMax: 5000 };

/** Ngày viết theo giờ Việt Nam (+07:00). */
const d = (s: string): Date => new Date(`2026-${s}+07:00`);
const iso = (s: string): string => d(s).toISOString();

interface TaskSpec {
  start?: string | null;
  due?: string | null;
  kind?: ColumnKindValue;
  deleted?: boolean;
  version?: number;
  assignees?: string[];
}

function tasksOf(spec: Record<string, TaskSpec>): Map<string, PlannerTask> {
  return new Map(
    Object.entries(spec).map(([id, s]) => [
      id,
      {
        id,
        version: s.version ?? 1,
        title: `Thẻ ${id}`,
        startDate: s.start ? d(s.start) : null,
        dueDate: s.due ? d(s.due) : null,
        columnKind: s.kind ?? "TODO",
        deletedAt: s.deleted ? new Date() : null,
        assigneeIds: s.assignees ?? [],
      },
    ])
  );
}

const e = (p: string, s: string): DependencyEdge => ({ predecessorId: p, successorId: s });
const source = (newDue: string, version = 1): PlanSource => ({ id: "A", version, newDueDate: d(newDue) });

function plan(spec: Record<string, TaskSpec>, edges: DependencyEdge[], newDue: string, tz = HCM, limits = LIMITS_DEFAULT): ReschedulePlan {
  return planReschedule(source(newDue), tasksOf(spec), edges, tz, limits);
}

const ids = (p: ReschedulePlan): string[] => p.affected.map((a) => a.taskId);

describe("reschedule-planner.planReschedule (p4-04 be.md §5.2, PM2-25)", () => {
  it("PM2-25: chuỗi A→B→C và D→C, nhánh A→F(DONE)→G, A→E(không ngày); lùi A +3 ngày", () => {
    const spec: Record<string, TaskSpec> = {
      A: { start: "10-01T09:00:00", due: "10-03T17:00:00" },
      B: { start: "10-04T09:00:00", due: "10-06T17:00:00" },
      C: { start: "10-07T09:00:00", due: "10-10T17:00:00" },
      D: { due: "10-11T20:00:00" }, // thẻ trước của C nằm NGOÀI đồ thị con, chưa DONE
      E: {},
      F: { start: "10-04T09:00:00", due: "10-05T17:00:00", kind: "DONE" },
      G: { start: "10-06T09:00:00", due: "10-07T17:00:00" },
    };
    const edges = [e("A", "B"), e("B", "C"), e("D", "C"), e("A", "F"), e("F", "G"), e("A", "E")];
    const p = plan(spec, edges, "10-06T17:00:00");

    // B +3 ngày (10-07 09:00 → 10-09 17:00, giữ thời lượng + giờ trong ngày).
    const b = p.affected.find((a) => a.taskId === "B");
    expect(b).toMatchObject({ shiftDays: 3, expectedVersion: 1 });
    expect(b?.newStartDate?.toISOString()).toBe(iso("10-07T09:00:00"));
    expect(b?.newDueDate?.toISOString()).toBe(iso("10-09T17:00:00"));
    // C theo max(B mới = 10-09, D = 10-11) + 1 ngày = 10-12 → start 10-07 → +5 ngày.
    const c = p.affected.find((a) => a.taskId === "C");
    expect(c).toMatchObject({ shiftDays: 5 });
    expect(c?.newStartDate?.toISOString()).toBe(iso("10-12T09:00:00"));
    expect(c?.newDueDate?.toISOString()).toBe(iso("10-15T17:00:00"));
    // Thứ tự áp = tô-pô (B trước C); F(DONE) và E(không ngày) vào `skipped`, G KHÔNG được dời cũng không liệt kê (dừng lan truyền).
    expect(ids(p)).toEqual(["B", "C"]);
    expect(p.skipped).toEqual(expect.arrayContaining([{ taskId: "F", title: "Thẻ F", reason: "DONE" }, { taskId: "E", title: "Thẻ E", reason: "NO_DATES" }]));
    expect(p.skipped).toHaveLength(2);
    expect(p.mode).toBe("SYNC");
  });

  it("thẻ ĐÃ XOÁ hoặc không tải được → skipped DELETED (không dời, không lan truyền)", () => {
    const spec = { A: { due: "10-03T17:00:00" }, B: { start: "10-04T09:00:00", due: "10-05T17:00:00", deleted: true }, C: { start: "10-06T09:00:00", due: "10-07T17:00:00" } };
    const p = plan(spec, [e("A", "B"), e("B", "C"), e("A", "Ghost")], "10-20T17:00:00");
    expect(p.affected).toEqual([]);
    expect(p.skipped.map((s) => [s.taskId, s.reason]).sort()).toEqual([["B", "DELETED"], ["Ghost", "DELETED"]]);
  });

  it("chỉ có dueDate (không startDate): dùng hạn làm mốc, startDate mới vẫn null", () => {
    const spec = { A: { due: "10-03T17:00:00" }, B: { due: "10-05T12:00:00" } };
    const p = plan(spec, [e("A", "B")], "10-07T17:00:00");
    // earliest = 10-08; mốc B = 10-05 → +3 ngày.
    expect(p.affected).toHaveLength(1);
    expect(p.affected[0]).toMatchObject({ taskId: "B", shiftDays: 3, oldStartDate: null, newStartDate: null });
    expect(p.affected[0].newDueDate?.toISOString()).toBe(iso("10-08T12:00:00"));
  });

  it("chỉ có startDate (không hạn): dời startDate, hạn vẫn null", () => {
    const spec = { A: { due: "10-03T17:00:00" }, B: { start: "10-04T09:00:00" } };
    const p = plan(spec, [e("A", "B")], "10-06T17:00:00");
    expect(p.affected[0]).toMatchObject({ taskId: "B", shiftDays: 3, oldDueDate: null, newDueDate: null });
    expect(p.affected[0].newStartDate?.toISOString()).toBe(iso("10-07T09:00:00"));
  });

  it("không vi phạm (thẻ sau đã bắt đầu đủ muộn) hoặc RÚT NGẮN hạn → affected rỗng", () => {
    const spec = { A: { due: "10-10T17:00:00" }, B: { start: "10-20T09:00:00", due: "10-22T17:00:00" }, C: { start: "10-11T09:00:00", due: "10-12T17:00:00" } };
    expect(plan(spec, [e("A", "B")], "10-15T17:00:00").affected).toEqual([]);
    // Rút ngắn: A sớm hơn — KHÔNG kéo C lên sớm (chỉ dời khi vi phạm).
    expect(plan(spec, [e("A", "C")], "10-05T17:00:00").affected).toEqual([]);
  });

  it("hạn thẻ trước cùng NGÀY với ngày bắt đầu thẻ sau vẫn là vi phạm (cần từ ngày SAU) → dời đúng 1 ngày", () => {
    const spec = { A: { due: "10-03T09:00:00" }, B: { start: "10-06T08:00:00", due: "10-07T17:00:00" } };
    const p = plan(spec, [e("A", "B")], "10-06T17:00:00");
    expect(p.affected[0].shiftDays).toBe(1);
    expect(p.affected[0].newStartDate?.toISOString()).toBe(iso("10-07T08:00:00"));
  });

  it("thẻ trước NGOÀI đồ thị con: DONE hoặc đã xoá không ràng buộc; chưa DONE có hạn thì ràng buộc", () => {
    const base = { A: { due: "10-03T17:00:00" }, C: { start: "10-05T09:00:00", due: "10-06T17:00:00" } };
    const edges = [e("A", "C"), e("D", "C")];
    const late = { due: "10-20T17:00:00" };
    expect(plan({ ...base, D: { ...late, kind: "DONE" as const } }, edges, "10-04T17:00:00").affected).toEqual([]);
    expect(plan({ ...base, D: { ...late, deleted: true } }, edges, "10-04T17:00:00").affected).toEqual([]);
    const constrained = plan({ ...base, D: late }, edges, "10-04T17:00:00");
    expect(constrained.affected[0]).toMatchObject({ taskId: "C", shiftDays: 16 }); // 10-05 → 10-21
  });

  it("hình thoi A→B, A→C, B→D, C→D: D tính SAU cả hai và theo thẻ trước muộn nhất", () => {
    const spec = {
      A: { due: "10-03T17:00:00" },
      B: { start: "10-04T09:00:00", due: "10-05T17:00:00" },
      C: { start: "10-04T09:00:00", due: "10-09T17:00:00" }, // dài hơn B
      D: { start: "10-06T09:00:00", due: "10-08T17:00:00" },
    };
    const p = plan(spec, [e("A", "B"), e("A", "C"), e("B", "D"), e("C", "D")], "10-06T17:00:00");
    expect(ids(p)).toEqual(["B", "C", "D"]);
    const dAffected = p.affected.find((a) => a.taskId === "D");
    // C mới: 10-07 → 10-12; D phải bắt đầu từ 10-13 (từ 10-06 → +7).
    expect(dAffected?.shiftDays).toBe(7);
    expect(dAffected?.newStartDate?.toISOString()).toBe(iso("10-13T09:00:00"));
  });

  it("thứ tự tô-pô ổn định: cùng đầu vào → cùng kết quả (hoà theo id)", () => {
    const spec = {
      A: { due: "10-03T17:00:00" },
      X: { start: "10-04T09:00:00", due: "10-05T17:00:00" },
      M: { start: "10-04T09:00:00", due: "10-05T17:00:00" },
      B: { start: "10-04T09:00:00", due: "10-05T17:00:00" },
    };
    const edges = [e("A", "X"), e("A", "M"), e("A", "B")];
    const first = ids(plan(spec, edges, "10-10T17:00:00"));
    expect(first).toEqual(["B", "M", "X"]);
    expect(ids(plan(spec, [...edges].reverse(), "10-10T17:00:00"))).toEqual(first);
  });

  it("PM2-04-like: giữ thời lượng và người làm được mang theo (để gộp thông báo)", () => {
    const spec = { A: { due: "10-03T17:00:00" }, B: { start: "10-04T09:00:00", due: "10-06T17:00:00", assignees: ["lan"] } };
    const p = plan(spec, [e("A", "B")], "10-05T17:00:00");
    const b = p.affected[0];
    expect(b.assigneeIds).toEqual(["lan"]);
    expect((b.newDueDate as Date).getTime() - (b.newStartDate as Date).getTime()).toBe(d("10-06T17:00:00").getTime() - d("10-04T09:00:00").getTime());
  });

  it("qua nửa đêm theo múi giờ: cùng mốc UTC, kết luận khác nhau ở Asia/Ho_Chi_Minh và UTC", () => {
    // A hạn 23:30 ngày 10-05 (+07 = 16:30Z); B bắt đầu 00:30 ngày 10-06 (+07 = 17:30Z ngày 10-05).
    const spec = { A: { due: "10-03T17:00:00" }, B: { start: "10-06T00:30:00", due: "10-06T12:00:00" } };
    const edges = [e("A", "B")];
    expect(plan(spec, edges, "10-05T23:30:00", HCM).affected).toEqual([]); // B bắt đầu NGÀY SAU hạn A ở giờ Việt Nam
    const utc = plan(spec, edges, "10-05T23:30:00", "UTC");
    expect(utc.affected).toHaveLength(1); // ở UTC cả hai cùng ngày 10-05 ⇒ vi phạm
    expect(utc.affected[0].shiftDays).toBe(1);
  });

  it("previewToken: ổn định với cùng đầu vào; đổi khi version thẻ (nguồn hoặc sau), hạn mới, hay danh sách bỏ qua đổi", () => {
    const spec: Record<string, TaskSpec> = {
      A: { due: "10-03T17:00:00" },
      B: { start: "10-04T09:00:00", due: "10-06T17:00:00" },
      E: {},
    };
    const edges = [e("A", "B"), e("A", "E")];
    const t0 = plan(spec, edges, "10-06T17:00:00").previewToken;
    expect(t0).toMatch(/^[a-f0-9]{64}$/);
    expect(plan(spec, edges, "10-06T17:00:00").previewToken).toBe(t0);
    expect(plan({ ...spec, B: { ...spec.B, version: 2 } }, edges, "10-06T17:00:00").previewToken).not.toBe(t0);
    expect(planReschedule(source("10-06T17:00:00", 9), tasksOf(spec), edges, HCM, LIMITS_DEFAULT).previewToken).not.toBe(t0);
    expect(plan(spec, edges, "10-07T17:00:00").previewToken).not.toBe(t0);
    expect(plan({ ...spec, E: { start: "10-05T09:00:00" } }, edges, "10-06T17:00:00").previewToken).not.toBe(t0); // E hết NO_DATES
  });

  it("mode: SYNC khi ≤ syncMax; BULK khi lớn hơn; vượt bulkMax → RescheduleTooLargeError (TASK_021)", () => {
    const chain = (n: number): { spec: Record<string, TaskSpec>; edges: DependencyEdge[] } => {
      const spec: Record<string, TaskSpec> = { A: { due: "10-03T17:00:00" } };
      const edges: DependencyEdge[] = [];
      for (let i = 1; i <= n; i += 1) {
        spec[`T${String(i).padStart(3, "0")}`] = { start: "10-04T09:00:00", due: "10-04T17:00:00" };
        edges.push(e(i === 1 ? "A" : `T${String(i - 1).padStart(3, "0")}`, `T${String(i).padStart(3, "0")}`));
      }
      return { spec, edges };
    };
    const lim = { syncMax: 3, bulkMax: 5 };
    const small = chain(3);
    expect(plan(small.spec, small.edges, "10-10T17:00:00", HCM, lim).mode).toBe("SYNC");
    const mid = chain(5);
    const midPlan = plan(mid.spec, mid.edges, "10-10T17:00:00", HCM, lim);
    expect([midPlan.mode, midPlan.affected.length]).toEqual(["BULK", 5]);
    const big = chain(6);
    expect(() => plan(big.spec, big.edges, "10-10T17:00:00", HCM, lim)).toThrow(RescheduleTooLargeError);
  });

  it("đồ thị RỘNG 5.000 thẻ sau một nguồn: lập kế hoạch nhanh (chèn nhị phân, không sắp lại mỗi lần) và thứ tự theo id ổn định", () => {
    const spec: Record<string, TaskSpec> = { A: { due: "10-03T17:00:00" } };
    const edges: DependencyEdge[] = [];
    for (let i = 0; i < 5000; i += 1) {
      const id = `W${String(i).padStart(5, "0")}`;
      spec[id] = { start: "10-04T09:00:00", due: "10-05T17:00:00" };
      edges.push(e("A", id));
    }
    const started = Date.now();
    const p = plan(spec, edges.reverse(), "10-10T17:00:00"); // cạnh đảo ngược: kết quả vẫn phải sắp theo id
    expect(Date.now() - started).toBeLessThan(3000);
    expect(p.affected).toHaveLength(5000);
    expect(ids(p)).toEqual(Object.keys(spec).filter((k) => k !== "A").sort());
    expect(p.mode).toBe("BULK");
  });

  it("chuỗi nhiều thẻ dời dây chuyền: mỗi thẻ sau dời theo hạn MỚI của thẻ trước nó", () => {
    const spec = {
      A: { due: "10-03T17:00:00" },
      B: { start: "10-04T09:00:00", due: "10-05T17:00:00" },
      C: { start: "10-06T09:00:00", due: "10-07T17:00:00" },
    };
    const p = plan(spec, [e("A", "B"), e("B", "C")], "10-06T17:00:00");
    expect(p.affected.map((a) => [a.taskId, a.shiftDays])).toEqual([["B", 3], ["C", 3]]);
  });
});
