import type { Board, BoardColumn, ColumnKindValue } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import type { TaskReviewMeta } from "../events/project-events";
import type { TxContext } from "../repositories/unit-of-work";

interface MoveContextBase {
  board: Board;
  fromColumn: BoardColumn;
  toColumn: BoardColumn;
  /** `null` = hệ thống (tự chuyển Done khi đủ duyệt). */
  actorId: string | null;
  now: Date;
  tx: TxContext;
}

/** Ngữ cảnh KIỂM TRA trước khi ghi (thẻ còn ở trạng thái cũ). */
export interface TaskMovePolicyContext extends MoveContextBase {
  task: Task;
}

/** Ngữ cảnh HIỆU ỨNG sau khi thẻ đã ghi trong transaction (`before` = cũ, `after` = mới). */
export interface TaskMoveEffectContext extends MoveContextBase {
  before: Task;
  after: Task;
}

/** Metadata hoàn thành mà policy trả về, gộp vào payload outbox `task.completed` (Phase 3: rỗng). */
export interface TaskCompletionMeta {
  review?: TaskReviewMeta;
}

/**
 * Chặn thẻ VÀO cột DONE (chỉ chạy khi `toColumn.kind === DONE` và thẻ chưa ở DONE). Ném `AppError`
 * (vd `TASK_002`) để chặn; trả `TaskCompletionMeta` để bổ sung dữ liệu cho `task.completed`. Phase 3: chưa có policy
 * nào — p4-05 thêm `ReviewDonePolicy`.
 */
export interface TaskMovePolicy {
  readonly name: string;
  check(ctx: TaskMovePolicyContext): Promise<TaskCompletionMeta | void>;
}

/**
 * Hiệu ứng CHẠY TRONG transaction `move` khi thẻ đổi loại cột (`from.kind !== to.kind`) — p4-05 mở lượt review khi
 * vào REVIEW, huỷ khi rời. Ném lỗi → cả `move` rollback (không có thẻ ở REVIEW mà thiếu lượt chấm).
 */
export interface TaskMoveEffect {
  readonly name: string;
  onEnterKind?(kind: ColumnKindValue, ctx: TaskMoveEffectContext): Promise<void>;
  onLeaveKind?(kind: ColumnKindValue, ctx: TaskMoveEffectContext): Promise<void>;
}

export class TaskMoveRegistry {
  private readonly policies: TaskMovePolicy[] = [];
  private readonly effects: TaskMoveEffect[] = [];

  /** Đăng ký lại cùng `name` thì THAY THẾ (giữ vị trí) — import lặp/dựng lại container không nhân đôi (như `registerTaskEventSink`, `registerRevokeListener`). */
  registerPolicy(policy: TaskMovePolicy): void {
    const i = this.policies.findIndex((p) => p.name === policy.name);
    if (i >= 0) this.policies[i] = policy;
    else this.policies.push(policy);
  }

  registerEffect(effect: TaskMoveEffect): void {
    const i = this.effects.findIndex((e) => e.name === effect.name);
    if (i >= 0) this.effects[i] = effect;
    else this.effects.push(effect);
  }

  /** Chạy tuần tự (thứ tự đăng ký), gộp metadata; lỗi của policy propagate nguyên vẹn. */
  async runPolicies(ctx: TaskMovePolicyContext): Promise<TaskCompletionMeta> {
    const merged: TaskCompletionMeta = {};
    for (const policy of this.policies) {
      const meta = await policy.check(ctx);
      if (meta?.review) merged.review = { ...merged.review, ...meta.review };
    }
    return merged;
  }

  async runEffects(ctx: TaskMoveEffectContext): Promise<void> {
    if (ctx.fromColumn.kind === ctx.toColumn.kind) return;
    for (const effect of this.effects) {
      await effect.onLeaveKind?.(ctx.fromColumn.kind, ctx);
      await effect.onEnterKind?.(ctx.toColumn.kind, ctx);
    }
  }

  clear(): void {
    this.policies.length = 0;
    this.effects.length = 0;
  }
}

/** Registry dùng chung của tiến trình (p4-05 đăng ký lúc import module review). */
export const taskMoveRegistry = new TaskMoveRegistry();
export const registerTaskMovePolicy = (policy: TaskMovePolicy): void => taskMoveRegistry.registerPolicy(policy);
export const registerTaskMoveEffect = (effect: TaskMoveEffect): void => taskMoveRegistry.registerEffect(effect);
