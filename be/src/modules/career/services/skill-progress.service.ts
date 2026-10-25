import { normalizeSkillLabel } from "../../../core/utils/normalize";
import { logger } from "../../../infrastructure/logger";
import { taskCompletedSchema, taskReopenedSchema, type TaskCompletedContract } from "../../../shared/events/domain-events";
import { creditDelta, isZeroDelta, type ProgressDelta, type SkillDefinition, type UserSkillTaskCredit } from "../entities/skill.interface";
import type { ISkillDefinitionRepository } from "../repositories/skill-definition.repository.interface";
import type { CreditValues, ISkillCreditRepository, IUserSkillProgressRepository } from "../repositories/skill-ledger.repository.interface";
import type { ISkillSourceRepository } from "../repositories/skill-source.repository";
import { UniqueViolationError, type ITxRunner, type TxHandle } from "../repositories/tx";
import type { ISkillConfigPort } from "./career.ports";
import type { SkillEvaluationService } from "./skill-evaluation.service";

export interface SkillProgressDeps {
  definitions: ISkillDefinitionRepository;
  credits: ISkillCreditRepository;
  progress: IUserSkillProgressRepository;
  source: ISkillSourceRepository;
  tx: ITxRunner;
  config: ISkillConfigPort;
  evaluation: SkillEvaluationService;
}

const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

/**
 * Tiến độ kỹ năng TĂNG DẦN từ sự kiện thẻ (p6-06 be.md §5). Idempotent nhờ `UserSkillTaskCredit` unique `(userId, skillId, taskId)` + `completionCount`:
 * task Done → mở lại → Done lần nữa KHÔNG đếm 2 lần (CR-02). Credit và `UserSkillProgress` đổi CÙNG transaction; lệch do sự cố → cron đối soát.
 *
 * Điểm review lấy TỪ NGUỒN lúc hoàn thành (`TaskReview` của lượt `review.roundId`): `ReviewDonePolicy` (p4-05) chặn DONE tới khi lượt chấm APPROVED nên
 * mọi điểm của lần hoàn thành đó đã có khi `task.completed` tới — không cần thêm hàng outbox `review.submitted` riêng cho p6-06.
 */
export class SkillProgressService {
  constructor(private readonly d: SkillProgressDeps) {}

  /** Trả số credit vừa được tính (mới hoặc kích hoạt lại). Payload sai hợp đồng → bỏ qua có log (retry không làm nó đúng lên). */
  async onTaskCompleted(raw: unknown): Promise<number> {
    const parsed = taskCompletedSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn("[skill.progress] payload task.completed sai hợp đồng — bỏ qua", { issues: parsed.error.issues.slice(0, 3) });
      return 0;
    }
    const e = parsed.data;
    const labels = uniq(e.labelNames.map(normalizeSkillLabel).filter(Boolean));
    const assignees = uniq(e.assigneeIds);
    if (labels.length === 0 || assignees.length === 0 || e.storyPoints === null) return 0;
    if (e.storyPoints < (await this.d.config.creditMinStoryPoints())) return 0;
    // Bảng bật chấm chéo mà lượt chấm chưa APPROVED → không tính (CR-22).
    if (e.review.enabled && !e.review.approved) return 0;
    const skills = await this.d.definitions.findByLabels(labels);
    if (skills.length === 0) return 0;
    // Sự kiện cũ (thẻ đã hoàn thành lần mới hơn) hoặc thẻ đã bị mở lại sau lần này (reopen tới trước completed) → không tính.
    const state = await this.d.source.taskState(e.taskId);
    if (state && (state.completionCount > e.completionCount || (state.completionCount === e.completionCount && state.columnKind !== "DONE"))) return 0;

