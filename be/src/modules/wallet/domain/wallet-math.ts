/**
 * Thuật toán thuần của ví nhóm (p6-04 be.md §5) — KHÔNG I/O, không phụ thuộc
 * Prisma/Express, để test property (fast-check) chạy nhanh và tất định.
 *
 * Mọi số tiền là SỐ NGUYÊN đồng (VND). Không dùng số thực: `amount * bps` tối
 * đa 1e8 × 1e4 = 1e12 < 2^53 nên `Math.floor` an toàn.
 */

export type SplitType = "EQUAL" | "CUSTOM" | "PERCENT";

export interface SplitParticipant {
  userId: string;
  /** CUSTOM: số tiền phần của người này (kể cả người trả — phần tự chịu). */
  amount?: number;
  /** PERCENT: basis points (tổng = 10000). */
  bps?: number;
}

export interface SplitInput {
  amount: number;
  splitType: SplitType;
  participants: SplitParticipant[];
  paidBy: string;
}

/** Một phần nợ: `debtorId` nợ `creditorId` (= người trả) `amount` đồng. */
export interface Share {
  debtorId: string;
  creditorId: string;
  amount: number;
}

export interface Suggestion {
  fromId: string;
  toId: string;
  amount: number;
}

export interface SettlementFlow {
  fromId: string;
  toId: string;
  amount: number;
}

export const BPS_TOTAL = 10_000;

/**
 * Kiểm tổng chia khớp `amount` (WALLET_002). Tách khỏi `splitExpense` để service
 * ném đúng mã lỗi nghiệp vụ thay vì 400 chung của DTO.
 */
export function isSplitTotalValid(input: SplitInput): boolean {
  const { splitType, participants, amount } = input;
  if (splitType === "EQUAL") return participants.length > 0;
  if (splitType === "CUSTOM") {
    return participants.every((p) => Number.isInteger(p.amount) && (p.amount as number) >= 0)
      && participants.reduce((s, p) => s + (p.amount ?? 0), 0) === amount;
  }
  return participants.every((p) => Number.isInteger(p.bps) && (p.bps as number) >= 0)
    && participants.reduce((s, p) => s + (p.bps ?? 0), 0) === BPS_TOTAL;
}

/**
 * Chia 1 khoản chi thành các phần nợ (be.md §5 `splitExpense`, README §2).
 *
 * - EQUAL: `floor(amount / n)` mỗi người, n gồm cả người trả nếu có trong danh
 *   sách. Phần dư `amount − base·n` do NGƯỜI TRẢ chịu (không phát sinh nợ) — IR-03/IR-31.
 * - PERCENT: `floor(amount · bps / 10000)`, dư như EQUAL.
 * - CUSTOM: đúng `amount` từng người.
 * Người trả (nếu là participant) tự chịu phần mình → KHÔNG sinh share; share 0 bị bỏ.
 * Kết quả sắp theo `debtorId` để tất định.
 */
export function splitExpense(input: SplitInput): Share[] {
  const { amount, splitType, participants, paidBy } = input;
  const n = participants.length;
  const shares: Share[] = [];

  for (const p of participants) {
    let owed: number;
    if (splitType === "EQUAL") owed = Math.floor(amount / n);
    else if (splitType === "PERCENT") owed = Math.floor((amount * (p.bps ?? 0)) / BPS_TOTAL);
    else owed = p.amount ?? 0;

    if (p.userId === paidBy || owed === 0) continue;
    shares.push({ debtorId: p.userId, creditorId: paidBy, amount: owed });
  }
  return shares.sort((a, b) => compareIds(a.debtorId, b.debtorId));
}

/**
 * Số dư ròng từng người: `>0` được nợ, `<0` đang nợ (README §2 "Nguồn sự thật số dư").
 * = Σ phần được nợ (người trả) − Σ phần phải trả + Σ settlement đã gửi − Σ đã nhận,
 * chỉ tính settlement CONFIRMED (caller lọc). Tổng mọi số dư luôn = 0.
 */
export function computeBalances(shares: Share[], settlements: SettlementFlow[]): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (userId: string, delta: number): void => {
    balances.set(userId, (balances.get(userId) ?? 0) + delta);
  };
  for (const s of shares) {
    add(s.creditorId, s.amount);
    add(s.debtorId, -s.amount);
  }
  for (const f of settlements) {
    add(f.fromId, f.amount);
    add(f.toId, -f.amount);
  }
  return balances;
}

