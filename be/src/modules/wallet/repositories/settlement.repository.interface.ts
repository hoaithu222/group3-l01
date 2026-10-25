import type {
  Settlement,
  SettlementAllocationRow,
  SettlementMethodValue,
  SettlementStatusValue,
} from "../entities/wallet.interface";
import type { Tx } from "./wallet.repository.interface";

export interface NewSettlement {
  workspaceId: string;
  code: string;
  fromId: string;
  toId: string;
  amount: number;
  method: SettlementMethodValue;
  proofAssetId: string | null;
  note: string | null;
  createdBy: string;
}

export interface SettlementListFilter {
  status?: SettlementStatusValue;
  /** Khi có: chỉ settlement mà người này là bên gửi hoặc bên nhận. */
  involving?: string;
  cursor: { at: Date; id: string } | null;
  limit: number;
}

export type SettlementTransition =
  | { to: "CONFIRMED"; at: Date }
  | { to: "REJECTED"; at: Date; reason: string }
  | { to: "CANCELLED"; at: Date };

export interface ISettlementRepository {
  create(data: NewSettlement, tx: Tx): Promise<Settlement>;
  findById(id: string, tx?: Tx): Promise<Settlement | null>;
  findByCode(code: string): Promise<Settlement | null>;
  list(workspaceId: string, filter: SettlementListFilter): Promise<Settlement[]>;
  /**
   * Chuyển trạng thái nguyên tử `PENDING → to` (CAS bằng `updateMany`) — trả số bản ghi đổi
   * (0 = đã không còn PENDING → `WALLET_007`, IR-34).
   */
  transitionFromPending(id: string, change: SettlementTransition, tx: Tx): Promise<number>;
  setAllocations(id: string, allocations: SettlementAllocationRow[], tx: Tx): Promise<void>;
  /** PENDING quá hạn chưa nhắc (`staleNotifiedAt` null). */
  listStalePending(before: Date, limit: number): Promise<Settlement[]>;
  markStaleNotified(id: string, at: Date): Promise<boolean>;
  listConfirmed(workspaceId: string): Promise<Settlement[]>;
  countSince(workspaceId: string, status: SettlementStatusValue, since: Date): Promise<number>;
  countStalePending(workspaceId: string, before: Date): Promise<number>;
}