    const reviewScoreX10 = e.review.enabled && e.review.roundId ? await this.d.source.roundReviewAvgX10(e.review.roundId) : null;
    const values: CreditValues = {
      workspaceId: e.workspaceId,
      // Chia đều cho người làm TẠI LÚC Done (CR-23: 5 điểm, 2 người → 2,5 mỗi người), lưu ×10.
      storyPointsX10: Math.round((e.storyPoints * 10) / assignees.length),
      reviewScoreX10,
      completedAt: new Date(e.completedAt),
      completionCount: e.completionCount,
      status: "ACTIVE",
    };
    let applied = 0;
    for (const userId of assignees) {
      for (const skill of skills) if (await this.creditOne(userId, skill, e, values)) applied += 1;
    }
    return applied;
  }

  /** Mở lại: gỡ credit ACTIVE của task (tracker chính xác). Huy hiệu ĐÃ cấp vẫn giữ — không tự thu hồi (README §2). */
  async onTaskReopened(raw: unknown): Promise<number> {
    const parsed = taskReopenedSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn("[skill.progress] payload task.reopened sai hợp đồng — bỏ qua", { issues: parsed.error.issues.slice(0, 3) });
      return 0;
    }
    const { taskId, completionCount } = parsed.data;
    let revoked = 0;
    for (const c of await this.d.credits.listByTask(taskId)) {
      if (c.status !== "ACTIVE" || c.completionCount > completionCount) continue;
      const done = await this.d.tx.run(async (tx) => {
        if (!(await this.d.credits.transition(c.id, { status: "ACTIVE", completionCount: c.completionCount }, { status: "REVOKED" }, tx))) return false;
        await this.d.progress.increment(c.userId, c.skillId, creditDelta(c, -1), tx);
        return true;
      });
      if (done) revoked += 1;
    }
    return revoked;
  }

  /** Ghi credit cho MỘT (người, kỹ năng) rồi đánh giá cấp huy hiệu. Đua tạo cùng credit (P2002) → thử lại một lần theo nhánh "đã có". */
  private async creditOne(userId: string, skill: SkillDefinition, e: TaskCompletedContract, values: CreditValues): Promise<boolean> {
    await this.d.progress.ensure(userId, skill.id);
    let delta: ProgressDelta | null = null;
    for (let attempt = 0; attempt < 2 && delta === null; attempt += 1) {
      try {
        delta = await this.d.tx.run(async (tx) => {
          const cur = await this.d.credits.findByKey(userId, skill.id, e.taskId, tx);
          const change = await this.applyCredit(cur, { userId, skillId: skill.id, taskId: e.taskId }, values, tx);
          if (change && !isZeroDelta(change)) await this.d.progress.increment(userId, skill.id, { ...change, lastTaskAt: values.completedAt }, tx);
          return change ?? { tasksDone: 0, storyPointsX10: 0, reviewScoreSumX10: 0, reviewScoreCount: 0 };
        });
      } catch (err) {
        if (!(err instanceof UniqueViolationError) || attempt === 1) throw err;
      }
    }
    if (!delta || isZeroDelta(delta)) return false;
    await this.d.evaluation.evaluate(userId, skill);
    return delta.tasksDone > 0;
  }

  /**
   * Chuyển trạng thái credit theo `completionCount` (null = không đổi gì):
   *  - chưa có → tạo ACTIVE (+1 task);
   *  - cùng lần hoàn thành hoặc cũ hơn đã ghi → bỏ (CR-02);
   *  - REVOKED lần cũ hơn → kích hoạt lại với số liệu mới (+1 task);
   *  - ACTIVE lần cũ hơn (lỡ sự kiện mở lại) → cập nhật số liệu, chỉ cộng CHÊNH LỆCH (không +1 task).
   */
  private async applyCredit(
    cur: UserSkillTaskCredit | null,
    key: Pick<UserSkillTaskCredit, "userId" | "skillId" | "taskId">,
    values: CreditValues,
    tx: TxHandle
  ): Promise<ProgressDelta | null> {
    if (!cur) {
      await this.d.credits.create({ ...key, ...values }, tx);
      return creditDelta(values, 1);
    }
    if (cur.completionCount >= values.completionCount) return null;
    if (!(await this.d.credits.transition(cur.id, { status: cur.status, completionCount: cur.completionCount }, values, tx))) return null;
    if (cur.status === "REVOKED") return creditDelta(values, 1);
    const plus = creditDelta(values, 1);
    const minus = creditDelta(cur, -1);
    return {
      tasksDone: 0,
      storyPointsX10: plus.storyPointsX10 + minus.storyPointsX10,
      reviewScoreSumX10: plus.reviewScoreSumX10 + minus.reviewScoreSumX10,
      reviewScoreCount: plus.reviewScoreCount + minus.reviewScoreCount,
    };
  }
}