/** Tổng phần phải trả ròng (gồm điều chỉnh âm) của từng người nợ — đối chiếu `WalletBalance.owedTotal` khi rebuild. */
export function computeOwedTotals(shares: Pick<Share, "debtorId" | "amount">[]): Map<string, number> {
  const owed = new Map<string, number>();
  for (const s of shares) owed.set(s.debtorId, (owed.get(s.debtorId) ?? 0) + s.amount);
  return owed;
}

/** Sắp xếp giảm dần theo số tiền rồi tăng dần theo id — tie-break tất định. */
function byAmountDesc(a: [string, number], b: [string, number]): number {
  return b[1] - a[1] || compareIds(a[0], b[0]);
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Chèn giữ thứ tự giảm dần (n ≤ `LIMITS.wallet.balanceUsersMax` nên O(n) mỗi lần chèn là đủ). */
function insertSorted(list: [string, number][], item: [string, number]): void {
  let i = 0;
  while (i < list.length && byAmountDesc(list[i], item) <= 0) i += 1;
  list.splice(i, 0, item);
}

/**
 * Gợi ý thanh toán tối giản (greedy min-cash-flow, be.md §5): ghép người nợ lớn
 * nhất với người được nợ lớn nhất, chuyển `min(nợ, được nợ)`, lặp. Mỗi bước triệt
 * tiêu ít nhất một bên nên số giao dịch ≤ n − 1; kết quả tất định nhờ tie-break
 * theo `userId`. Bỏ qua số dư 0. Nếu tổng số dư ≠ 0 (dữ liệu hỏng) phần dư bị bỏ,
 * không ném lỗi — `wallet.balance-rebuild` mới là nơi phát hiện và sửa.
 */
export function minCashFlow(balances: Map<string, number> | Record<string, number>): Suggestion[] {
  const entries = balances instanceof Map ? [...balances.entries()] : Object.entries(balances);
  const debtors: [string, number][] = entries.filter(([, b]) => b < 0).map(([id, b]) => [id, -b]);
  const creditors: [string, number][] = entries.filter(([, b]) => b > 0);
  debtors.sort(byAmountDesc);
  creditors.sort(byAmountDesc);

  const result: Suggestion[] = [];
  while (debtors.length > 0 && creditors.length > 0) {
    const [debtorId, owed] = debtors.shift() as [string, number];
    const [creditorId, due] = creditors.shift() as [string, number];
    const amount = Math.min(owed, due);
    result.push({ fromId: debtorId, toId: creditorId, amount });
    if (owed > amount) insertSorted(debtors, [debtorId, owed - amount]);
    if (due > amount) insertSorted(creditors, [creditorId, due - amount]);
  }
  return result;
}

export type ShareProjectionStatus = "UNPAID" | "PARTIAL" | "PAID";

export interface ProjectableShare {
  id: string;
  amount: number;
  occurredAt: Date;
}

export interface ProjectedShare {
  id: string;
  paidAmount: number;
  status: ShareProjectionStatus;
}

/**
 * Phép chiếu FIFO trạng thái share của MỘT người nợ (README §2, be.md §5).
 *
 * `outstanding` = `max(0, −balance)` của người đó. Phần đã trả của các share
 * DƯƠNG = `P − outstanding` (P = tổng share dương): số dư ròng đã trừ sẵn cả
 * khoản điều chỉnh âm, nên công thức README `Σamount − outstanding` cộng lại
 * phần âm cho ra đúng `P − outstanding`. Rải theo `occurredAt, id` (cũ nhất
 * trước). Share ÂM (điều chỉnh giảm nợ) coi như đã áp dụng đủ: `paidAmount =
 * amount`, PAID — nó chỉ làm nhỏ số phải trả chứ không cần "trả".
 */
export function projectShares(shares: ProjectableShare[], outstanding: number): ProjectedShare[] {
  const ordered = [...shares].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || compareIds(a.id, b.id)
  );
  const positiveTotal = ordered.reduce((sum, s) => sum + Math.max(0, s.amount), 0);
  let budget = Math.max(0, positiveTotal - Math.max(0, outstanding));

  return ordered.map((s) => {
    if (s.amount <= 0) return { id: s.id, paidAmount: s.amount, status: "PAID" };
    const paid = Math.min(s.amount, budget);
    budget -= paid;
    const status: ShareProjectionStatus = paid === 0 ? "UNPAID" : paid >= s.amount ? "PAID" : "PARTIAL";
    return { id: s.id, paidAmount: paid, status };
  });
}
