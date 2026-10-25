import { addDaysToLocalDate, localDate } from "../../../../core/utils/local-date";
import type { IActivityDailyRepository } from "../../repositories/activity-daily.repository.interface";
import type { IContributionDirectory } from "../../repositories/contribution-directory.repository.interface";
import type { ActivityRefreshService } from "../activity-refresh.service";
import type { BoardContext } from "../contribution-context";
import type { ContributionReportDto } from "../contribution.presenter";
import type { ContributionService } from "../contribution.service";
import { isoWeekStartDayKey, isoWeekOfDayKey, type Period } from "../period";
import { dateTimeLabel, dayLabel, periodLabel, shortDateTimeLabel, weightsLabel } from "./export-labels";
import type { PdfHeatmap, PdfMember, PdfReportInput } from "./contribution-pdf.renderer";
import { hashCanonical } from "./verify-code";

export const HEATMAP_WEEKS = 26;

export interface ExportData {
  report: ContributionReportDto;
  workspaceName: string;
  boardName: string;
  timezone: string;
  heatmap: PdfHeatmap | null;
  /** Dữ liệu chuẩn hoá đem băm — chỉ id + số (không tên, thời điểm tạo) nên cùng dữ liệu ⇒ cùng mã băm. */
  canonical: unknown;
  dataHash: string;
}

export interface ExportDataDeps {
  reports: ContributionService;
  directory: IContributionDirectory;
  daily: IActivityDailyRepository;
  refresh: ActivityRefreshService;
  now?: () => Date;
}

const MEMBERSHIP_LABEL = { ACTIVE: null, LEFT: "Đã rời nhóm", ANONYMIZED: "Tài khoản đã xoá" } as const;

/** Dựng dữ liệu để xuất PDF: báo cáo TÍNH MỚI (không qua snapshot/cache), tóm tắt heatmap, dữ liệu chuẩn hoá + mã băm, và đầu vào cho bộ dựng PDF. */
export class ExportDataBuilder {
  private readonly now: () => Date;

  constructor(private readonly d: ExportDataDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async build(ctx: BoardContext, period: Period, includeHeatmap: boolean): Promise<ExportData> {
    const data = await this.d.reports.reportData(ctx, period, { fresh: true });
    const report = await this.d.reports.present(ctx, period, data);
    const [workspaceName, heatmap] = await Promise.all([
      this.d.directory.getWorkspaceName(ctx.board.workspaceId),
      includeHeatmap ? this.heatmap(ctx) : Promise.resolve(null),
    ]);
    const canonical = {
      boardId: ctx.board.id,
      period: period.key,
      formula: {
        weights: report.formula.weights,
        onTimeGraceHours: report.formula.onTimeGraceHours,
        unestimatedPoints: report.formula.unestimatedPoints,
        formulaVersion: report.formula.formulaVersion,
      },
      members: report.members.map((m) => ({
        userId: m.user.id,
        storyPointsDone: m.storyPointsDone,
        tasksDone: m.tasksDone,
        unestimatedTasks: m.unestimatedTasks,
        tasksWithDue: m.tasksWithDue,
        tasksOnTime: m.tasksOnTime,
        tasksLate: m.tasksLate,
        reviewCount: m.reviewCount,
        peerScoreAvg: m.peerScoreAvg,
        score: m.score,
        share: m.share,
      })),
      totals: report.totals,
      heatmap: heatmap ? { firstMonday: heatmap.firstMonday, weeks: heatmap.weeks, days: heatmap.days } : null,
    };
    return {
      report,
      workspaceName: workspaceName ?? "",
      boardName: ctx.board.name,
      timezone: ctx.timezone,
      heatmap,
      canonical,
      dataHash: hashCanonical(canonical),
    };
  }

  /** `<boardId>:<kỳ>:<mã băm>:<0|1>` — khoá chống xuất trùng cùng dữ liệu. */
  dedupeKey(boardId: string, periodKey: string, dataHash: string, includeHeatmap: boolean): string {
    return `${boardId}:${periodKey}:${dataHash}:${includeHeatmap ? 1 : 0}`;
  }

  toPdfInput(data: ExportData, ctx: BoardContext, period: Period, ids: { verifyCode: string; dataHash: string }): PdfReportInput {
    const { report } = data;
    const changedAt = ctx.state.configChangedAt;
    const changedBy = report.formula.changedBy?.name;
    const previous = report.formula.previousWeights;
    const members: PdfMember[] = report.members.map((m) => ({
      name: m.user.name,
      membershipLabel: MEMBERSHIP_LABEL[m.user.membership],
      storyPointsDone: m.storyPointsDone,
      tasksDone: m.tasksDone,
      tasksWithDue: m.tasksWithDue,
      tasksOnTime: m.tasksOnTime,
      tasksLate: m.tasksLate,
      reviewCount: m.reviewCount,
      peerScoreAvg: m.peerScoreAvg,
      score: m.score,
      share: m.share,
      explanation: m.explanation,
    }));
    return {
      workspaceName: data.workspaceName,
      boardName: data.boardName,
      periodLabel: periodLabel(period, data.timezone),
      timezone: data.timezone,
      generatedAtLabel: dateTimeLabel(this.now(), data.timezone),
      weights: report.formula.weights,
      onTimeGraceHours: report.formula.onTimeGraceHours,
      definitions: report.formula.definitions,
      configChangeNote: changedAt
        ? `Trọng số đổi lúc ${shortDateTimeLabel(changedAt, data.timezone)}${changedBy ? ` bởi ${changedBy}` : ""}${previous ? ` (trước: ${weightsLabel(previous)})` : ""}`
        : null,
      members,
      totals: report.totals,
      maxStoryPoints: report.maxStoryPoints,
      heatmap: data.heatmap,
      verifyCode: ids.verifyCode,
      dataHash: ids.dataHash,
    };
  }

  /** 26 tuần gần nhất (thứ Hai → Chủ nhật) của CẢ BẢNG; ngày không có bản ghi = 0. */
  private async heatmap(ctx: BoardContext): Promise<PdfHeatmap> {
    await this.d.refresh.refreshIfStale(ctx.board, ctx.timezone, ctx.state).catch(() => undefined);
    const today = localDate(this.now(), ctx.timezone);
    const { year, week } = isoWeekOfDayKey(today);
    const thisMonday = isoWeekStartDayKey(year, week);
    const firstMonday = addDaysToLocalDate(thisMonday, -(HEATMAP_WEEKS - 1) * 7);
    const lastSunday = addDaysToLocalDate(thisMonday, 6);
    const rows = await this.d.daily.list({ boardId: ctx.board.id, from: firstMonday, to: lastSunday });
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r.date, (totals.get(r.date) ?? 0) + r.total);
    const days = Array.from({ length: HEATMAP_WEEKS * 7 }, (_, i) => totals.get(addDaysToLocalDate(firstMonday, i)) ?? 0);
    const active = days.filter((v) => v > 0).length;
    const max = Math.max(0, ...days);
    const maxDay = max > 0 ? addDaysToLocalDate(firstMonday, days.indexOf(max)) : null;
    return {
      firstMonday,
      weeks: HEATMAP_WEEKS,
      days,
      summary:
        active > 0 && maxDay
          ? `${active} ngày có hoạt động trong ${HEATMAP_WEEKS} tuần, nhiều nhất ${dayLabel(maxDay)} (${max}).`
          : `Chưa có hoạt động trong ${HEATMAP_WEEKS} tuần gần nhất.`,
    };
  }
}
