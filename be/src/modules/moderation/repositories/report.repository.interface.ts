import type { Prisma } from "@prisma/client";
import type {
  Report,
  ReportCreateInput,
  ReportHandlerLevelValue,
  ReportReasonValue,
  ReportResolutionValue,
  ReportStatusValue,
  ReportTargetTypeValue,
} from "../entities/report.interface";

/** `(reporterId, targetType, targetId)` đã tồn tại — 2 request báo cáo cùng đích cùng lúc (MOD-01). Repo dịch từ P2002 để service không import Prisma. */
export class ReportDuplicateError extends Error {
  constructor() {
    super("Báo cáo đã tồn tại");
    this.name = "ReportDuplicateError";
  }
}

/** Tập phạm vi người xem kiểm duyệt được (be.md p1-08 §5.3) — tính TRƯỚC truy vấn. */
export interface ReportScopeFilter {
  /** OWNER/ADMIN workspace → báo cáo `scopeIsPrivate=false` trong workspace (kênh public, USER có ngữ cảnh, CHANNEL public). */
  workspaceIds: string[];
  /** MANAGER kênh private → báo cáo tin trong kênh này. */
  channelIds: string[];
  /** OWNER/ADMIN nhóm chat → báo cáo tin trong nhóm này. */
  conversationIds: string[];
}

export interface ReportScanFilter {
  status?: ReportStatusValue;
  targetType?: ReportTargetTypeValue;
  handlerLevel?: ReportHandlerLevelValue;
  workspaceId?: string;
  reason?: ReportReasonValue;
  from?: Date;
  to?: Date;
  scopes?: ReportScopeFilter;
}

export interface CloseGroupPatch {
  status: Exclude<ReportStatusValue, "OPEN">;
  resolution: ReportResolutionValue;
  resolvedBy: string;
  resolvedAtLevel: ReportHandlerLevelValue;
  resolvedAt: Date;
  resolutionNote: string;
}

/** Dòng audit ghi TRONG transaction — dùng cho D-06 (không audit thì không trả nội dung). */
export interface TxAuditEntry {
  actorId: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId: string;
  workspaceId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface IReportRepository {
  findById(id: string): Promise<Report | null>;
  findByUnique(reporterId: string, targetType: ReportTargetTypeValue, targetId: string): Promise<Report | null>;
  findByGroupKey(groupKey: string, status?: ReportStatusValue): Promise<Report[]>;

  /** Ném `ReportDuplicateError` khi vi phạm unique `(reporterId, targetType, targetId)`. */
  create(tx: Prisma.TransactionClient, input: ReportCreateInput): Promise<Report>;

  /** Con trỏ `(createdAt, id)` giảm dần. */
  listByReporter(reporterId: string, cursor: { at: Date; id: string } | null, limit: number): Promise<Report[]>;

  /** Báo cáo khớp bộ lọc, mới nhất trước, tối đa `limit` — nguồn để gộp nhóm (xem `groupReports`). */
  scan(filter: ReportScanFilter, limit: number): Promise<Report[]>;

  /** Đóng MỌI báo cáo OPEN cùng `groupKey` — trả số bản ghi đã đóng (0 = người khác đóng trước). */
  closeGroup(tx: Prisma.TransactionClient, groupKey: string, patch: CloseGroupPatch): Promise<number>;

  countByAuthor(authorId: string, since: Date): Promise<number>;
  countRemovedByAuthor(authorId: string, since: Date): Promise<number>;
  listRecentByAuthor(authorId: string, limit: number): Promise<Report[]>;

  recordAudit(tx: Prisma.TransactionClient, entry: TxAuditEntry): Promise<void>;
}
