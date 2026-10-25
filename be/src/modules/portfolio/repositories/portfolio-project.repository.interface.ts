import type { PortfolioProject, PortfolioSnapshot } from "../entities/portfolio.interface";
import type { TxHandle } from "./tx";

export interface NewPortfolioProject {
  portfolioId: string;
  userId: string;
  workspaceId: string;
  title: string;
  order: number;
  showTeammates: boolean;
  snapshot: PortfolioSnapshot;
  snapshotAt: Date;
}

/** Nội dung do NGƯỜI DÙNG viết (sửa qua `PATCH`, CAS `version`). Số liệu hệ thống đi qua `updateSnapshot`. */
export interface ProjectPatch {
  title?: string;
  summary?: string | null;
  role?: string | null;
  periodFrom?: Date | null;
  periodTo?: Date | null;
  highlights?: string[];
  coverAssetId?: string | null;
  visible?: boolean;
  showTeammates?: boolean;
}

/** Kho `PortfolioProject` (unique `[portfolioId, workspaceId]`). `create` ghi `null` tường minh cho summary/role/period/cover. */
export interface IPortfolioProjectRepository {
  findById(id: string, tx?: TxHandle): Promise<PortfolioProject | null>;
  /** Theo `order` tăng dần. */
  listByPortfolio(portfolioId: string, tx?: TxHandle): Promise<PortfolioProject[]>;
  count(portfolioId: string, tx?: TxHandle): Promise<number>;
  /** Ném `UniqueViolationError` khi nhóm đã có trong hồ sơ. */
  create(input: NewPortfolioProject, tx?: TxHandle): Promise<PortfolioProject>;
  /** CAS `version` (tăng 1). `null` khi lệch/không tồn tại. */
  updateContent(id: string, expectedVersion: number, patch: ProjectPatch, tx?: TxHandle): Promise<PortfolioProject | null>;
  /** Ghi đè số liệu chụp — KHÔNG tăng `version`. */
  updateSnapshot(id: string, snapshot: PortfolioSnapshot, at: Date, tx?: TxHandle): Promise<PortfolioProject | null>;
  /** `order = chỉ số` theo danh sách id (đã kiểm khớp tập dự án ở service). */
  setOrders(portfolioId: string, orderedIds: readonly string[], tx?: TxHandle): Promise<void>;
  delete(id: string, tx?: TxHandle): Promise<boolean>;
  deleteByPortfolio(portfolioId: string, tx?: TxHandle): Promise<number>;
}
