import { LIMITS } from "../../../core/constants/limits";
import { ScopeNotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type { IContributionDirectory } from "../repositories/contribution-directory.repository.interface";
import type { IContributionFactRepository } from "../repositories/contribution-fact.repository.interface";
import type { ContributionAccess } from "./contribution-access";
import { isOnTime, round1, round2 } from "./contribution-calculator";
import type { ContributionContextLoader } from "./contribution-context";
import { parsePeriod } from "./period";

export interface MemberTaskItemDto {
  taskId: string;
  /** `null` khi thẻ đã xoá (app hiện "(đã xoá)") — tiêu đề thẻ đã xoá không được trả lại. */
  title: string | null;
  deleted: boolean;
  storyPoints: number | null;
  /** Điểm được tính cho người này (điểm thẻ hoặc điểm mặc định cho thẻ chưa gán, chia đều theo số người làm). */
  sharedPoints: number;
  assigneeCount: number;
  dueDate: string | null;
  completedAt: string;
  onTime: boolean | null;
  reviewScoreAvg: number | null;
  reviewCount: number;
}

export interface MemberTasksPage {
  items: MemberTaskItemDto[];
  nextCursor: string | null;
  limit: number;
}

export interface MemberTasksDeps {
  access: ContributionAccess;
  context: ContributionContextLoader;
  facts: IContributionFactRepository;
  directory: IContributionDirectory;
}

export class ContributionMemberTasksService {
  constructor(private readonly d: MemberTasksDeps) {}

  /** Thẻ được tính của MỘT người trong kỳ (mới → cũ) — minh bạch: mỗi điểm đều truy được về thẻ gốc. */
  async list(user: AuthUser, boardId: string, userId: string, query: { period: string; cursor?: string; limit: number }): Promise<MemberTasksPage> {
    const board = await this.d.access.readBoard(user, boardId);
    if (!(await this.d.directory.isKnownMember(board.workspaceId, userId))) throw new ScopeNotFoundError();
    const ctx = await this.d.context.load(board);
    const period = parsePeriod(query.period, ctx.timezone);
    const range = { from: period.from, to: period.to };
    const limit = Math.min(query.limit, LIMITS.contribution.memberTasksPageMax);
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const page = await this.d.facts.listMemberTaskFacts(boardId, userId, range, cursor ? { at: cursor.at, taskId: cursor.id } : null, limit);
    const ids = page.items.map((f) => f.taskId);
    const [tasks, reviews] = await Promise.all([this.d.directory.getTasks(ids), this.d.facts.listReviewFactsForTasks(boardId, ids, range)]);
    const { unestimatedPoints, onTimeGraceHours } = ctx.config;

    const items = page.items.map((f): MemberTaskItemDto => {
      const task = tasks.get(f.taskId);
      const assigneeCount = new Set(f.assigneeIds).size || 1;
      const scores = reviews.filter((r) => r.taskId === f.taskId && r.score10 !== null).map((r) => r.score10 as number);
      return {
        taskId: f.taskId,
        title: task && !task.deleted ? task.title : null,
        deleted: !task || task.deleted,
        storyPoints: f.storyPoints,
        sharedPoints: round2((f.storyPoints ?? unestimatedPoints) / assigneeCount),
        assigneeCount,
        dueDate: f.dueDate ? f.dueDate.toISOString() : null,
        completedAt: f.completedAt.toISOString(),
        onTime: isOnTime(f.completedAt, f.dueDate, ctx.timezone, onTimeGraceHours),
        reviewScoreAvg: scores.length > 0 ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        reviewCount: scores.length,
      };
    });
    return { items, nextCursor: page.nextCursor ? encodeCursor(page.nextCursor.at, page.nextCursor.taskId) : null, limit };
  }
}
