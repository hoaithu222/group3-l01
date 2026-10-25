import type { ReviewFact, TaskFact } from "../entities/contribution.interface";
import type { IContributionDirectory } from "../repositories/contribution-directory.repository.interface";
import type { IContributionFactRepository } from "../repositories/contribution-fact.repository.interface";
import type { BoardContext } from "./contribution-context";
import { calculateContribution, type CalcResult } from "./contribution-calculator";
import { monthKeyOf, parsePeriod, periodContains, PERIOD_ALL, weekKeyOf, type Period } from "./period";

export interface ComputeInputs {
  tasks: TaskFact[];
  reviews: ReviewFact[];
  /** Thành viên hiện tại (ACTIVE, không GUEST) — luôn có dòng dù chưa đóng góp. */
  memberIds: string[];
}

/** Đọc fact + thành viên của một bảng rồi tính theo từng kỳ (bộ tính thuần nằm ở `contribution-calculator.ts`). */
export class ContributionComputer {
  constructor(
    private readonly facts: IContributionFactRepository,
    private readonly directory: IContributionDirectory
  ) {}

  async loadInputs(ctx: BoardContext): Promise<ComputeInputs> {
    const [tasks, reviews, memberIds] = await Promise.all([
      this.facts.listActiveTaskFacts(ctx.board.id),
      this.facts.listReviewFacts(ctx.board.id),
      this.directory.listMemberIds(ctx.board.workspaceId),
    ]);
    return { tasks, reviews, memberIds };
  }

  computePeriod(inputs: ComputeInputs, ctx: BoardContext, period: Period): CalcResult {
    return calculateContribution({
      tasks: inputs.tasks.filter((t) => periodContains(period, t.completedAt)),
      reviews: inputs.reviews.filter((r) => periodContains(period, r.submittedAt)),
      config: ctx.config,
      memberIds: inputs.memberIds,
      timezone: ctx.timezone,
    });
  }

  /** `ALL` + mọi tháng có thẻ hoàn thành hoặc lượt chấm (tuần không lưu). */
  periodKeys(inputs: ComputeInputs, timezone: string): string[] {
    const months = new Set<string>();
    for (const t of inputs.tasks) months.add(monthKeyOf(t.completedAt, timezone));
    for (const r of inputs.reviews) months.add(monthKeyOf(r.submittedAt, timezone));
    return [PERIOD_ALL, ...[...months].sort()];
  }

  /** Tháng + tuần (mới nhất trước) có dữ liệu — cho `GET /periods`. */
  listPeriods(inputs: ComputeInputs, timezone: string, weeksMax: number): { months: string[]; weeks: string[] } {
    const months = new Set<string>();
    const weeks = new Set<string>();
    const instants = [...inputs.tasks.map((t) => t.completedAt), ...inputs.reviews.map((r) => r.submittedAt)];
    for (const at of instants) {
      months.add(monthKeyOf(at, timezone));
      weeks.add(weekKeyOf(at, timezone));
    }
    return { months: [...months].sort().reverse(), weeks: [...weeks].sort().reverse().slice(0, weeksMax) };
  }

  period(key: string, timezone: string): Period {
    return parsePeriod(key, timezone);
  }
}
