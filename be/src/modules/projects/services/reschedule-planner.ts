import { createHash } from "crypto";
import { localDate, startOfLocalDay, startOfLocalDayPlus, diffLocalDates } from "../../../core/utils/local-date";
import type { ColumnKindValue } from "../entities/board.interface";
import type { DependencyEdge } from "./dependency-graph";

/**
 * Bộ lập kế hoạch dời lịch (p4-04 be.md §5.2) — THUẦN, không I/O. Đường găng "theo ngày thực tế": thẻ sau phải bắt
 * đầu từ ngày SAU hạn muộn nhất của các thẻ trước; dời giữ nguyên thời lượng và giờ trong ngày.
 */
export interface PlannerTask {
  id: string;
  version: number;
  title: string;
  startDate: Date | null;
  dueDate: Date | null;
  columnKind: ColumnKindValue;
  deletedAt: Date | null;
  assigneeIds: string[];
}

export interface PlanSource {
  id: string;
  version: number;
  newStartDate?: Date | null;
  newDueDate: Date;
}

export interface PlanAffected {
  taskId: string;
  title: string;
  assigneeIds: string[];
  expectedVersion: number;
  oldStartDate: Date | null;
  oldDueDate: Date | null;
  newStartDate: Date | null;
  newDueDate: Date | null;
  shiftDays: number;
}

export type SkipReason = "DONE" | "NO_DATES" | "DELETED";

export interface PlanSkipped {
  taskId: string;
  title: string;
  reason: SkipReason;
}

export interface ReschedulePlan {
  affected: PlanAffected[];
  skipped: PlanSkipped[];
  previewToken: string;
  mode: "SYNC" | "BULK";
}

export interface PlanLimits {
  syncMax: number;
  bulkMax: number;
}

export class RescheduleTooLargeError extends Error {
  constructor(readonly affected: number) {
    super(`Dời lịch vượt trần (${affected} thẻ)`);
    this.name = "RescheduleTooLargeError";
  }
}

/** Cộng `days` ngày LỊCH theo múi giờ, giữ nguyên giờ trong ngày. */
export function addLocalDays(at: Date, days: number, tz: string): Date {
  const offsetInDay = at.getTime() - startOfLocalDay(at, tz).getTime();
  return new Date(startOfLocalDayPlus(at, tz, days).getTime() + offsetInDay);
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

function skipReason(t: PlannerTask | undefined): SkipReason | null {
  if (!t || t.deletedAt) return "DELETED";
  if (t.columnKind === "DONE") return "DONE";
  if (!t.startDate && !t.dueDate) return "NO_DATES";
  return null;
}

/** Chèn `value` vào `list[from…]` (đã sắp tăng) đúng vị trí. */
function insertSorted(list: string[], value: string, from: number): void {
  let lo = from;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  list.splice(lo, 0, value);
}

export function planReschedule(
  source: PlanSource,
  tasks: Map<string, PlannerTask>,
  edges: DependencyEdge[],
  tz: string,
  limits: PlanLimits
): ReschedulePlan {
  const out = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    const outs = out.get(e.predecessorId);
    if (outs) outs.push(e.successorId);
    else out.set(e.predecessorId, [e.successorId]);
    const ins = incoming.get(e.successorId);
    if (ins) ins.push(e.predecessorId);
    else incoming.set(e.successorId, [e.predecessorId]);
  }

  // 1. BFS theo cạnh ra; thẻ bị bỏ qua KHÔNG lan truyền tiếp.
  const inSub = new Set<string>([source.id]);
  const seen = new Set<string>([source.id]);
  const skipped: PlanSkipped[] = [];
  let queue = [source.id];
  while (queue.length > 0) {
    const next: string[] = [];
    for (const id of queue) {
      for (const s of out.get(id) ?? []) {
        if (seen.has(s)) continue;
        seen.add(s);
        const t = tasks.get(s);
        const reason = skipReason(t);
        if (reason) {
          skipped.push({ taskId: s, title: t?.title ?? "", reason });
          continue;
        }
        inSub.add(s);
        next.push(s);
      }
    }
    queue = next;
  }

  // 2. Tô-pô (Kahn) trên đồ thị con, hoà theo id để ổn định.
  const indeg = new Map<string, number>();
  for (const id of inSub) indeg.set(id, (incoming.get(id) ?? []).filter((p) => inSub.has(p)).length);
  const order: string[] = [];
  // `ready` luôn được giữ SẮP TĂNG (chèn nhị phân) để hoà theo id ổn định mà không sắp lại cả danh sách mỗi lần (đồ thị rộng ~5.000 thẻ).
  const ready = [...inSub].filter((id) => indeg.get(id) === 0).sort();
  let head = 0;
  while (head < ready.length) {
    const id = ready[head];
    head += 1;
    order.push(id);
    for (const s of out.get(id) ?? []) {
      if (!inSub.has(s)) continue;
      const d = (indeg.get(s) ?? 0) - 1;
      indeg.set(s, d);
      if (d === 0) insertSorted(ready, s, head);
    }
  }

  // 3. Tính hạn mới theo thứ tự tô-pô.
  const newDue = new Map<string, Date | null>([[source.id, source.newDueDate]]);
  const affected: PlanAffected[] = [];
  for (const id of order) {
    if (id === source.id) continue;
    const t = tasks.get(id) as PlannerTask;
    let maxPred: Date | null = null;
    for (const p of incoming.get(id) ?? []) {
      let due: Date | null = null;
      if (inSub.has(p)) due = newDue.has(p) ? (newDue.get(p) ?? null) : (tasks.get(p)?.dueDate ?? null);
      else {
        const pt = tasks.get(p);
        if (pt && !pt.deletedAt && pt.columnKind !== "DONE") due = pt.dueDate;
      }
      if (due && (!maxPred || due > maxPred)) maxPred = due;
    }
    const anchor = (t.startDate ?? t.dueDate) as Date;
    const shiftDays = maxPred ? Math.max(0, diffLocalDates(localDate(anchor, tz), localDate(startOfLocalDayPlus(maxPred, tz, 1), tz))) : 0;
    if (shiftDays === 0) {
      newDue.set(id, t.dueDate);
      continue;
    }
    const newStartDate = t.startDate ? addLocalDays(t.startDate, shiftDays, tz) : null;
    const newDueDate = t.dueDate ? addLocalDays(t.dueDate, shiftDays, tz) : null;
    newDue.set(id, newDueDate);
    affected.push({
      taskId: id,
      title: t.title,
      assigneeIds: t.assigneeIds,
      expectedVersion: t.version,
      oldStartDate: t.startDate,
      oldDueDate: t.dueDate,
      newStartDate,
      newDueDate,
      shiftDays,
    });
  }

  if (affected.length > limits.bulkMax) throw new RescheduleTooLargeError(affected.length);

  const previewToken = createHash("sha256")
    .update(
      JSON.stringify([
        source.id,
        source.version,
        iso(source.newDueDate),
        affected.map((a) => [a.taskId, a.expectedVersion, iso(a.newDueDate)]),
        skipped.map((s) => [s.taskId, s.reason]),
      ])
    )
    .digest("hex");

  return { affected, skipped, previewToken, mode: affected.length > limits.syncMax ? "BULK" : "SYNC" };
}
