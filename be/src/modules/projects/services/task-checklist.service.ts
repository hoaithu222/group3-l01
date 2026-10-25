import { LIMITS } from "../../../core/constants/limits";
import { AppError, NotFoundError, ScopeNotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { newObjectId } from "../../../core/utils/object-id";
import type { AddChecklistItemDto, PatchChecklistItemDto } from "../dtos";
import type { ChecklistItem, Task, TaskActivity } from "../entities/task.interface";
import type { ChecklistWrite } from "../repositories/task-checklist.repository.interface";
import { isStrictlyBetween, neighborsAfter, orderBetween } from "./checklist-order";
import type { ChecklistItemDto } from "./task-detail.presenter";
import { toChecklistItemDto } from "./task-detail.presenter";
import type { TaskDetailDeps } from "./task-detail.deps";
import { TaskPublisher } from "./task-publisher";

export interface ChecklistResultDto {
  item: ChecklistItemDto;
  checklistDone: number;
  checklistTotal: number;
  version: number;
}

const itemNotFound = (): NotFoundError => new NotFoundError("Không tìm thấy việc nhỏ");
const limitError = (): AppError => new AppError(ErrorMessages[ErrorCode.TASK_003], 409, ErrorCode.TASK_003);

/**
 * Checklist theo TỪNG MỤC (p3-03 be.md §5): mỗi thao tác là MỘT lệnh nguyên tử trên MỘT tài liệu (`ITaskChecklistRepository`),
 * KHÔNG `expectedVersion` toàn thẻ và KHÔNG qua `BoardWriteRunner` ⇒ hai người sửa hai mục khác nhau không đụng độ
 * (PM2-21), tick lặp không tăng bộ đếm hai lần (PM2-22). Vẫn tăng `Task.version` để `task:updated` lan ra máy khác.
 */
export class TaskChecklistService {
  private readonly publisher: TaskPublisher;

  constructor(private readonly d: TaskDetailDeps) {
    this.publisher = new TaskPublisher(d.emitter, d.directory, d.clock);
  }

  async add(user: AuthUser, taskId: string, dto: AddChecklistItemDto): Promise<ChecklistResultDto> {
    let { task } = await this.d.access.task(user, taskId, "workspace.task.update");
    if (task.checklistTotal >= LIMITS.task.checklistMax) throw limitError();

    let { prev, next } = neighborsAfter(task.checklist, dto.afterItemId);
    let order = orderBetween(prev, next);
    if (!isStrictlyBetween(order, prev, next)) {
      // Chèn liên tiếp vào cùng một chỗ đã cạn độ chính xác của số thực → đánh lại `order` rồi tính lại.
      task = (await this.d.checklist.renumber(taskId)) ?? task;
      ({ prev, next } = neighborsAfter(task.checklist, dto.afterItemId));
      order = orderBetween(prev, next);
    }

    const item: ChecklistItem = { id: newObjectId(), text: dto.text, done: false, doneBy: null, doneAt: null, order };
    const res = await this.d.checklist.add(taskId, item, LIMITS.task.checklistMax);
    if (res.status === "gone") throw new ScopeNotFoundError();
    if (res.status === "limit") throw limitError();

    const activity = await this.record(res.task, user.id, "CHECKLIST_ADDED", null, { itemId: item.id, text: item.text });
    await this.publish(res.task, user.id, [activity]);
    return this.result(res.task, item.id);
  }

  async patch(user: AuthUser, taskId: string, itemId: string, dto: PatchChecklistItemDto): Promise<ChecklistResultDto> {
    const { task: seen } = await this.d.access.task(user, taskId, "workspace.task.update");
    const current = seen.checklist.find((i) => i.id === itemId);
    if (!current) throw itemNotFound();

    let latest: Task = seen;
    let changed = false;
    const activities: TaskActivity[] = [];

    if (dto.done !== undefined) {
      const write = this.mustExist(await this.d.checklist.setDone(taskId, itemId, dto.done, user.id, this.now()));
      latest = write.task;
      if (write.status === "changed") {
        changed = true;
        activities.push(await this.recordToggle(latest, user.id, itemId, current.text, dto.done));
      }
    }

    const edit = await this.planEdit(latest, itemId, current, dto);
    if (edit) {
      const write = this.mustExist(await this.d.checklist.edit(taskId, itemId, edit.set));
      latest = write.task;
      if (write.status === "changed") {
        changed = true;
        if (edit.set.text !== undefined) {
          activities.push(await this.record(latest, user.id, "CHECKLIST_EDITED", { text: current.text }, { itemId, text: edit.set.text }));
        }
      }
    }

    if (changed) await this.publish(latest, user.id, activities);
    return this.result(latest, itemId);
  }

  async remove(user: AuthUser, taskId: string, itemId: string): Promise<ChecklistResultDto> {
    await this.d.access.task(user, taskId, "workspace.task.update");
    const write = this.mustExist(await this.d.checklist.remove(taskId, itemId));
    if (write.status !== "changed" || !write.removed) throw itemNotFound();

    const activity = await this.record(write.task, user.id, "CHECKLIST_REMOVED", { itemId, text: write.removed.text }, null);
    await this.publish(write.task, user.id, [activity]);
    return {
      item: toChecklistItemDto(write.removed),
      checklistDone: write.task.checklistDone,
      checklistTotal: write.task.checklistTotal,
      version: write.task.version,
    };
  }

  /** `text` đổi thật và/hoặc chỗ mới (tính lại `order`, đánh số lại nếu cạn độ chính xác). `null` = không có gì để ghi. */
  private async planEdit(
    task: Task,
    itemId: string,
    current: ChecklistItem,
    dto: PatchChecklistItemDto
  ): Promise<{ set: { text?: string; order?: number } } | null> {
    const set: { text?: string; order?: number } = {};
    if (dto.text !== undefined && dto.text !== current.text) set.text = dto.text;

    if (dto.moveAfterItemId !== undefined && dto.moveAfterItemId !== itemId) {
      let items = task.checklist;
      let { prev, next } = neighborsAfter(items, dto.moveAfterItemId, itemId);
      let order = orderBetween(prev, next);
      if (!isStrictlyBetween(order, prev, next)) {
        items = (await this.d.checklist.renumber(task.id))?.checklist ?? items;
        ({ prev, next } = neighborsAfter(items, dto.moveAfterItemId, itemId));
        order = orderBetween(prev, next);
      }
      if (order !== current.order) set.order = order;
    }
    return set.text !== undefined || set.order !== undefined ? { set } : null;
  }

  /** Mọi kết quả `gone`/`no-item` ở đây đều là 404 (thẻ hoặc mục biến mất giữa lúc kiểm quyền và lúc ghi). */
  private mustExist<T extends ChecklistWrite>(write: T): Exclude<T, { status: "gone" | "no-item" }> {
    if (write.status === "gone") throw new ScopeNotFoundError();
    if (write.status === "no-item") throw itemNotFound();
    return write as Exclude<T, { status: "gone" | "no-item" }>;
  }

  private record(task: Task, actorId: string, type: "CHECKLIST_ADDED" | "CHECKLIST_EDITED" | "CHECKLIST_REMOVED", before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
    return this.d.activityRepo.create({
      taskId: task.id,
      boardId: task.boardId,
      workspaceId: task.workspaceId,
      actorId,
      type,
      before,
      after,
      groupKey: null,
    });
  }

  /** Tick/bỏ tick: gộp vào bản ghi MỚI NHẤT cùng người trong 60 s — `after.items` giữ trạng thái CUỐI của từng mục. */
  private recordToggle(task: Task, actorId: string, itemId: string, text: string, done: boolean): Promise<TaskActivity> {
    const type = done ? "CHECKLIST_DONE" : "CHECKLIST_UNDONE";
    const entry = { itemId, text, done };
    return this.d.activity.recordGrouped(
      { taskId: task.id, boardId: task.boardId, workspaceId: task.workspaceId, actorId, type, before: null, after: { items: [entry] } },
      `cl:${actorId}`,
      (previous) => {
        const prior = Array.isArray(previous.after?.["items"]) ? (previous.after?.["items"] as { itemId: string }[]) : [];
        const items = [...prior.filter((i) => i.itemId !== itemId), entry];
        return { type, after: { items } };
      }
    );
  }

  private async publish(task: Task, actorId: string, activities: TaskActivity[]): Promise<void> {
    await Promise.all([this.publisher.updated(task, actorId, ["checklist"]), this.publisher.activities(task.boardId, activities)]);
  }

  private result(task: Task, itemId: string): ChecklistResultDto {
    const item = task.checklist.find((i) => i.id === itemId);
    if (!item) throw itemNotFound();
    return { item: toChecklistItemDto(item), checklistDone: task.checklistDone, checklistTotal: task.checklistTotal, version: task.version };
  }

  private now(): Date {
    return this.d.clock ? this.d.clock() : new Date();
  }
}
