import type { AuthUser } from "../../../core/types/express";
import { toCsv } from "../domain/csv";
import type { IExpenseRepository } from "../repositories/expense.repository.interface";
import type { ISettlementRepository } from "../repositories/settlement.repository.interface";
import type { IWalletDirectory } from "../repositories/wallet-directory.interface";
import { assertWalletRole } from "./wallet-access";

export const EXPORT_ROW_LIMIT = 5000;

export type ExportKind = "expenses" | "settlements";

export interface ExportFile {
  filename: string;
  csv: string;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Xuất CSV đồng bộ (tối đa `EXPORT_ROW_LIMIT` dòng mới nhất). Lệch có chủ ý so với be.md §7 (job `wallet.export`
 * → Asset): tạo Asset từ buffer phía server chưa có ở p0-05 nên chưa thể giao qua job. MEMBER+ đều xem được
 * sổ chi tiêu nhóm nên CSV không mở rộng quyền xem.
 */
export class WalletExportService {
  constructor(
    private readonly expenseRepo: IExpenseRepository,
    private readonly settlementRepo: ISettlementRepository,
    private readonly directory: IWalletDirectory
  ) {}

  async export(actor: AuthUser, workspaceId: string, kind: ExportKind): Promise<ExportFile> {
    await assertWalletRole(actor, workspaceId);
    const today = isoDate(new Date()).replace(/-/g, "");
    return kind === "settlements"
      ? { filename: `wallet-settlements-${today}.csv`, csv: await this.settlements(workspaceId) }
      : { filename: `wallet-expenses-${today}.csv`, csv: await this.expenses(workspaceId) };
  }

  private async expenses(workspaceId: string): Promise<string> {
    const rows = (await this.expenseRepo.list(workspaceId, { cursor: null, limit: EXPORT_ROW_LIMIT })).slice(0, EXPORT_ROW_LIMIT);
    const names = await this.directory.userNames([...new Set(rows.map((r) => r.paidBy))]);
    return toCsv(
      ["Ngày", "Loại", "Mô tả", "Danh mục", "Số tiền (VND)", "Người trả", "Số người tham gia"],
      rows.map((e) => [
        isoDate(e.occurredAt),
        e.kind === "ADJUSTMENT" ? "Điều chỉnh" : "Khoản chi",
        e.description,
        e.category,
        e.amount,
        names.get(e.paidBy) ?? "",
        e.participants.length,
      ])
    );
  }

  private async settlements(workspaceId: string): Promise<string> {
    const rows = (await this.settlementRepo.list(workspaceId, { cursor: null, limit: EXPORT_ROW_LIMIT })).slice(0, EXPORT_ROW_LIMIT);
    const names = await this.directory.userNames([...new Set(rows.flatMap((r) => [r.fromId, r.toId]))]);
    return toCsv(
      ["Ngày", "Từ", "Đến", "Số tiền (VND)", "Phương thức", "Trạng thái", "Ghi chú"],
      rows.map((s) => [isoDate(s.createdAt), names.get(s.fromId) ?? "", names.get(s.toId) ?? "", s.amount, s.method, s.status, s.note])
    );
  }
}
