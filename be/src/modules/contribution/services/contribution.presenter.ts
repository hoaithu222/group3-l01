import { CONTRIBUTION_FORMULA_VERSION, type ContributionConfigValue, type ContributionWeights } from "../../../core/constants/contribution";
import type { BoardContext } from "./contribution-context";
import type { CalcResult } from "./contribution-calculator";
import { definitionsOf, explanationOf, type FormulaDefinitions } from "./contribution-explain";
import { periodToDto, type Period } from "./period";
import type { BoardState, ContributionComponents, DirectoryUser, MembershipState } from "../entities/contribution.interface";

export interface ContributionUserDto {
  id: string;
  name: string;
  avatarUrl: string | null;
  membership: MembershipState;
}

export interface ContributionMemberDto {
  user: ContributionUserDto;
  storyPointsDone: number;
  tasksDone: number;
  unestimatedTasks: number;
  tasksWithDue: number;
  tasksOnTime: number;
  tasksLate: number;
  reviewCount: number;
  peerScoreAvg: number | null;
  components: ContributionComponents;
  weightsUsed: ContributionWeights;
  score: number;
  share: number;
  /** "60 × 8/8 + 20 × 3/4 + 20 × 8,0/10 = 91,0" — câu do server dựng (số theo kiểu Việt Nam). */
  explanation: string;
}

export interface ContributionFormulaDto {
  weights: ContributionWeights;
  onTimeGraceHours: number;
  unestimatedPoints: number;
  formulaVersion: number;
  definitions: FormulaDefinitions;
  changedAt: string | null;
  changedBy: { id: string; name: string } | null;
  previousWeights: ContributionWeights | null;
}

export interface ContributionReportDto {
  boardId: string;
  period: { key: string; from: string | null; to: string | null; timezone: string };
  formula: ContributionFormulaDto;
  members: ContributionMemberDto[];
  totals: { storyPointsDone: number; tasksDone: number };
  /** Điểm thẻ của người nhiều nhất nhóm — mẫu số của thành phần điểm thẻ (ghi chú dưới bảng). */
  maxStoryPoints: number;
  computedAt: string | null;
  stale: boolean;
}

export const DELETED_USER_NAME = "Tài khoản đã xoá";

export function userDto(id: string, users: ReadonlyMap<string, DirectoryUser>): ContributionUserDto {
  const u = users.get(id);
  return u ? { id, name: u.name, avatarUrl: u.avatarUrl, membership: u.membership } : { id, name: DELETED_USER_NAME, avatarUrl: null, membership: "ANONYMIZED" };
}

export function formulaDto(state: BoardState, config: ContributionConfigValue, users: ReadonlyMap<string, DirectoryUser>): ContributionFormulaDto {
  const by = state.configChangedBy;
  return {
    weights: config.weights,
    onTimeGraceHours: config.onTimeGraceHours,
    unestimatedPoints: config.unestimatedPoints,
    formulaVersion: CONTRIBUTION_FORMULA_VERSION,
    definitions: definitionsOf(config),
    changedAt: state.configChangedAt ? state.configChangedAt.toISOString() : null,
    changedBy: by ? { id: by, name: userDto(by, users).name } : null,
    previousWeights: state.previousWeights,
  };
}

export interface PresentReportInput {
  ctx: BoardContext;
  period: Period;
  calc: CalcResult;
  users: ReadonlyMap<string, DirectoryUser>;
  computedAt: Date | null;
  stale: boolean;
}

/** Sắp theo điểm giảm dần, hoà → nhiều thẻ hơn → tên (tiếng Việt) → id (ổn định giữa các lần gọi). */
export function presentReport(input: PresentReportInput): ContributionReportDto {
  const { ctx, period, calc, users } = input;
  const members = calc.members
    .map((m): ContributionMemberDto => ({
      user: userDto(m.userId, users),
      storyPointsDone: m.storyPointsDone,
      tasksDone: m.tasksDone,
      unestimatedTasks: m.unestimatedTasks,
      tasksWithDue: m.tasksWithDue,
      tasksOnTime: m.tasksOnTime,
      tasksLate: m.tasksLate,
      reviewCount: m.reviewCount,
      peerScoreAvg: m.peerScoreAvg,
      components: m.components,
      weightsUsed: m.weightsUsed,
      score: m.score,
      share: m.share,
      explanation: explanationOf(m, ctx.config.weights, calc.maxStoryPoints),
    }))
    .sort((a, b) => b.score - a.score || b.tasksDone - a.tasksDone || a.user.name.localeCompare(b.user.name, "vi") || (a.user.id < b.user.id ? -1 : 1));
  return {
    boardId: ctx.board.id,
    period: periodToDto(period, ctx.timezone),
    formula: formulaDto(ctx.state, ctx.config, users),
    members,
    totals: calc.totals,
    maxStoryPoints: calc.maxStoryPoints,
    computedAt: input.computedAt ? input.computedAt.toISOString() : null,
    stale: input.stale,
  };
}
