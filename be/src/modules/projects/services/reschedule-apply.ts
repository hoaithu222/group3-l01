import { VersionConflictError } from "../../../core/exceptions";
import type { OutboxEventInput } from "../../../infrastructure/queue/outbox/outbox.types";
import type { ReschedulePlanItem } from "../entities/reschedule.interface";
import type { Task, TaskActivity, TaskActivityInput } from "../entities/task.interface";
import type { IEventOutbox } from "../events/event-outbox";
import { toOutboxEvent } from "../events/project-events";
import { dueChangedEvent } from "../events/task-event.factory";
import type { ITaskActivityRepository } from "../repositories/task-activity.repository.interface";
import type { ITaskRepository } from "../repositories/task.repository.interface";
import type { TxContext } from "../repositories/unit-of-work";
import { diffTask } from "./task-diff";

/** Phần ghi DB của một lần dời lịch — dùng chung đường đồng bộ (`reschedule.service`) và lô nền (`reschedule-batch.processor`). */
export interface RescheduleApplyDeps {
  tasks: ITaskRepository;
  activityRepo: ITaskActivityRepository;
  outbox: IEventOutbox;
}

export interface RescheduleApplyContext {
  actorId: string;
  boardId: string;
  workspaceId: string;
  sourceTaskId: string;
  /** Id lệnh (đồng bộ) hoặc id lô (nền) — khớp `TaskActivity.after.rescheduleId` và `task.rescheduled`. */
  rescheduleId: string;
  batchId: string | null;
}

export interface AppliedItem {
  item: ReschedulePlanItem;
  /** Phiên bản thẻ SAU khi dời (`expectedVersion + 1`). */
  newVersion: number;
}

export interface RescheduleApplyOutcome {
  applied: AppliedItem[];
  /** Thẻ đã sửa/xoá/hoàn thành giữa chừng (hoặc bảng đã lưu trữ) — KHÔNG dời. */
  conflicts: ReschedulePlanItem[];
  activities: TaskActivity[];
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const sameInstant = (a: Date | null, b: Date | null): boolean => (a === null || b === null ? a === b : a.getTime() === b.getTime());

/**
 * Áp một danh sách thẻ SAU (be.md §5.4 bước 4 / §5.6 bước 2) TRONG transaction do caller mở: đọc thẻ MỘT lần theo lô,
 * CAS từng thẻ (`updateMany where { id, version, deletedAt: null, columnKind != DONE }`), rồi ghi `RESCHEDULED` + outbox
 * `task.due-changed` bằng `createMany` (ít round-trip — transaction có timeout 10 s). Thẻ không dời được ⇒ `conflicts`;
 * caller quyết (đồng bộ: huỷ cả transaction → `TASK_019`; lô nền: ghi `CONFLICT`). `writable=false` (bảng đã lưu trữ) ⇒ mọi thẻ xung đột.
 */
export async function applyRescheduleItems(
  d: RescheduleApplyDeps,
  tx: TxContext,
  ctx: RescheduleApplyContext,
  items: ReschedulePlanItem[],
  writable = true
): Promise<RescheduleApplyOutcome> {
  const current = new Map((await d.tasks.findLiveByIds(items.map((i) => i.taskId), tx)).map((t) => [t.id, t]));
  const applied: AppliedItem[] = [];
  const conflicts: ReschedulePlanItem[] = [];
  const inputs: TaskActivityInput[] = [];
  const events: OutboxEventInput[] = [];

  for (const item of items) {
    const cur = current.get(item.taskId);
    if (!writable || !cur || cur.boardId !== ctx.boardId || cur.columnKind === "DONE" || cur.version !== item.expectedVersion) {
      conflicts.push(item);
      continue;
    }
    const dueChanged = item.newDueDate !== null && !sameInstant(cur.dueDate, item.newDueDate);
    const ok = await d.tasks.applyReschedule(
      item.taskId,
      item.expectedVersion,
      { startDate: item.newStartDate, dueDate: item.newDueDate, bumpDueVersion: dueChanged },
      tx
    );
    if (!ok) {
      conflicts.push(item);
      continue;
    }
    applied.push({ item, newVersion: item.expectedVersion + 1 });
    inputs.push({
      taskId: cur.id,
      boardId: cur.boardId,
      workspaceId: cur.workspaceId,
      actorId: ctx.actorId,
      type: "RESCHEDULED",
      before: { startDate: iso(cur.startDate), dueDate: iso(cur.dueDate) },
      after: {
        startDate: iso(item.newStartDate),
        dueDate: iso(item.newDueDate),
        sourceTaskId: ctx.sourceTaskId,
        rescheduleId: ctx.rescheduleId,
        ...(ctx.batchId && { batchId: ctx.batchId }),
      },
      groupKey: null,
    });
    if (dueChanged) {
      const after: Task = { ...cur, dueDate: item.newDueDate, dueVersion: cur.dueVersion + 1 };
      const e = dueChangedEvent(after, ctx.actorId, cur.dueDate);
      events.push(toOutboxEvent(e.payload, e.dedupeKey));
    }
  }

  const activities = await d.activityRepo.createMany(inputs, tx);
  await d.outbox.addMany(tx, events);
  return { applied, conflicts, activities };
}

export interface SourceChange {
  before: Task;
  /** `null` khi thẻ nguồn không có gì đổi (cùng ngày). */
  after: Task | null;
  activities: TaskActivity[];
}

/**
 * Cập nhật thẻ NGUỒN trong transaction: CAS `expectedVersion` (lệch → `RES_003`), ghi `START_CHANGED`/`DUE_CHANGED` theo đúng
 * khuôn PATCH (dùng lại `diffTask`) + outbox `task.due-changed`. Không có gì đổi ⇒ không ghi (không tăng `version`).
 */
export async function applySourceChange(
  d: RescheduleApplyDeps,
  tx: TxContext,
  actorId: string,
  taskId: string,
  input: { dueDate: Date; startDate?: Date | null; expectedVersion: number }
): Promise<SourceChange | null> {
  const before = await d.tasks.findById(taskId, tx);
  if (!before || before.deletedAt) return null;
  if (before.version !== input.expectedVersion) throw new VersionConflictError(before.version);
  const diff = diffTask(before, input);
  if (Object.keys(diff.set).length === 0) return { before, after: null, activities: [] };

  const after = await d.tasks.patchCas(taskId, input.expectedVersion, diff.set, tx);
  if (!after) throw new VersionConflictError((await d.tasks.findById(taskId, tx))?.version ?? before.version);
  const activities = await d.activityRepo.createMany(
    diff.activities.map((a) => ({
      taskId,
      boardId: after.boardId,
      workspaceId: after.workspaceId,
      actorId,
      type: a.type,
      before: a.before,
      after: a.after,
      groupKey: null,
    })),
    tx
  );
  if (diff.dueChanged) {
    const e = dueChangedEvent(after, actorId, before.dueDate);
    await d.outbox.add(tx, toOutboxEvent(e.payload, e.dedupeKey));
  }
  return { before, after, activities };
}
