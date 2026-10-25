import { logger } from "../../../../infrastructure/logger";
import type { IContributionDirectory } from "../../repositories/contribution-directory.repository.interface";
import type { IContributionExportRepository } from "../../repositories/contribution-export.repository.interface";
import type { IContribNotifier, ITxRunner } from "../../repositories/tx";
import { CONTRIBUTION_NOTIFICATION_TYPES } from "../../notifications/contribution.notification-types";
import type { ContributionContextLoader } from "../contribution-context";
import { parsePeriod } from "../period";
import type { ExportDataBuilder } from "./contribution-export-data";
import type { IContribAssets, IContribPdf } from "./contribution-export.ports";
import { exportFileName } from "./export-labels";

export interface ContributionExportJobDeps {
  exports: IContributionExportRepository;
  directory: IContributionDirectory;
  context: ContributionContextLoader;
  builder: ExportDataBuilder;
  pdf: IContribPdf;
  assets: IContribAssets;
  notifier: IContribNotifier;
  tx: ITxRunner;
  now?: () => Date;
}

export type ExportRunResult = "READY" | "SKIPPED";

/**
 * Job `contribution.export` (queue `reports`, be.md §5.7): tính lại dữ liệu → dựng PDF → tạo asset `REPORT` từ buffer → gắn `AssetLink CONTRIBUTION_EXPORT`
 * → `READY` + thông báo. Idempotent: bản đã `READY/FAILED/EXPIRED` bỏ qua; chạy lại giữa chừng (`RUNNING`) làm lại từ đầu. Dữ liệu vừa đổi giữa lúc xếp hàng
 * và lúc chạy → cập nhật mã băm + khoá dedupe rồi in mã băm MỚI lên PDF. Lỗi cuối cùng (hết lượt retry) → `fail()`.
 */
export class ContributionExportJobService {
  private readonly now: () => Date;

  constructor(private readonly d: ContributionExportJobDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async run(exportId: string): Promise<ExportRunResult> {
    const rec = await this.d.exports.findById(exportId);
    if (!rec || !(await this.d.exports.claimRunning(exportId))) return "SKIPPED";
    const board = await this.d.directory.getBoard(rec.boardId);
    if (!board) throw new Error("Bảng không còn tồn tại");

    const ctx = await this.d.context.load(board);
    const period = parsePeriod(rec.periodKey, ctx.timezone);
    const data = await this.d.builder.build(ctx, period, rec.includeHeatmap);
    let dataHash = rec.dataHash;
    if (data.dataHash !== rec.dataHash) {
      const changed = await this.d.exports.updateData(exportId, data.dataHash, this.d.builder.dedupeKey(rec.boardId, rec.periodKey, data.dataHash, rec.includeHeatmap));
      // Khoá mới đã có bản khác giữ (hiếm): giữ khoá cũ nhưng VẪN in mã băm của dữ liệu thật đã dùng.
      dataHash = data.dataHash;
      if (!changed) logger.warn("[contribution] khoá dedupe mới đã bị giữ, giữ khoá cũ", { exportId });
    }

    const at = this.now();
    const buffer = this.d.pdf.render(this.d.builder.toPdfInput(data, ctx, period, { verifyCode: rec.verifyCode, dataHash }), at);
    const asset = await this.d.assets.createPdf({ ownerId: rec.requestedBy, workspaceId: rec.workspaceId, fileName: exportFileName(board.name, rec.periodKey), buffer });
    await this.d.tx.run((tx) => this.d.assets.attach(tx, { assetId: asset.id, exportId, workspaceId: rec.workspaceId, actorId: rec.requestedBy }));
    await this.d.exports.markReady(exportId, asset.id, at);
    await this.notify(exportId, rec.boardId, rec.workspaceId, rec.requestedBy, "READY");
    return "READY";
  }

  /** Hết lượt retry: `FAILED` (không chứa dữ liệu thành viên) + thông báo người yêu cầu. Idempotent. */
  async fail(exportId: string, error: unknown): Promise<void> {
    const rec = await this.d.exports.findById(exportId);
    if (!rec || (rec.status !== "QUEUED" && rec.status !== "RUNNING")) return;
    logger.error("[contribution] xuất PDF thất bại", { exportId, error: error instanceof Error ? error.message : String(error) });
    await this.d.exports.markFailed(exportId, "Không tạo được báo cáo");
    await this.notify(exportId, rec.boardId, rec.workspaceId, rec.requestedBy, "FAILED");
  }

  /** Cron 03:30: bản `READY` quá hạn lưu → `EXPIRED`, nhả khoá dedupe, gỡ `AssetLink` (job dọn asset p0-05 xoá tệp sau ân hạn). Trả số bản đã hết hạn. */
  async expireDue(limit = 200): Promise<number> {
    const due = await this.d.exports.listDueForExpiry(this.now(), limit);
    let done = 0;
    for (const rec of due) {
      try {
        await this.d.tx.run((tx) => this.d.assets.detachAll(tx, rec.id));
        if (await this.d.exports.markExpired(rec.id)) done += 1;
      } catch (err) {
        logger.warn("[contribution] không hết hạn được một bản xuất, thử lại lượt sau", { exportId: rec.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return done;
  }

  private async notify(exportId: string, boardId: string, workspaceId: string, userId: string, outcome: "READY" | "FAILED"): Promise<void> {
    const type = outcome === "READY" ? CONTRIBUTION_NOTIFICATION_TYPES.EXPORT_READY : CONTRIBUTION_NOTIFICATION_TYPES.EXPORT_FAILED;
    const dedupeKey = `${type}:export:${exportId}`;
    await this.d.tx.run(async (tx) => {
      if (await this.d.notifier.exists(tx, dedupeKey)) return;
      await this.d.notifier.notify(tx, {
        type,
        scope: null,
        workspaceId,
        source: { type: "ContributionExport", id: exportId },
        refs: { exportId, boardId, workspaceId },
        recipients: [{ userId }],
        dedupeKey,
      });
    });
  }
}
