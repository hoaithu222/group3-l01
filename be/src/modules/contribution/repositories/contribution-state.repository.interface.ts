import type { ContributionConfigValue, ContributionWeights } from "../../../core/constants/contribution";
import type { BoardState } from "../entities/contribution.interface";
import type { TxHandle } from "./tx";

/**
 * Trạng thái tính toán của MỘT bảng (`ContributionBoardState`): phiên bản fact/cấu hình, thời điểm/người đổi trọng số, cờ làm mới heatmap.
 * Mọi thay đổi là ghi có điều kiện (`updateMany`) — không transaction, an toàn khi nhiều consumer/job đua.
 */
export interface IContributionStateRepository {
  get(boardId: string): Promise<BoardState | null>;
  /** Tạo state nếu chưa có — ĐÓNG BĂNG `defaults` (mặc định nền tảng lúc đó) làm công thức của bảng chưa được tuỳ chỉnh. Idempotent, chịu đua. */
  ensure(boardId: string, workspaceId: string, defaults: ContributionConfigValue): Promise<BoardState>;
  /** `factsVersion + 1` (tạo state nếu thiếu); trả phiên bản mới. */
  bumpFactsVersion(boardId: string, workspaceId: string, defaults: ContributionConfigValue): Promise<number>;
  /**
   * `computedVersion = version` khi `version ≥ computedVersion` (job cũ chạy chậm không ghi đè kết quả mới hơn); ghi kèm `timezone` đã dùng để tính
   * (`snapshotTimezone`) — khác múi giờ hiện hành thì snapshot bị coi là cũ.
   */
  markComputed(boardId: string, version: number, at: Date, timezone: string): Promise<void>;
  /**
   * CAS theo `configVersion` (`expectedVersion`): khớp → tăng + ghi thời điểm/người/trọng số cũ, trả `true`; lệch → `false`. State phải tồn tại (`ensure`
   * trước). Nhận `tx` để ghi CÙNG transaction với `Board.contribution`.
   */
  changeConfig(boardId: string, expectedVersion: number, patch: { at: Date; by: string; previousWeights: ContributionWeights }, tx?: TxHandle): Promise<boolean>;
  /** Có hoạt động mới chờ job `activity.aggregate` tính lại ô heatmap (tạo state nếu thiếu). */
  markActivityDirty(boardId: string, workspaceId: string, defaults: ContributionConfigValue, at: Date): Promise<void>;
  /** Bảng có `activityDirtyAt`, cũ nhất trước. */
  listDirty(limit: number): Promise<BoardState[]>;
  /** Xoá cờ bẩn CHỈ khi chưa có hoạt động mới hơn `seenAt` (so sánh `activityDirtyAt ≤ seenAt`). */
  clearActivityDirty(boardId: string, seenAt: Date): Promise<void>;
  /** Ghi thời điểm làm mới heatmap; `timezone` CHỈ truyền sau lần dựng lại TOÀN BỘ lịch sử (`activityTimezone`) — làm mới một phần không được khẳng định múi giờ của ô cũ. */
  setActivityRefreshed(boardId: string, at: Date, timezone?: string): Promise<void>;
  listByWorkspace(workspaceId: string): Promise<BoardState[]>;
  /** Trang state theo `boardId` tăng dần (sau `afterBoardId`, `null` = từ đầu) — cho lượt quét đêm đối chiếu múi giờ. */
  listPage(afterBoardId: string | null, limit: number): Promise<BoardState[]>;
}
