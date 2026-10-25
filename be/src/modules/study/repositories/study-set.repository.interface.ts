import type {
  PopularTag,
  StudySet,
  StudyOwnerSummary,
  StudySetAdminListParams,
  StudySetCreateInput,
  StudySetListParams,
  StudySetPatch,
  StudySetUpdateCondition,
} from "../entities/study-set.interface";
import type { TxHandle } from "./tx";

export interface IStudySetRepository {
  /** Trả cả bộ đã xoá mềm — caller (`StudySetAccess`) quyết định 404. */
  findById(id: string, tx?: TxHandle): Promise<StudySet | null>;
  findByIds(ids: string[]): Promise<StudySet[]>;
  create(input: StudySetCreateInput, tx?: TxHandle): Promise<StudySet>;
  /**
   * Ghi có điều kiện (CAS `version`, tập trạng thái hiện tại) và LUÔN tăng `version`. `null` = không khớp điều kiện
   * (lệch phiên bản, sai trạng thái hoặc không tồn tại) — caller đọc lại để chọn 404/409.
   */
  updateIf(id: string, cond: StudySetUpdateCondition, patch: StudySetPatch, tx?: TxHandle): Promise<StudySet | null>;
  /** Danh sách theo phạm vi, sắp `updatedAt desc, id desc`, đã lọc xoá mềm. */
  list(params: StudySetListParams): Promise<StudySet[]>;
  /** Số bộ CHƯA xoá của một người (giới hạn `setsPerUserMax`). */
  countByOwner(ownerId: string): Promise<number>;
  /** `$inc copyCount` ở bộ gốc — ngoài transaction, không đổi `version`. */
  incCopyCount(id: string): Promise<void>;
  /** Đặt tuyệt đối (idempotent theo retry của consumer báo cáo). */
  setReportedCount(id: string, count: number): Promise<void>;
  /** Bộ PUBLIC có `reportedCount ≥ minReported` (admin tab `content`), phân trang page/limit — `total` là tổng đã lọc. */
  listAdminReported(params: StudySetAdminListParams): Promise<{ rows: StudySet[]; total: number }>;
  /** Đếm bộ CHƯA xoá của một người theo phạm vi + số bị ẩn (admin tab "Học tập" của user). */
  ownerSummary(ownerId: string): Promise<StudyOwnerSummary>;
  /** Thẻ phổ biến của bộ PUBLIC (hoặc bộ WORKSPACE của một nhóm), ≤ `limit`. */
  popularTags(params: { workspaceId?: string; limit: number }): Promise<PopularTag[]>;
}
