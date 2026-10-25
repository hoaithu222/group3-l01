import type { PortfolioBuild, PortfolioBuildTrigger } from "../entities/portfolio.interface";
import type { TxHandle } from "./tx";

export interface NewPortfolioBuild {
  portfolioId: string;
  buildVersion: number;
  trigger: PortfolioBuildTrigger;
  /** `Portfolio.version` lúc yêu cầu. */
  portfolioVersion: number;
  createdBy: string | null;
}

export interface BuildReadyInfo {
  storageKey: string;
  /** Tên object trong thư mục build (gồm `index.html`) — job dọn xoá đúng từng object. */
  files: string[];
  sizeBytes: number;
}

/**
 * Kho `PortfolioBuild` (unique `[portfolioId, buildVersion]` ⇒ job chạy hai lần cùng phiên bản chỉ có MỘT bản ghi). Mọi chuyển trạng thái là CAS theo
 * trạng thái nguồn — lượt thua nhận `false`/`null` (không ghi đôi). `create` ghi `null` tường minh cho `storageKey/sizeBytes/error/startedAt/finishedAt/purgedAt`.
 */
export interface IPortfolioBuildRepository {
  findById(id: string, tx?: TxHandle): Promise<PortfolioBuild | null>;
  find(portfolioId: string, buildVersion: number, tx?: TxHandle): Promise<PortfolioBuild | null>;
  /** Build có `buildVersion` lớn nhất. */
  latest(portfolioId: string, tx?: TxHandle): Promise<PortfolioBuild | null>;
  listByPortfolio(portfolioId: string, tx?: TxHandle): Promise<PortfolioBuild[]>;
  /** Có build `QUEUED`/`BUILDING` (Publish → `PORT_009`). */
  hasInFlight(portfolioId: string, tx?: TxHandle): Promise<boolean>;
  /** Có build `QUEUED` CHƯA bắt đầu — dựng lại do hệ thống bỏ qua khi đã có bản chờ (bản chờ sẽ đọc dữ liệu mới nhất). */
  hasQueued(portfolioId: string, tx?: TxHandle): Promise<boolean>;
  /** Ném `UniqueViolationError` khi trùng `[portfolioId, buildVersion]`. */
  create(input: NewPortfolioBuild, tx?: TxHandle): Promise<PortfolioBuild>;
  /** `QUEUED` → `BUILDING` (hoặc chiếm lại `BUILDING` có `startedAt < staleBefore` — lượt retry/worker chết). `null` khi thua. */
  claim(id: string, opts: { now: Date; staleBefore: Date }, tx?: TxHandle): Promise<PortfolioBuild | null>;
  /** `BUILDING` → `READY`. `false` khi build đã bị đóng (huỷ do Unpublish/gỡ vi phạm, hoặc job khác xong trước). */
  markReady(id: string, info: BuildReadyInfo, at: Date, tx?: TxHandle): Promise<boolean>;
  /** `QUEUED|BUILDING` → `FAILED` (`error` rút gọn, không stack). */
  markFailed(id: string, error: string, at: Date, tx?: TxHandle): Promise<boolean>;
  /** Đóng mọi build `QUEUED|BUILDING` của hồ sơ (Unpublish/gỡ vi phạm/ẩn danh hoá) — build về muộn không "sống lại" trang. */
  failInFlight(portfolioId: string, error: string, at: Date, tx?: TxHandle): Promise<number>;
  /** `BUILDING` quá `buildingBefore` hoặc `QUEUED` quá `queuedBefore` — cho cron `portfolio.stale-build-reaper`. */
  findStale(opts: { buildingBefore: Date; queuedBefore: Date }, limit: number): Promise<PortfolioBuild[]>;
  markPurged(id: string, at: Date, tx?: TxHandle): Promise<void>;
  deleteByPortfolio(portfolioId: string, tx?: TxHandle): Promise<number>;
}
