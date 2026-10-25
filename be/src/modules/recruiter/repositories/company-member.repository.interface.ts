import type { CompanyMember, CompanyMemberRole } from "../entities/recruiter.interface";
import type { TxHandle } from "./tx";

export interface ICompanyMemberRepository {
  /** Thành viên ACTIVE của `userId` (mỗi người ≤ 1 doanh nghiệp). */
  findActiveByUser(userId: string, tx?: TxHandle): Promise<CompanyMember | null>;
  /** Hàng (companyId, userId) bất kể trạng thái — để KÍCH HOẠT LẠI người đã bị gỡ. */
  findByCompanyUser(companyId: string, userId: string, tx?: TxHandle): Promise<CompanyMember | null>;
  listByCompany(companyId: string, opts?: { activeOnly?: boolean }): Promise<CompanyMember[]>;
  /** Id người dùng của mọi thành viên ACTIVE (đích socket/xoá cache quyền). */
  activeUserIds(companyId: string, tx?: TxHandle): Promise<string[]>;
  countActive(companyId: string, tx?: TxHandle): Promise<number>;
  countActiveOwners(companyId: string, tx?: TxHandle): Promise<number>;
  /** P2002 (`activeKey` — người này đã thuộc doanh nghiệp khác, hoặc `[companyId,userId]`) → `UniqueViolationError`. */
  create(input: { id: string; companyId: string; userId: string; role: CompanyMemberRole; invitedBy: string | null }, tx?: TxHandle): Promise<CompanyMember>;
  /** Kích hoạt lại hàng REMOVED (CAS theo trạng thái); `null` khi hàng không còn REMOVED. P2002 (`activeKey`) → `UniqueViolationError`. */
  reactivate(id: string, userId: string, role: CompanyMemberRole, invitedBy: string | null, tx?: TxHandle): Promise<CompanyMember | null>;
  /** Gỡ (CAS ACTIVE → REMOVED, nhả `activeKey`); `false` khi không còn ACTIVE. */
  remove(id: string, tx?: TxHandle): Promise<boolean>;
  /** Mọi thành viên ACTIVE của người này (thường ≤ 1) — dùng khi ẩn danh hoá. */
  activeByUser(userId: string, tx?: TxHandle): Promise<CompanyMember[]>;
  /** Số thành viên ACTIVE của nhiều công ty (danh sách vận hành). */
  countActiveByCompanies(companyIds: readonly string[]): Promise<Map<string, number>>;
}
