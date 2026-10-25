import type { WellbeingShareEntity } from "../entities/burnout.interface";
import type { TxHandle } from "./tx";

/**
 * Chia sẻ mức rủi ro với trưởng nhóm (P1, be.md §2/§5 "Chia sẻ"). KHÔNG có hàm nào đọc `WellbeingShare` của MỌI người dùng cùng lúc mà không qua `workspaceId` —
 * chỉ chủ (`listByUser`) hoặc một nhóm cụ thể (`listUserIdsByWorkspace`, service tự lọc lại theo membership ACTIVE trước khi trả `level`).
 */
export interface IWellbeingShareRepository {
  listByUser(userId: string): Promise<WellbeingShareEntity[]>;

  find(userId: string, workspaceId: string): Promise<WellbeingShareEntity | null>;

  /** Bật chia sẻ (idempotent — đã chia sẻ thì giữ nguyên `createdAt` cũ). */
  upsert(userId: string, workspaceId: string, now: Date): Promise<WellbeingShareEntity>;

  /** Tắt chia sẻ; `false` = chưa từng chia sẻ (idempotent). */
  remove(userId: string, workspaceId: string): Promise<boolean>;

  /** `userId` đã chia sẻ với nhóm này — CHƯA lọc theo membership hiện tại (service kiểm ACTIVE lúc đọc, be.md WELL-03). */
  listUserIdsByWorkspace(workspaceId: string): Promise<string[]>;

  /** Xoá mọi chia sẻ của một người (tắt theo dõi / xoá dữ liệu / ẩn danh hoá tài khoản — cùng đường purge với `WellbeingDaily`/`BurnoutAssessment`). */
  deleteByUser(userId: string, tx?: TxHandle): Promise<number>;
}
