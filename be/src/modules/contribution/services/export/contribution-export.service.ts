import { AppError, ScopeNotFoundError } from "../../../../core/exceptions";
import { HttpStatusCode } from "../../../../core/constants/http-status";
import { LIMITS } from "../../../../core/constants/limits";
import type { AuthUser } from "../../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../../core/utils/error.codes";
import type { ContributionExportRecord, ExportStatus } from "../../entities/contribution.interface";
import type { IContributionExportRepository } from "../../repositories/contribution-export.repository.interface";
import { isUniqueViolation, type IContribOutbox, type ITxRunner } from "../../repositories/tx";
import type { ContributionAccess } from "../contribution-access";
import type { ContributionContextLoader } from "../contribution-context";
import { parsePeriod } from "../period";
import type { ExportDataBuilder } from "./contribution-export-data";
import type { IContribAssets } from "./contribution-export.ports";
import { generateVerifyCode } from "./verify-code";

export const EXPORT_QUEUE = "reports" as const;
export const EXPORT_JOB = "contribution.export" as const;

export interface RequestExportDto {
  period: string;
  includeHeatmap: boolean;
}

export interface ExportRefDto {
  exportId: string;
  status: ExportStatus;
}

export interface ExportDto {
  id: string;
  status: ExportStatus;
  periodKey: string;
  includeHeatmap: boolean;
  verifyCode: string;
  dataHash: string;
  createdAt: string;
  readyAt: string | null;
  expiresAt: string;
  /** Chỉ khi `?download=1` và tệp `READY` — URL ký sống ≤ 60 giây, cấp NGAY lúc bấm mở. */
  url?: string;
}

export interface ContributionExportDeps {
  access: ContributionAccess;
  context: ContributionContextLoader;
  builder: ExportDataBuilder;
  exports: IContributionExportRepository;
  assets: IContribAssets;
  tx: ITxRunner;
  outbox: IContribOutbox;
  now?: () => Date;
}

/**
 * Yêu cầu xuất PDF + xem trạng thái/tải (p4-06 be.md §5.7). Quyền: thành viên đọc được bảng (OWNER/ADMIN/MEMBER; khách/người ngoài `404`).
 * Cùng kỳ + cùng dữ liệu đã có bản `READY` còn hạn → trả bản cũ (`200`); đang tạo → trả bản đó; ngược lại tạo yêu cầu `QUEUED` và xếp job qua outbox
 * trong CÙNG transaction. Tốc độ (5 lần/giờ) do `scopeLimiter` ở route.
 */
export class ContributionExportService {
  private readonly now: () => Date;

  constructor(private readonly d: ContributionExportDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async request(user: AuthUser, boardId: string, dto: RequestExportDto): Promise<{ status: 200 | 202; data: ExportRefDto }> {
    const board = await this.d.access.readBoard(user, boardId);
    const ctx = await this.d.context.load(board);
    const period = parsePeriod(dto.period, ctx.timezone);
    const data = await this.d.builder.build(ctx, period, dto.includeHeatmap);

    const dedupeKey = this.d.builder.dedupeKey(boardId, period.key, data.dataHash, dto.includeHeatmap);
    const existing = await this.d.exports.findByDedupeKey(dedupeKey);
    if (existing) return this.answer(existing);

    const expiresAt = new Date(this.now().getTime() + LIMITS.contribution.exportRetentionDays * 86_400_000);
    const created = await this.create(user.id, board.workspaceId, boardId, dto, dedupeKey, data.dataHash, data.report.formula.weights, data.report.members.length, expiresAt);
    return this.answer(created);
  }

  async get(user: AuthUser, exportId: string, opts: { download: boolean }): Promise<ExportDto> {
    const rec = await this.d.exports.findById(exportId);
    if (!rec) throw new ScopeNotFoundError();
    await this.d.access.readBoard(user, rec.boardId);

    if (rec.status === "EXPIRED" || (rec.status === "READY" && rec.expiresAt <= this.now())) {
      throw new AppError(ErrorMessages[ErrorCode.CONTRIB_005], HttpStatusCode.GONE, ErrorCode.CONTRIB_005);
    }
    const dto = this.toDto(rec);
    if (!opts.download) return dto;
    if (rec.status !== "READY" || !rec.assetId) {
      throw new AppError(ErrorMessages[ErrorCode.CONTRIB_006], HttpStatusCode.CONFLICT, ErrorCode.CONTRIB_006, { status: rec.status });
    }
    return { ...dto, url: (await this.d.assets.signedUrl(rec.assetId, user)).url };
  }

  private answer(rec: ContributionExportRecord): { status: 200 | 202; data: ExportRefDto } {
    return { status: rec.status === "READY" ? 200 : 202, data: { exportId: rec.id, status: rec.status } };
  }

  /** Tạo `QUEUED` + hàng outbox trong một transaction. Đua trùng khoá dedupe/mã xác thực → đọc lại bản đã có (tx đã hỏng sau P2002 nên bắt Ở NGOÀI). */
  private async create(
    requestedBy: string,
    workspaceId: string,
    boardId: string,
    dto: RequestExportDto,
    dedupeKey: string,
    dataHash: string,
    weights: ContributionExportRecord["weights"],
    memberCount: number,
    expiresAt: Date
  ): Promise<ContributionExportRecord> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.d.tx.run(async (tx) => {
          const rec = await this.d.exports.create(
            { workspaceId, boardId, requestedBy, periodKey: dto.period, includeHeatmap: dto.includeHeatmap, dedupeKey, dataHash, verifyCode: generateVerifyCode(), weights, memberCount, expiresAt },
            tx
          );
          await this.d.outbox.add(tx, {
            type: EXPORT_JOB,
            aggregateType: "ContributionExport",
            aggregateId: rec.id,
            queue: EXPORT_QUEUE,
            jobName: EXPORT_JOB,
            dedupeKey: `contribution.export:export:${rec.id}`,
            payload: { exportId: rec.id },
          });
          return rec;
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const raced = await this.d.exports.findByDedupeKey(dedupeKey);
        if (raced) return raced;
        // Trùng mã xác thực (hiếm): sinh mã khác ở lượt sau.
      }
    }
    throw new AppError("Không tạo được yêu cầu xuất, vui lòng thử lại", HttpStatusCode.CONFLICT, ErrorCode.CONTRIB_006);
  }

  private toDto(rec: ContributionExportRecord): ExportDto {
    return {
      id: rec.id,
      status: rec.status,
      periodKey: rec.periodKey,
      includeHeatmap: rec.includeHeatmap,
      verifyCode: rec.verifyCode,
      dataHash: rec.dataHash,
      createdAt: rec.createdAt.toISOString(),
      readyAt: rec.readyAt ? rec.readyAt.toISOString() : null,
      expiresAt: rec.expiresAt.toISOString(),
    };
  }
}
