import { LIMITS } from "../../../core/constants/limits";
import { NotFoundError, ScopeNotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { logger } from "../../../infrastructure/logger";
import type { ConvertChecklistItemDto } from "../dtos";
import type { ChecklistItem, Task } from "../entities/task.interface";
import { presentTaskCards, type TaskCardDto } from "./task.presenter";
import type { TaskDetailDeps } from "./task-detail.deps";
import { TaskPublisher } from "./task-publisher";
import type { TaskService } from "./task.service";

export interface ConvertChecklistResult {
  /** Thẻ MỚI (từ mục việc nhỏ). */
  task: TaskCardDto;
  /** Trạng thái checklist của thẻ CHA sau khi mục bị chuyển đi. */
  source: { taskId: string; checklistDone: number; checklistTotal: number; version: number };
  /** `false` khi đây là lần gọi lại (mục đã được chuyển trước đó) — trả thẻ đã tạo, không tạo thêm. */
  created: boolean;
}

/** Khoá idempotent tất định theo mục: gọi lại sau khi thành công (mất mạng) trả lại đúng thẻ đã tạo thay vì 404. */
export const convertClientTaskId = (itemId: string): string => `checklist-${itemId}`;

const sourceOf = (t: Task): ConvertChecklistResult["source"] => ({ taskId: t.id, checklistDone: t.checklistDone, checklistTotal: t.checklistTotal, version: t.version });

/**
 * Chuyển mục checklist thành thẻ (p3-03 P1, `POST /tasks/:id/checklist/:itemId/convert`): mục bị GỠ khỏi checklist thẻ cha và thành thẻ mới ở cột TODO đầu
 * tiên (hoặc `columnId`), người tạo = người thực hiện, không người làm/nhãn/hạn.
 *
 * Thứ tự an toàn: (1) kiểm quyền tạo thẻ TRƯỚC; (2) GỠ mục bằng lệnh nguyên tử — đúng MỘT người thắng khi hai người bấm cùng lúc, người thua nhận 404;
 * (3) tạo thẻ qua `TaskService.create` (trần thẻ, vị trí, chính sách DONE…); (4) tạo lỗi ⇒ trả mục về checklist (chưa tick) rồi ném lại lỗi — không mất việc.
 */
export class TaskConvertService {
  private readonly publisher: TaskPublisher;

  constructor(
    private readonly d: Pick<TaskDetailDeps, "access" | "tasks" | "checklist" | "activityRepo" | "emitter" | "directory" | "clock">,
    private readonly tasks: Pick<TaskService, "create">
  ) {
    this.publisher = new TaskPublisher(d.emitter, d.directory, d.clock);
  }

  async convert(user: AuthUser, taskId: string, itemId: string, dto: ConvertChecklistItemDto): Promise<ConvertChecklistResult> {
    const { task: parent } = await this.d.access.task(user, taskId, "workspace.task.update");
    await this.d.access.board(user, parent.boardId, "workspace.task.create");

    const clientTaskId = convertClientTaskId(itemId);
    const write = await this.d.checklist.remove(taskId, itemId);
    if (write.status === "gone") throw new ScopeNotFoundError();
    if (write.status !== "changed" || !write.removed) return this.replay(user, parent, clientTaskId);

    const removed = write.removed;
    let created: Awaited<ReturnType<TaskService["create"]>>;
    try {
      created = await this.tasks.create(user, parent.boardId, {
        title: removed.text,
        columnId: dto.columnId,
        assigneeIds: [],
        labelIds: [],
        clientTaskId,
        clientMutationId: dto.clientMutationId,
      });
    } catch (err) {
      await this.restoreItem(parent.id, removed);
      throw err;
    }

    const activity = await this.d.activityRepo.create({
      taskId: parent.id,
      boardId: parent.boardId,
      workspaceId: parent.workspaceId,
      actorId: user.id,
      type: "CHECKLIST_REMOVED",
      before: { itemId, text: removed.text },
      after: { convertedTaskId: created.task.id },
      groupKey: null,
    });
    await Promise.all([this.publisher.updated(write.task, user.id, ["checklist"]), this.publisher.activities(parent.boardId, [activity])]);
    return { task: created.task, source: sourceOf(write.task), created: true };
  }

  /** Mục đã biến mất: nếu CHÍNH người này đã chuyển nó (cùng `clientTaskId`) ⇒ trả lại thẻ đã tạo; ngược lại 404 như xoá mục. */
  private async replay(user: AuthUser, parent: Task, clientTaskId: string): Promise<ConvertChecklistResult> {
    const existing = await this.d.tasks.findByClientTaskId(parent.boardId, user.id, clientTaskId);
    if (!existing) throw new NotFoundError("Không tìm thấy việc nhỏ");
    const current = (await this.d.tasks.findById(parent.id)) ?? parent;
    const [card] = await presentTaskCards([existing], this.d.directory, this.now());
    return { task: card, source: sourceOf(current), created: false };
  }

  /** Bù trừ khi tạo thẻ lỗi: đặt mục về lại đúng chỗ (`order` cũ), chưa tick. Best-effort — thất bại chỉ log (lỗi gốc vẫn được ném). */
  private async restoreItem(taskId: string, item: ChecklistItem): Promise<void> {
    try {
      await this.d.checklist.add(taskId, { ...item, done: false, doneBy: null, doneAt: null }, LIMITS.task.checklistMax);
    } catch (err) {
      logger.error("[projects] không trả được mục checklist sau khi chuyển thành thẻ thất bại", { taskId, itemId: item.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private now(): Date {
    return this.d.clock ? this.d.clock() : new Date();
  }
}
