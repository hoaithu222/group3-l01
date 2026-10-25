import type { ContributionWeights } from "../../../core/constants/contribution";
import type { ContributionExportRecord } from "../entities/contribution.interface";
import type { TxHandle } from "./tx";

export interface CreateExportInput {
  workspaceId: string;
  boardId: string;
  requestedBy: string;
  periodKey: string;
  includeHeatmap: boolean;
  dedupeKey: string;
  dataHash: string;
  verifyCode: string;
  weights: ContributionWeights;
  memberCount: number;
  expiresAt: Date;
}

/** Yêu cầu xuất PDF (`ContributionExport`). Mọi chuyển trạng thái là ghi có điều kiện (`updateMany`) nên job retry/đua vô hại. */
export interface IContributionExportRepository {
  findById(id: string): Promise<ContributionExportRecord | null>;
  findByDedupeKey(dedupeKey: string): Promise<ContributionExportRecord | null>;
  /** Tạo `QUEUED`. Ném lỗi vi phạm unique khi `dedupeKey`/`verifyCode` đã có (caller đọc lại rồi trả bản cũ). Nhận `tx` để ghi outbox cùng transaction. */
  create(input: CreateExportInput, tx?: TxHandle): Promise<ContributionExportRecord>;
  /** `QUEUED|RUNNING → RUNNING`; `false` khi đã `READY/FAILED/EXPIRED` (job retry sau khi xong → bỏ qua). */
  claimRunning(id: string): Promise<boolean>;
  /** Dữ liệu vừa đổi giữa lúc xếp hàng và lúc chạy: cập nhật mã băm + khoá dedupe. `false` khi khoá mới đã bị bản khác giữ (giữ nguyên khoá cũ). */
  updateData(id: string, dataHash: string, dedupeKey: string): Promise<boolean>;
  markReady(id: string, assetId: string, at: Date): Promise<void>;
  /** `FAILED` + nhả khoá dedupe (`failed:<id>`) để người dùng xuất lại được. */
  markFailed(id: string, error: string): Promise<void>;
  /** Bản `READY` đã quá `expiresAt`, cũ nhất trước. */
  listDueForExpiry(now: Date, limit: number): Promise<ContributionExportRecord[]>;
  /** `READY → EXPIRED` + nhả khoá dedupe (`expired:<id>`). */
  markExpired(id: string): Promise<boolean>;
  countByWorkspace(workspaceId: string, since: Date): Promise<{ ready: number; failed: number }>;
}
